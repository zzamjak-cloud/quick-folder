use super::VideoProgress;
use crate::helpers::find_unique_path;
use crate::modules::error::{AppError, Result};
use crate::modules::tool_ops::find_ffmpeg_path;

// --- 동영상 이어붙이기 (concat) ---
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
