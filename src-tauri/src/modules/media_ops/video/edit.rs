use super::VideoProgress;
use crate::helpers::find_unique_path;
use crate::modules::error::{AppError, Result};
use crate::modules::tool_ops::find_ffmpeg_path;

fn format_seconds(sec: f64) -> String {
    let mut value = format!("{:.6}", sec.max(0.0));
    while value.contains('.') && value.ends_with('0') {
        value.pop();
    }
    if value.ends_with('.') {
        value.pop();
    }
    value
}

fn supports_faststart(output: &str) -> bool {
    std::path::Path::new(output)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "mp4" | "m4v" | "mov"))
        .unwrap_or(false)
}

fn reencoded_video_output_extension(_input_ext: &str) -> &'static str {
    ".mp4"
}

fn build_timing_filter(name: &str, start_sec: Option<f64>, duration_sec: Option<f64>) -> String {
    let start = format_seconds(start_sec.unwrap_or(0.0));
    match duration_sec {
        Some(duration) => format!(
            "{}=start={}:duration={}",
            name,
            start,
            format_seconds(duration)
        ),
        None => format!("{}=start={}", name, start),
    }
}

fn build_video_filter(
    start_sec: Option<f64>,
    duration_sec: Option<f64>,
    crop: Option<(i32, i32, i32, i32)>,
) -> String {
    let mut filters = vec![
        build_timing_filter("trim", start_sec, duration_sec),
        "setpts=PTS-STARTPTS".to_string(),
    ];
    if let Some((x, y, w, h)) = crop {
        filters.push(format!("crop={}:{}:{}:{}", w, h, x, y));
    }
    filters.join(",")
}

fn build_audio_filter(start_sec: Option<f64>, duration_sec: Option<f64>) -> String {
    [
        build_timing_filter("atrim", start_sec, duration_sec),
        "asetpts=PTS-STARTPTS".to_string(),
    ]
    .join(",")
}

fn append_reencode_args(
    args: &mut Vec<String>,
    video_filter: String,
    audio_filter: String,
    output: &str,
) {
    args.extend([
        "-map".to_string(),
        "0:v:0".to_string(),
        "-map".to_string(),
        "0:a?".to_string(),
    ]);

    args.extend([
        "-vf".to_string(),
        video_filter,
        "-af".to_string(),
        audio_filter,
        "-c:v".to_string(),
        "libx264".to_string(),
        "-crf".to_string(),
        "18".to_string(),
        "-preset".to_string(),
        "medium".to_string(),
        "-pix_fmt".to_string(),
        "yuv420p".to_string(),
        "-c:a".to_string(),
        "aac".to_string(),
        "-b:a".to_string(),
        "128k".to_string(),
    ]);

    if supports_faststart(output) {
        args.extend(["-movflags".to_string(), "+faststart".to_string()]);
    }
}

fn build_trim_args(
    input: &str,
    output: &str,
    start_sec: f64,
    end_sec: f64,
    crop: Option<(i32, i32, i32, i32)>,
) -> Vec<String> {
    let duration = (end_sec - start_sec).max(0.001);
    let mut args = vec!["-y".to_string(), "-i".to_string(), input.to_string()];
    append_reencode_args(
        &mut args,
        build_video_filter(Some(start_sec), Some(duration), crop),
        build_audio_filter(Some(start_sec), Some(duration)),
        output,
    );
    args.push(output.to_string());
    args
}

fn build_cut_part_args(
    input: &str,
    output: &str,
    start_sec: Option<f64>,
    duration_sec: Option<f64>,
) -> Vec<String> {
    let mut args = vec!["-y".to_string(), "-i".to_string(), input.to_string()];
    append_reencode_args(
        &mut args,
        build_video_filter(start_sec, duration_sec, None),
        build_audio_filter(start_sec, duration_sec),
        output,
    );
    args.push(output.to_string());
    args
}

fn add_progress_before_output(args: &mut Vec<String>) {
    if let Some(output) = args.pop() {
        args.extend(["-progress".to_string(), "pipe:1".to_string()]);
        args.push(output);
    }
}

