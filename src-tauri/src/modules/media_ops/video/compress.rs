use super::VideoProgress;
use crate::helpers::find_unique_path;
use crate::modules::error::{AppError, Result};
use crate::modules::tool_ops::find_ffmpeg_path;

/// 인코더 후보 (라벨은 에러 메시지용)
struct EncoderAttempt {
    label: &'static str,
    video_args: Vec<String>,
}

/// 품질별 인코더 후보 체인 구성.
/// 번들 FFmpeg는 LGPL 빌드(libx264/libx265 미포함)이므로 OS 하드웨어 인코더를 1순위로 사용하고,
/// GPL 인코더는 시스템/다운로드 ffmpeg(GPL 빌드)가 잡혔을 때를 위한 폴백으로 둔다.
fn encoder_candidates(quality: &str) -> Vec<EncoderAttempt> {
    let mut list: Vec<EncoderAttempt> = Vec::new();

    #[cfg(target_os = "macos")]
    {
        // VideoToolbox 품질 파라미터: Apple Silicon은 상수 품질(-q:v, 1~100 높을수록 좋음),
        // Intel HW는 -q:v 미지원이라 비트레이트로 지정
        let (qv, bv) = match quality {
            "low" => ("40", "2M"),
            "high" => ("65", "8M"),
            _ => ("55", "4M"), // medium (기본)
        };
        let rate_args: Vec<String> = if cfg!(target_arch = "aarch64") {
            vec!["-q:v".into(), qv.into()]
        } else {
            vec!["-b:v".into(), bv.into()]
        };

        // 1순위: HEVC HW 인코딩 (기존과 동일하게 macOS는 H.265 유지)
        let mut hevc: Vec<String> = vec!["-c:v".into(), "hevc_videotoolbox".into()];
        hevc.extend(rate_args.iter().cloned());
        hevc.extend(["-tag:v".into(), "hvc1".into()]);
        list.push(EncoderAttempt {
            label: "hevc_videotoolbox",
            video_args: hevc,
        });

        // 2순위: H.264 HW 인코딩
        let mut h264: Vec<String> = vec!["-c:v".into(), "h264_videotoolbox".into()];
        h264.extend(rate_args);
        list.push(EncoderAttempt {
            label: "h264_videotoolbox",
            video_args: h264,
        });

        // 3순위: libx265 (GPL 빌드 ffmpeg가 잡힌 경우만 동작)
        let crf = match quality {
            "low" => "32",
            "high" => "22",
            _ => "28",
        };
        list.push(EncoderAttempt {
            label: "libx265",
            video_args: vec![
                "-c:v".into(),
                "libx265".into(),
                "-crf".into(),
                crf.into(),
                "-preset".into(),
                "medium".into(),
                "-tag:v".into(),
                "hvc1".into(),
            ],
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Windows: WebView2가 HEVC 미지원이므로 H.264 유지
        let bv = match quality {
            "low" => "2M",
            "high" => "8M",
            _ => "4M", // medium (기본)
        };

        // 1순위: Media Foundation HW/OS 인코더 (LGPL 빌드 포함, 특허는 OS 벤더 라이선스)
        list.push(EncoderAttempt {
            label: "h264_mf",
            video_args: vec!["-c:v".into(), "h264_mf".into(), "-b:v".into(), bv.into()],
        });

        // 2순위: libx264 (GPL 빌드 ffmpeg가 잡힌 경우만 동작)
        let crf = match quality {
            "low" => "28",
            "high" => "18",
            _ => "23",
        };
        list.push(EncoderAttempt {
            label: "libx264",
            video_args: vec![
                "-c:v".into(),
                "libx264".into(),
                "-crf".into(),
                crf.into(),
                "-preset".into(),
                "medium".into(),
            ],
        });

        // 3순위: mpeg4 (모든 빌드에 존재하는 최후 폴백)
        let qv = match quality {
            "low" => "8",
            "high" => "3",
            _ => "5",
        };
        list.push(EncoderAttempt {
            label: "mpeg4",
            video_args: vec!["-c:v".into(), "mpeg4".into(), "-q:v".into(), qv.into()],
        });
    }

    list
}

/// 단일 인코더로 인코딩 시도. 실패 시 stderr 요약을 Err로 반환.
fn run_encode_attempt(
    ffmpeg_path: &std::path::Path,
    input: &str,
    output_str: &str,
    output_path: &std::path::Path,
    hwaccel_args: &[String],
    video_args: &[String],
    on_progress: &tauri::ipc::Channel<VideoProgress>,
) -> std::result::Result<(), String> {
    let mut cmd = std::process::Command::new(ffmpeg_path);
    cmd.arg("-y");
    cmd.args(hwaccel_args); // 입력 옵션이므로 -i 앞에 위치해야 함
    cmd.args(["-i", input]);
    cmd.args(video_args);
    cmd.args(["-c:a", "aac", "-b:a", "128k"]);
    cmd.args(["-progress", "pipe:1"]);
    cmd.arg(output_str);

    // Windows: 콘솔 창 숨기기 (CREATE_NO_WINDOW)
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("실행 실패: {e}"))?;

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

    let status = child.wait().map_err(|e| format!("대기 실패: {e}"))?;
    let _ = progress_thread.join();
    let stderr_output = stderr_thread.join().unwrap_or_default();

    if !status.success() {
        let _ = std::fs::remove_file(output_path);
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
        return Err(err_msg);
    }

    if !output_path.exists() {
        return Err(format!(
            "ffmpeg가 출력 파일을 생성하지 않았습니다. stderr: {}",
            stderr_output.lines().last().unwrap_or("(없음)")
        ));
    }

    Ok(())
}

pub async fn compress_video(
    input: String,
    quality: String,
    scale_percent: Option<u32>,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String> {
    // 출력 파일명: {이름}_comp.{확장자}, 충돌 시 _comp_2, _comp_3 ...
    let input_path = std::path::Path::new(&input);
    let stem = input_path.file_stem().unwrap_or_default().to_string_lossy();
    let ext = input_path.extension().unwrap_or_default().to_string_lossy();
    let parent = input_path.parent().unwrap_or(std::path::Path::new("."));

    let output_path = find_unique_path(parent, &stem, "_comp", &format!(".{}", ext));
    let output_str = output_path.to_string_lossy().to_string();

    // ffmpeg 경로 결정 (번들 → 다운로드본 → 패키지 관리자 → 시스템 PATH)
    let ffmpeg_path = find_ffmpeg_path().ok_or_else(|| AppError::ToolNotFound {
        tool: "FFmpeg".to_string(),
    })?;

    // 크기 축소 필터: 100% 미만일 때만 적용, 인코더 호환을 위해 짝수 해상도로 보정
    let scale_filter: Option<String> = match scale_percent {
        Some(p) if p > 0 && p < 100 => {
            let factor = p as f64 / 100.0;
            Some(format!(
                "scale=trunc(iw*{factor}/2)*2:trunc(ih*{factor}/2)*2:flags=lanczos"
            ))
        }
        _ => None,
    };

    // 하드웨어 디코딩 인자 — 디코드가 CPU(특히 Rosetta 환경)에서 병목이 되는 것을 방지.
    // 인코더와 독립적으로 동작하며, HW 디코드 초기화가 불가능한 환경을 위해 실패 시 SW 디코드로 재시도한다.
    #[cfg(target_os = "macos")]
    let hw_args: Vec<String> = vec!["-hwaccel".into(), "videotoolbox".into()];
    #[cfg(not(target_os = "macos"))]
    let hw_args: Vec<String> = vec!["-hwaccel".into(), "d3d11va".into()];
    let no_hw_args: Vec<String> = Vec::new();

    // 인코더 후보를 순서대로 시도 — 앞 순서 실패(빌드에 인코더 없음 등) 시 다음 후보로 폴백
    let mut errors: Vec<String> = Vec::new();
    for attempt in encoder_candidates(&quality) {
        let mut video_args = attempt.video_args.clone();
        if let Some(vf) = &scale_filter {
            video_args.push("-vf".into());
            video_args.push(vf.clone());
        }
        // HW 디코드 우선, 실패 시 같은 인코더로 SW 디코드 재시도
        for hwaccel_args in [&hw_args, &no_hw_args] {
            match run_encode_attempt(
                &ffmpeg_path,
                &input,
                &output_str,
                &output_path,
                hwaccel_args,
                &video_args,
                &on_progress,
            ) {
                Ok(()) => return Ok(output_str),
                Err(e) => {
                    let mode = if hwaccel_args.is_empty() { "sw" } else { "hw" };
                    eprintln!("⚠️ 인코더 {} ({mode} 디코드) 실패: {e}", attempt.label);
                    errors.push(format!("[{}/{mode}] {e}", attempt.label));
                }
            }
        }
    }

    Err(AppError::VideoProcessing(errors.join(" / ")))
}
