//! 비디오 압축/편집/변환 처리 모듈

use crate::helpers::find_unique_path;
use crate::modules::error::{AppError, Result};
use crate::modules::tool_ops::find_ffmpeg_path;

#[derive(Clone, serde::Serialize)]
pub struct VideoProgress {
    pub percent: f32,
    pub speed: String,
    pub fps: f32,
}

#[tauri::command]
pub async fn compress_video(
    input: String,
    quality: String,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String> {
    // 출력 파일명: {이름}_comp.{확장자}, 충돌 시 _comp_2, _comp_3 ...
    let input_path = std::path::Path::new(&input);
    let stem = input_path.file_stem().unwrap_or_default().to_string_lossy();
    let ext = input_path.extension().unwrap_or_default().to_string_lossy();
    let parent = input_path.parent().unwrap_or(std::path::Path::new("."));

    let output_path = find_unique_path(parent, &stem, "_comp", &format!(".{}", ext));
    let output_str = output_path.to_string_lossy().to_string();

    // ffmpeg 경로 결정 (sidecar → 시스템 PATH 순)
    let ffmpeg_path = find_ffmpeg_path().ok_or_else(|| AppError::ToolNotFound {
        tool: "FFmpeg".to_string(),
    })?;

    // 품질별 CRF 설정: low(보통)=높은CRF, medium(좋은)=중간CRF, high(최고)=낮은CRF
    // macOS: H.265(HEVC), Windows: H.264(AVC) — WebView2 HEVC 미지원
    let codec_args: Vec<String> = {
        #[cfg(target_os = "macos")]
        let (codec, tag_args, crf) = match quality.as_str() {
            "low" => ("libx265", vec!["-tag:v", "hvc1"], "32"),
            "high" => ("libx265", vec!["-tag:v", "hvc1"], "22"),
            _ => ("libx265", vec!["-tag:v", "hvc1"], "28"), // medium (기본)
        };
        #[cfg(not(target_os = "macos"))]
        let (codec, tag_args, crf) = match quality.as_str() {
            "low" => ("libx264", vec![] as Vec<&str>, "28"),
            "high" => ("libx264", vec![] as Vec<&str>, "18"),
            _ => ("libx264", vec![] as Vec<&str>, "23"), // medium (기본)
        };
        let mut args = vec![
            "-c:v".to_string(),
            codec.to_string(),
            "-crf".to_string(),
            crf.to_string(),
            "-preset".to_string(),
            "medium".to_string(),
            "-c:a".to_string(),
            "aac".to_string(),
            "-b:a".to_string(),
            "128k".to_string(),
        ];
        for t in tag_args {
            args.push(t.to_string());
        }
        args
    };

    let mut cmd = std::process::Command::new(&ffmpeg_path);
    cmd.args(&["-y", "-i", &input]);
    cmd.args(&codec_args);
    cmd.args(&["-progress", "pipe:1"]);
    cmd.arg(&output_str);

    // Windows: 콘솔 창 숨기기 (CREATE_NO_WINDOW)
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| AppError::ToolExecution {
            tool: "FFmpeg".to_string(),
            reason: e.to_string(),
        })?;

    // stdout에서 -progress 출력 파싱 (별도 스레드)
    let stdout = child.stdout.take();
    let on_progress_clone = on_progress.clone();
    let progress_thread = std::thread::spawn(move || {
        if let Some(stdout) = stdout {
            use std::io::BufRead;
            let reader = std::io::BufReader::new(stdout);
            for line in reader.lines().flatten() {
                // -progress 출력: "out_time_ms=12345678" 형식
                if let Some(val) = line.strip_prefix("out_time_ms=") {
                    if let Ok(us) = val.parse::<i64>() {
                        let secs = us as f32 / 1_000_000.0;
                        let _ = on_progress_clone.send(VideoProgress {
                            percent: secs,
                            speed: String::new(),
                            fps: 0.0,
                        });
                    }
                } else if let Some(val) = line.strip_prefix("speed=") {
                    let speed_str = val.trim().to_string();
                    let _ = on_progress_clone.send(VideoProgress {
                        percent: -2.0, // 스피드만 업데이트 신호
                        speed: speed_str,
                        fps: 0.0,
                    });
                }
            }
        }
    });

    // stderr 캡처 (에러 메시지용)
    let stderr = child.stderr.take();
    let stderr_thread = std::thread::spawn(move || {
        let mut output = String::new();
        if let Some(mut stderr) = stderr {
            use std::io::Read;
            let _ = stderr.read_to_string(&mut output);
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
        // stderr에서 의미있는 에러 추출
        let err_msg = stderr_output
            .lines()
            .filter(|l| {
                l.contains("Error")
                    || l.contains("error")
                    || l.contains("Unknown")
                    || l.contains("not found")
            })
            .last()
            .unwrap_or("ffmpeg 인코딩 실패")
            .to_string();
        return Err(AppError::VideoProcessing(err_msg));
    }

    if !output_path.exists() {
        return Err(AppError::VideoProcessing(format!(
            "ffmpeg가 출력 파일을 생성하지 않았습니다. stderr: {}",
            stderr_output.lines().last().unwrap_or("(없음)")
        )));
    }

    Ok(output_str)
}

// ffmpeg 시간 문자열 "HH:MM:SS.xx" → 초(f32) 파싱
#[allow(dead_code)]
fn parse_ffmpeg_time(time: &str) -> f32 {
    let parts: Vec<&str> = time.split(':').collect();
    if parts.len() == 3 {
        let h: f32 = parts[0].parse().unwrap_or(0.0);
        let m: f32 = parts[1].parse().unwrap_or(0.0);
        let s: f32 = parts[2].parse().unwrap_or(0.0);
        h * 3600.0 + m * 60.0 + s
    } else {
        0.0
    }
}

// --- 동영상 구간 내보내기 (trim) ---
#[tauri::command]
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
#[tauri::command]
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

// --- 동영상 이어붙이기 (concat) ---
#[tauri::command]
pub async fn concat_videos(
    paths: Vec<String>,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String> {
    if paths.is_empty() {
        return Err(AppError::InvalidInput(
            "이어붙일 파일이 없습니다.".to_string(),
        ));
    }

    // 출력 파일: 첫 번째 파일 기준
    let first_path = std::path::Path::new(&paths[0]);
    let stem = first_path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let ext = first_path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let parent = first_path.parent().unwrap_or(std::path::Path::new("."));

    let output_path = find_unique_path(parent, &stem, "_merged", &format!(".{}", ext));
    let output_str = output_path.to_string_lossy().to_string();

    let ffmpeg_path = find_ffmpeg_path().ok_or_else(|| AppError::ToolNotFound {
        tool: "FFmpeg".to_string(),
    })?;

    // 임시 concat 리스트 파일 생성
    let pid = std::process::id();
    let tmp_dir = std::env::temp_dir().join(format!("qf_concat_{}", pid));
    std::fs::create_dir_all(&tmp_dir)?;
    let list_file = tmp_dir.join("list.txt");

    // concat 리스트 파일 내용 조립 (각 경로 이스케이프)
    let list_content: String = paths
        .iter()
        .map(|p| format!("file '{}'", p.replace('\'', "'\\''")))
        .collect::<Vec<_>>()
        .join("\n");
    std::fs::write(&list_file, &list_content)?;

    // 재인코딩 방식: filter_complex concat (코덱/해상도 다른 영상 호환)
    let input_args: Vec<String> = paths
        .iter()
        .flat_map(|p| vec!["-i".to_string(), p.clone()])
        .collect();
    let n = paths.len();
    let filter_str = format!(
        "{}concat=n={}:v=1:a=1[outv][outa]",
        (0..n)
            .map(|i| format!("[{i}:v:0][{i}:a:0]"))
            .collect::<String>(),
        n
    );

    let mut cmd = std::process::Command::new(&ffmpeg_path);
    let mut args: Vec<String> = vec!["-y".to_string()];
    args.extend(input_args);
    args.extend([
        "-filter_complex".to_string(),
        filter_str,
        "-map".to_string(),
        "[outv]".to_string(),
        "-map".to_string(),
        "[outa]".to_string(),
        "-c:v".to_string(),
        "libx264".to_string(),
        "-crf".to_string(),
        "18".to_string(),
        "-preset".to_string(),
        "medium".to_string(),
        "-c:a".to_string(),
        "aac".to_string(),
        "-b:a".to_string(),
        "128k".to_string(),
        "-progress".to_string(),
        "pipe:1".to_string(),
        output_str.clone(),
    ]);
    cmd.args(&args);

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
                // out_time_ms 값을 초로 변환해 percent 필드에 전달
                if let Some(val) = line.strip_prefix("out_time_ms=") {
                    if let Ok(us) = val.parse::<i64>() {
                        let secs = us as f32 / 1_000_000.0;
                        let _ = on_progress_clone.send(VideoProgress {
                            percent: secs, // 프론트엔드에서 총 길이 대비 계산
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

    // 임시 파일 정리
    let _ = std::fs::remove_dir_all(&tmp_dir);

    if !status.success() {
        let _ = std::fs::remove_file(&output_path);
        let err_msg = stderr_output
            .lines()
            .filter(|l| l.contains("Error") || l.contains("error") || l.contains("not found"))
            .last()
            .unwrap_or("ffmpeg concat 실패")
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

// --- 동영상 구간을 GIF로 변환 ---
#[tauri::command]
pub async fn video_to_gif(
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
    let parent = input_path.parent().unwrap_or(std::path::Path::new("."));

    let output_path = find_unique_path(parent, &stem, "", ".gif");
    let output_str = output_path.to_string_lossy().to_string();

    let ffmpeg_path = find_ffmpeg_path().ok_or_else(|| AppError::ToolNotFound {
        tool: "FFmpeg".to_string(),
    })?;

    // 구간 길이
    let duration = (end_sec - start_sec).max(0.001) as f32;

    // 팔레트 생성 → GIF 인코딩 2단계 프로세스로 고품질 GIF 생성
    let pid = std::process::id();
    let tmp_dir = std::env::temp_dir().join(format!("qf_gif_{}", pid));
    std::fs::create_dir_all(&tmp_dir)?;
    let palette_path = tmp_dir.join("palette.png");

    // 필터 체인 구성: 크롭(옵션) → 스케일 → 팔레트/gif
    let mut filters = Vec::new();

    // 크롭 필터 (지정된 경우)
    if let (Some(x), Some(y), Some(w), Some(h)) = (crop_x, crop_y, crop_w, crop_h) {
        filters.push(format!("crop={}:{}:{}:{}", w, h, x, y));
    }

    // FPS 제한 + 해상도 축소 (GIF 용량 감소)
    filters.push("fps=15".to_string());
    filters.push("scale=480:-1:flags=lanczos".to_string());

    let base_filter = filters.join(",");

    // 1단계: 팔레트 생성 (128색으로 제한하여 용량 감소)
    let palette_filter = format!("{},palettegen=max_colors=128:stats_mode=diff", base_filter);
    let mut cmd1 = std::process::Command::new(&ffmpeg_path);
    cmd1.args(&[
        "-y",
        "-ss",
        &start_sec.to_string(),
        "-to",
        &end_sec.to_string(),
        "-i",
        &input,
        "-vf",
        &palette_filter,
        &palette_path.to_string_lossy(),
    ]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd1.creation_flags(0x08000000);
    }

    let status1 = cmd1
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| AppError::ToolExecution {
            tool: "FFmpeg".to_string(),
            reason: format!("실행 실패 (팔레트): {}", e),
        })?
        .wait()
        .map_err(|e| AppError::ToolExecution {
            tool: "FFmpeg".to_string(),
            reason: format!("대기 실패 (팔레트): {}", e),
        })?;

    if !status1.success() || !palette_path.exists() {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err(AppError::VideoProcessing("팔레트 생성 실패".to_string()));
    }

    // 2단계: GIF 인코딩 (생성된 팔레트 사용, 디더링 최적화)
    // dither=bayer:bayer_scale=3 - 적당한 디더링으로 파일 크기와 품질 균형
    // diff_mode=rectangle - 프레임 간 차이만 기록하여 용량 감소
    let gif_filter = format!(
        "{} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
        base_filter
    );
    let mut cmd2 = std::process::Command::new(&ffmpeg_path);
    cmd2.args(&[
        "-y",
        "-ss",
        &start_sec.to_string(),
        "-to",
        &end_sec.to_string(),
        "-i",
        &input,
        "-i",
        &palette_path.to_string_lossy(),
        "-lavfi",
        &gif_filter,
        "-progress",
        "pipe:1",
        &output_str,
    ]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd2.creation_flags(0x08000000);
    }

    let mut child = cmd2
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| AppError::ToolExecution {
            tool: "FFmpeg".to_string(),
            reason: format!("실행 실패 (GIF): {}", e),
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
                        let percent = (secs / duration * 100.0).min(100.0);
                        let _ = on_progress_clone.send(VideoProgress {
                            percent,
                            speed: String::new(),
                            fps: 0.0,
                        });
                    }
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

    // 임시 파일 정리
    let _ = std::fs::remove_dir_all(&tmp_dir);

    if !status.success() {
        let _ = std::fs::remove_file(&output_path);
        let err_msg = stderr_output
            .lines()
            .filter(|l| l.contains("Error") || l.contains("error") || l.contains("not found"))
            .last()
            .unwrap_or("GIF 변환 실패")
            .to_string();
        return Err(AppError::VideoProcessing(err_msg));
    }

    if !output_path.exists() {
        return Err(AppError::VideoProcessing(
            "ffmpeg가 GIF 파일을 생성하지 않았습니다.".to_string(),
        ));
    }

    Ok(output_str)
}