fn path_has_content(path: &std::path::Path) -> bool {
    path.exists()
        && std::fs::metadata(path)
            .map(|metadata| metadata.len() > 0)
            .unwrap_or(false)
}

fn ffmpeg_output_is_empty(stderr: &str) -> bool {
    stderr.contains("Output file is empty") || stderr.contains("nothing was encoded")
}

#[derive(Default)]
struct ProgressEmitState {
    last_visible_percent: Option<i32>,
}

impl ProgressEmitState {
    fn should_emit(&mut self, percent: f32) -> bool {
        let visible_percent = percent.clamp(0.0, 100.0).round() as i32;
        if self.last_visible_percent == Some(visible_percent) {
            return false;
        }
        self.last_visible_percent = Some(visible_percent);
        true
    }
}

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

    let output_path = find_unique_path(
        parent,
        &stem,
        "_trim",
        reencoded_video_output_extension(&ext),
    );
    let output_str = output_path.to_string_lossy().to_string();

    let ffmpeg_path = find_ffmpeg_path().ok_or_else(|| AppError::ToolNotFound {
        tool: "FFmpeg".to_string(),
    })?;

    // 구간 길이 (초) — 진행률 계산 기준
    let duration = (end_sec - start_sec).max(0.001) as f32;

    let crop = match (crop_x, crop_y, crop_w, crop_h) {
        (Some(x), Some(y), Some(w), Some(h)) => Some((x, y, w, h)),
        _ => None,
    };
    let mut args = build_trim_args(&input, &output_str, start_sec, end_sec, crop);
    add_progress_before_output(&mut args);

    let mut cmd = std::process::Command::new(&ffmpeg_path);
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
            let mut progress_state = ProgressEmitState::default();
            for line in reader.lines().flatten() {
                if let Some(val) = line.strip_prefix("out_time_ms=") {
                    if let Ok(us) = val.parse::<i64>() {
                        let secs = us as f32 / 1_000_000.0;
                        // 퍼센트: 현재 위치 / 구간 길이
                        let percent = (secs / duration * 100.0).min(100.0);
                        if progress_state.should_emit(percent)
                            && on_progress_clone
                                .send(VideoProgress {
                                    percent,
                                    speed: String::new(),
                                    fps: 0.0,
                                })
                                .is_err()
                        {
                            break;
                        }
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

    if !path_has_content(&output_path) {
        return Err(AppError::VideoProcessing(
            "ffmpeg가 출력 파일을 생성하지 않았습니다.".to_string(),
        ));
    }

    Ok(output_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trim_args_reset_video_and_audio_timestamps_with_filters() {
        let args = build_trim_args("input.mp4", "output.mp4", 2.2, 5.2, None);

        assert!(!args.windows(2).any(|pair| pair == ["-c", "copy"]));
        assert!(args.windows(2).any(|pair| pair == ["-c:v", "libx264"]));
        assert!(args.windows(2).any(|pair| pair == ["-c:a", "aac"]));
        assert!(!args.iter().any(|arg| arg == "-ss"));
        assert!(!args.iter().any(|arg| arg == "-t"));
        assert!(args
            .windows(2)
            .any(|pair| { pair[0] == "-vf" && pair[1].contains("trim=start=2.2:duration=3") }));
        assert!(args
            .windows(2)
            .any(|pair| { pair[0] == "-vf" && pair[1].contains("setpts=PTS-STARTPTS") }));
        assert!(args
            .windows(2)
            .any(|pair| { pair[0] == "-af" && pair[1].contains("atrim=start=2.2:duration=3") }));
        assert!(args
            .windows(2)
            .any(|pair| { pair[0] == "-af" && pair[1].contains("asetpts=PTS-STARTPTS") }));
    }

    #[test]
    fn cut_part_args_reset_video_and_audio_timestamps_with_filters() {
        let args = build_cut_part_args("input.mp4", "part2.mp4", Some(4.2), None);

        assert!(!args.windows(2).any(|pair| pair == ["-c", "copy"]));
        assert!(args.windows(2).any(|pair| pair == ["-c:v", "libx264"]));
        assert!(args.windows(2).any(|pair| pair == ["-c:a", "aac"]));
        assert!(args.windows(2).any(|pair| pair == ["-map", "0:a?"]));
        assert!(!args.iter().any(|arg| arg == "-ss"));
        assert!(args
            .windows(2)
            .any(|pair| { pair[0] == "-vf" && pair[1].contains("trim=start=4.2") }));
        assert!(args
            .windows(2)
            .any(|pair| { pair[0] == "-vf" && pair[1].contains("setpts=PTS-STARTPTS") }));
        assert!(args
            .windows(2)
            .any(|pair| { pair[0] == "-af" && pair[1].contains("atrim=start=4.2") }));
        assert!(args
            .windows(2)
            .any(|pair| { pair[0] == "-af" && pair[1].contains("asetpts=PTS-STARTPTS") }));
    }

    #[test]
    fn reencoded_edit_outputs_use_mp4_container() {
        assert_eq!(reencoded_video_output_extension("webm"), ".mp4");
        assert_eq!(reencoded_video_output_extension("avi"), ".mp4");
        assert_eq!(reencoded_video_output_extension("mp4"), ".mp4");
    }

    #[test]
    fn progress_emit_state_only_emits_visible_percent_changes() {
        let mut state = ProgressEmitState::default();

        assert!(state.should_emit(0.0));
        assert!(!state.should_emit(0.4));
        assert!(state.should_emit(0.6));
        assert!(!state.should_emit(1.2));
        assert!(state.should_emit(100.0));
    }
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

    let output_path = find_unique_path(
        parent,
        &stem,
        "_cut",
        reencoded_video_output_extension(&ext),
    );
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
    let mut has_part1 = false;
    if start_sec > 0.001 {
        send_progress(0, 0.0);
        let part1_str = part1.to_string_lossy().to_string();
        let args = build_cut_part_args(&input, &part1_str, None, Some(start_sec));
        let mut cmd = std::process::Command::new(&ffmpeg_path);
        cmd.args(&args);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let output = cmd
            .stdout(std::process::Stdio::null())
            .output()
            .map_err(|e| AppError::ToolExecution {
                tool: "FFmpeg".to_string(),
                reason: format!("앞 부분 추출 실행 실패: {}", e),
            })?;
        let stderr_output = String::from_utf8_lossy(&output.stderr);
        if !output.status.success() && !ffmpeg_output_is_empty(&stderr_output) {
            let _ = std::fs::remove_dir_all(&tmp_dir);
            return Err(AppError::VideoProcessing(
                "ffmpeg 앞 부분 추출 실패".to_string(),
            ));
        }
        has_part1 = !ffmpeg_output_is_empty(&stderr_output) && path_has_content(&part1);
        send_progress(0, 1.0);
    }

    // --- 뒷 부분 추출 (end_sec ~ 끝) ---
    // end_sec가 충분히 크면 뒷 부분이 없을 수 있으므로 결과 파일 크기로 판단
    send_progress(1, 0.0);
    let has_part2;
    {
        let part2_str = part2.to_string_lossy().to_string();
        let args = build_cut_part_args(&input, &part2_str, Some(end_sec), None);
        let mut cmd = std::process::Command::new(&ffmpeg_path);
        cmd.args(&args);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let output = cmd
            .stdout(std::process::Stdio::null())
            .output()
            .map_err(|e| AppError::ToolExecution {
                tool: "FFmpeg".to_string(),
                reason: format!("뒷 부분 추출 실행 실패: {}", e),
            })?;
        let stderr_output = String::from_utf8_lossy(&output.stderr);
        if !output.status.success() && !ffmpeg_output_is_empty(&stderr_output) {
            let _ = std::fs::remove_dir_all(&tmp_dir);
            return Err(AppError::VideoProcessing(
                "ffmpeg 뒷 부분 추출 실패".to_string(),
            ));
        }
        has_part2 = !ffmpeg_output_is_empty(&stderr_output) && path_has_content(&part2);
    }
    // 뒷 부분이 비어있으면 (0바이트) 없는 것으로 간주
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

    if !path_has_content(&output_path) {
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
