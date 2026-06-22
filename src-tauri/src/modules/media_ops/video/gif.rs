use super::VideoProgress;
use crate::helpers::find_unique_path;
use crate::modules::error::{AppError, Result};
use crate::modules::tool_ops::find_ffmpeg_path;

// --- 동영상 구간을 GIF로 변환 ---
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
