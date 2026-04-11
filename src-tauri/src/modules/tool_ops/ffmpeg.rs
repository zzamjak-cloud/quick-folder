//! FFmpeg 관련 도구 관리
//! FFmpeg 경로 탐색 및 설치 확인

use super::super::error::{AppError, Result};

/// ffmpeg 바이너리 경로 탐색 (sidecar → 시스템 PATH)
pub fn find_ffmpeg_path() -> Option<std::path::PathBuf> {
    // 1. 번들링된 바이너리 (실행 파일 옆, Tauri externalBin)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            #[cfg(target_os = "windows")]
            let bundled = dir.join("ffmpeg.exe");
            #[cfg(not(target_os = "windows"))]
            let bundled = dir.join("ffmpeg");

            if bundled.exists() && std::fs::metadata(&bundled).map(|m| m.len() > 0).unwrap_or(false) {
                eprintln!("✅ 번들링된 FFmpeg 발견: {:?}", bundled);
                return Some(bundled);
            }
        }
    }

    // 2. 시스템 PATH
    if let Ok(output) = std::process::Command::new("ffmpeg").arg("-version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
    {
        if output.success() {
            eprintln!("✅ 시스템 PATH에서 FFmpeg 발견");
            return Some(std::path::PathBuf::from("ffmpeg"));
        }
    }

    eprintln!("❌ FFmpeg를 찾을 수 없습니다");
    None
}

/// FFmpeg 설치 확인
#[tauri::command]
pub async fn check_ffmpeg() -> Result<bool> {
    Ok(find_ffmpeg_path().is_some())
}
