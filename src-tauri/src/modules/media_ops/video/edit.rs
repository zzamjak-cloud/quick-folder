use super::VideoProgress;
use crate::helpers::find_unique_path;
use crate::modules::error::{AppError, Result};
use crate::modules::tool_ops::find_ffmpeg_path;

// --- 동영상 구간 내보내기 (trim) ---
pub async fn trim_video(
    input: String,
    start_sec: f64,
    end_sec: f64,
    crop_x: Option<i32>,
    crop_y: Option<i32>,
    crop_w: Option<i32>,
    crop_h: Option<i32>,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String> {
    let input_path = std::path::Path::new(&input);
    let stem = input_path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let ext = input_path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let parent = input_path.parent().unwrap_or(std::path::Path::new("."));

    let output_path = find_unique_path(parent, &stem, "_trim", &format!(".{}", ext));
    let output_str = output_path.to_string_lossy().to_string();

    let ffmpeg_path = find_ffmpeg_path().ok_or_else(|| AppError::ToolNotFound {
        tool: "FFmpeg".to_string(),
    })?;

    // 구간 길이 (초) — 진행률 계산 기준
    let duration = (end_sec - start_sec).max(0.001) as f32;

    let mut cmd = std::process::Command::new(&ffmpeg_path);
    cmd.arg("-y").arg("-i").arg(&input);
    cmd.arg("-ss").arg(start_sec.to_string());
    cmd.arg("-to").arg(end_sec.to_string());

    // 크롭 옵션이 있으면 필터 사용, 없으면 스트림 복사
    if let (Some(x), Some(y), Some(w), Some(h)) = (crop_x, crop_y, crop_w, crop_h) {
        cmd.arg("-vf").arg(format!("crop={}:{}:{}:{}", w, h, x, y));
        cmd.arg("-c:a").arg("copy");
    } else {
        cmd.arg("-c").arg("copy");
    }

    cmd.arg("-progress").arg("pipe:1");
    cmd.arg(&output_str);

    // Windows: 콘솔 창 숨기기
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| AppError::ToolExecution {
            tool: "FFmpeg".to_string(),
            reason: e.to_string(),
        })?;

    let stdout = child.stdout.take();
    let on_progress_clone = on_progress.clone();
    let progress_thread = std::thread::spawn(move || {
        if let Some(stdout) = stdout {
            use std::io::BufRead;
            let reader = std::io::BufReader::new(stdout);
            for line in reader.lines().flatten() {
                if let Some(val) = line.strip_prefix("out_time_ms=") {
                    if let Ok(us) = val.parse::<i64>() {
                        let secs = us as f32 / 1_000_000.0;
                        // 퍼센트: 현재 위치 / 구간 길이
                        let percent = (secs / duration * 100.0).min(100.0);
                        let _ = on_progress_clone.send(VideoProgress {
                            percent,
                            speed: String::new(),
                            fps: 0.0,
                        });
                    }
                } else if let Some(val) = line.strip_prefix("speed=") {
                    let _ = on_progress_clone.send(VideoProgress {
                        percent: -2.0,
                        speed: val.trim().to_string(),
                        fps: 0.0,
                    });
                }
            }
        }
    });

    let stderr = child.stderr.take();
    let stderr_thread = std::thread::spawn(move || {
        let mut output = String::new();
        if let Some(mut s) = stderr {
            use std::io::Read;
            let _ = s.read_to_string(&mut output);
        }
        output
    });

    let status = child.wait().map_err(|e| AppError::ToolExecution {
        tool: "FFmpeg".to_string(),
        reason: format!("대기 실패: {}", e),
    })?;
    let _ = progress_thread.join();
    let stderr_output = stderr_thread.join().unwrap_or_default();

    if !status.success() {
        let _ = std::fs::remove_file(&output_path);
        let err_msg = stderr_output
            .lines()
            .filter(|l| l.contains("Error") || l.contains("error") || l.contains("not found"))
            .last()
            .unwrap_or("ffmpeg 트림 실패")
            .to_string();
        return Err(AppError::VideoProcessing(err_msg));
    }

    if !output_path.exists() {
        return Err(AppError::VideoProcessing(
            "ffmpeg가 출력 파일을 생성하지 않았습니다.".to_string(),
        ));
    }

    Ok(output_str)
}

