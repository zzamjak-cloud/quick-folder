use super::VideoProgress;
use crate::helpers::find_unique_path;
use crate::modules::error::{AppError, Result};
use crate::modules::tool_ops::find_ffmpeg_path;

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
