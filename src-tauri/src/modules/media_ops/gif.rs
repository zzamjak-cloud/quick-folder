//! GIF 압축 및 MP4 변환 처리 모듈

use crate::helpers::find_unique_path;
use crate::modules::error::{AppError, Result};
use crate::modules::tool_ops::find_ffmpeg_path;

fn apply_no_window(cmd: &mut std::process::Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = cmd;
    }
}

fn last_ffmpeg_error(stderr: &str, fallback: &str) -> String {
    stderr
        .lines()
        .filter(|line| {
            line.contains("Error")
                || line.contains("error")
                || line.contains("Invalid")
                || line.contains("not found")
        })
        .last()
        .unwrap_or(fallback)
        .to_string()
}

// GIF 압축 (용량 감소)
// quality: "high" (256색/24fps), "medium" (128색/15fps), "low" (64색/10fps)
// reduce_size: true이면 해상도 50% 축소
#[tauri::command]
pub async fn compress_gif(path: String, quality: String, reduce_size: bool) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String> {
        let input_path = std::path::Path::new(&path);
        let parent = input_path.parent().ok_or_else(|| AppError::InvalidInput("부모 디렉토리 없음".to_string()))?;
        let stem = input_path.file_stem()
            .ok_or_else(|| AppError::InvalidInput("파일명 없음".to_string()))?
            .to_string_lossy();
        let output_path = find_unique_path(parent, &stem, "_comp", ".gif");
        let ffmpeg_path = find_ffmpeg_path().ok_or_else(|| AppError::ToolNotFound { tool: "FFmpeg".to_string() })?;
        let (fps, colors, dither) = match quality.as_str() {
            "high" => (24, 256, "sierra2_4a"),
            "low" => (10, 64, "bayer:bayer_scale=5"),
            _ => (15, 128, "bayer:bayer_scale=4"),
        };

        let scale = if reduce_size {
            ",scale=trunc(iw/4)*2:trunc(ih/4)*2:flags=lanczos"
        } else {
            ""
        };
        let filter = format!(
            "[0:v]fps={}{} ,split[a][b];[a]palettegen=max_colors={}:stats_mode=diff[p];[b][p]paletteuse=dither={}:diff_mode=rectangle",
            fps, scale, colors, dither
        ).replace(" ", "");

        let mut cmd = std::process::Command::new(&ffmpeg_path);
        cmd.args(["-y", "-i", &path, "-filter_complex", &filter, "-loop", "0"]);
        cmd.arg(&output_path);
        apply_no_window(&mut cmd);

        let output = cmd.output().map_err(|e| AppError::ToolExecution {
            tool: "FFmpeg".to_string(),
            reason: e.to_string()
        })?;

        if !output.status.success() {
            let _ = std::fs::remove_file(&output_path);
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::VideoProcessing(last_ffmpeg_error(&stderr, "GIF 압축 실패")));
        }

        let input_size = std::fs::metadata(input_path)?.len();
        let output_size = std::fs::metadata(&output_path)?.len();
        if output_size >= input_size {
            let _ = std::fs::remove_file(&output_path);
            return Err(AppError::VideoProcessing(format!(
                "압축 결과가 원본보다 크거나 같습니다. 원본 {} bytes, 결과 {} bytes",
                input_size, output_size
            )));
        }

        Ok(output_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| AppError::Internal(format!("작업 실패: {}", e)))?
}

// GIF를 MP4로 변환
#[tauri::command]
pub async fn gif_to_mp4(path: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String> {
        let input_path = std::path::Path::new(&path);
        let parent = input_path
            .parent()
            .ok_or_else(|| AppError::InvalidInput("부모 디렉토리 없음".to_string()))?;
        let stem = input_path
            .file_stem()
            .ok_or_else(|| AppError::InvalidInput("파일명 없음".to_string()))?
            .to_string_lossy();
        let output_path = find_unique_path(parent, &stem, "_mp4", ".mp4");
        let ffmpeg_path = find_ffmpeg_path().ok_or_else(|| AppError::ToolNotFound {
            tool: "FFmpeg".to_string(),
        })?;

        let mut cmd = std::process::Command::new(&ffmpeg_path);
        cmd.args([
            "-y",
            "-i",
            &path,
            "-movflags",
            "+faststart",
            "-pix_fmt",
            "yuv420p",
            "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:v",
            "libx264",
            "-crf",
            "23",
            "-preset",
            "medium",
        ]);
        cmd.arg(&output_path);
        apply_no_window(&mut cmd);

        let output = cmd.output().map_err(|e| AppError::ToolExecution {
            tool: "FFmpeg".to_string(),
            reason: e.to_string(),
        })?;

        if !output.status.success() {
            let _ = std::fs::remove_file(&output_path);
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::VideoProcessing(last_ffmpeg_error(
                &stderr,
                "GIF → MP4 변환 실패",
            )));
        }

        if !output_path.exists() {
            return Err(AppError::VideoProcessing(
                "ffmpeg가 MP4 파일을 생성하지 않았습니다.".to_string(),
            ));
        }

        Ok(output_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| AppError::Internal(format!("작업 실패: {}", e)))?
}