// --- 동영상 구간 삭제 후 합치기 (cut) ---
pub async fn cut_video(
    input: String,
    start_sec: f64,
    end_sec: f64,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String> {
    let input_path = std::path::Path::new(&input);
    let stem = input_path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let ext = input_path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let parent = input_path.parent().unwrap_or(std::path::Path::new("."));

    let output_path = find_unique_path(parent, &stem, "_cut", &format!(".{}", ext));
    let output_str = output_path.to_string_lossy().to_string();

    let ffmpeg_path = find_ffmpeg_path().ok_or_else(|| AppError::ToolNotFound {
        tool: "FFmpeg".to_string(),
    })?;

    // 임시 디렉토리 생성 (프로세스 ID 포함으로 충돌 방지)
    let pid = std::process::id();
    let tmp_dir = std::env::temp_dir().join(format!("qf_cut_video_{}", pid));
    std::fs::create_dir_all(&tmp_dir)?;

    // 임시 파일 경로
    let part1 = tmp_dir.join("part1.mp4");
    let part2 = tmp_dir.join("part2.mp4");
    let list_file = tmp_dir.join("list.txt");

    // 진행률 전송 헬퍼: 각 단계(앞/뒤 추출, 합치기)를 33% 씩 배분
    let send_progress = |step: u32, sub_percent: f32| {
        let base = step as f32 * 33.0;
        let _ = on_progress.send(VideoProgress {
            percent: (base + sub_percent * 33.0).min(99.0),
            speed: String::new(),
            fps: 0.0,
        });
    };

    // --- 앞 부분 추출 (0 ~ start_sec) ---
    let has_part1 = start_sec > 0.001;
    if has_part1 {
        send_progress(0, 0.0);
        let mut cmd = std::process::Command::new(&ffmpeg_path);
        cmd.args(&[
            "-y",
            "-i",
            &input,
            "-t",
            &start_sec.to_string(),
            "-c",
            "copy",
            &part1.to_string_lossy(),
        ]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let status = cmd
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| AppError::ToolExecution {
                tool: "FFmpeg".to_string(),
                reason: format!("실행 실패 (앞 부분): {}", e),
            })?
            .wait()
            .map_err(|e| AppError::ToolExecution {
                tool: "FFmpeg".to_string(),
                reason: format!("대기 실패 (앞 부분): {}", e),
            })?;
        if !status.success() {
            let _ = std::fs::remove_dir_all(&tmp_dir);
            return Err(AppError::VideoProcessing(
                "ffmpeg 앞 부분 추출 실패".to_string(),
            ));
        }
        send_progress(0, 1.0);
    }

    // --- 뒷 부분 추출 (end_sec ~ 끝) ---
    // end_sec가 충분히 크면 뒷 부분이 없을 수 있으므로 결과 파일 크기로 판단
    send_progress(1, 0.0);
    {
        let mut cmd = std::process::Command::new(&ffmpeg_path);
        cmd.args(&[
            "-y",
            "-i",
            &input,
            "-ss",
            &end_sec.to_string(),
            "-c",
            "copy",
            &part2.to_string_lossy(),
        ]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let status = cmd
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| AppError::ToolExecution {
                tool: "FFmpeg".to_string(),
                reason: format!("실행 실패 (뒷 부분): {}", e),
            })?
            .wait()
            .map_err(|e| AppError::ToolExecution {
                tool: "FFmpeg".to_string(),
                reason: format!("대기 실패 (뒷 부분): {}", e),
            })?;
        if !status.success() {
            let _ = std::fs::remove_dir_all(&tmp_dir);
            return Err(AppError::VideoProcessing(
                "ffmpeg 뒷 부분 추출 실패".to_string(),
            ));
        }
    }
    // 뒷 부분이 비어있으면 (0바이트) 없는 것으로 간주
    let has_part2 = part2.exists()
        && std::fs::metadata(&part2)
            .map(|m| m.len() > 0)
            .unwrap_or(false);
    send_progress(1, 1.0);

    // --- 합치기 ---
    send_progress(2, 0.0);

    // 케이스별 처리
    if !has_part1 && !has_part2 {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err(AppError::VideoProcessing(
            "삭제 후 남은 영상이 없습니다.".to_string(),
        ));
    } else if !has_part1 {
        // 앞 부분 없음 → 뒷 부분만 복사
        std::fs::copy(&part2, &output_path)?;
    } else if !has_part2 {
        // 뒷 부분 없음 → 앞 부분만 복사
        std::fs::copy(&part1, &output_path)?;
    } else {
        // concat 리스트 파일 작성
        let list_content = format!(
            "file '{}'\nfile '{}'",
            part1.to_string_lossy().replace('\'', "'\\''"),
            part2.to_string_lossy().replace('\'', "'\\''"),
        );
        std::fs::write(&list_file, &list_content)?;

        let mut cmd = std::process::Command::new(&ffmpeg_path);
        cmd.args(&[
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            &list_file.to_string_lossy(),
            "-c",
            "copy",
            &output_str,
        ]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let status = cmd
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| AppError::ToolExecution {
                tool: "FFmpeg".to_string(),
                reason: format!("실행 실패 (합치기): {}", e),
            })?
            .wait()
            .map_err(|e| AppError::ToolExecution {
                tool: "FFmpeg".to_string(),
                reason: format!("대기 실패 (합치기): {}", e),
            })?;
        if !status.success() {
            let _ = std::fs::remove_dir_all(&tmp_dir);
            let _ = std::fs::remove_file(&output_path);
            return Err(AppError::VideoProcessing(
                "ffmpeg concat 합치기 실패".to_string(),
            ));
        }
    }

    // 임시 파일 정리
    let _ = std::fs::remove_dir_all(&tmp_dir);

    if !output_path.exists() {
        return Err(AppError::VideoProcessing(
            "ffmpeg가 출력 파일을 생성하지 않았습니다.".to_string(),
        ));
    }

    let _ = on_progress.send(VideoProgress {
        percent: 100.0,
        speed: String::new(),
        fps: 0.0,
    });
    Ok(output_str)
}
