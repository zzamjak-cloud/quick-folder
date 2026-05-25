//! FFmpeg 관련 도구 관리
//! FFmpeg 경로 탐색 및 설치 확인

use super::super::error::{AppError, Result};

fn ffmpeg_cache_dir() -> Result<std::path::PathBuf> {
    let base = dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .ok_or_else(|| AppError::Internal("사용자 데이터 폴더를 찾을 수 없습니다".to_string()))?;
    Ok(base.join("QuickFolder").join("tools").join("ffmpeg"))
}

fn ffmpeg_cache_path() -> Result<std::path::PathBuf> {
    let mut path = ffmpeg_cache_dir()?.join("ffmpeg");
    if cfg!(target_os = "windows") {
        path.set_extension("exe");
    }
    Ok(path)
}

fn is_runnable_ffmpeg(path: &std::path::Path) -> bool {
    if !path.exists()
        || std::fs::metadata(path)
            .map(|m| m.len() > 0)
            .unwrap_or(false)
            == false
    {
        return false;
    }
    std::process::Command::new(path)
        .arg("-version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

/// ffmpeg 바이너리 경로 탐색 (sidecar → 시스템 PATH)
pub fn find_ffmpeg_path() -> Option<std::path::PathBuf> {
    // 1. 번들링된 바이너리 (실행 파일 옆, Tauri externalBin)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            #[cfg(target_os = "windows")]
            let bundled = dir.join("ffmpeg.exe");
            #[cfg(not(target_os = "windows"))]
            let bundled = dir.join("ffmpeg");

            if is_runnable_ffmpeg(&bundled) {
                eprintln!("✅ 번들링된 FFmpeg 발견: {:?}", bundled);
                return Some(bundled);
            }
        }
    }

    // 2. 사용자 데이터 폴더의 자동 다운로드 캐시
    if let Ok(cached) = ffmpeg_cache_path() {
        if is_runnable_ffmpeg(&cached) {
            eprintln!("✅ 캐시된 FFmpeg 발견: {:?}", cached);
            return Some(cached);
        }
    }

    // 3. 시스템 PATH
    if let Ok(output) = std::process::Command::new("ffmpeg")
        .arg("-version")
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

/// FFmpeg 자동 다운로드
#[tauri::command]
pub async fn download_ffmpeg() -> Result<()> {
    tauri::async_runtime::spawn_blocking(|| {
        if find_ffmpeg_path().is_some() {
            return Ok(());
        }

        let destination = ffmpeg_cache_dir()?;
        std::fs::create_dir_all(&destination)?;

        let download_url = ffmpeg_sidecar::download::ffmpeg_download_url().map_err(|e| {
            AppError::ToolExecution {
                tool: "FFmpeg".to_string(),
                reason: e.to_string(),
            }
        })?;
        let archive_path =
            ffmpeg_sidecar::download::download_ffmpeg_package(download_url, &destination).map_err(
                |e| AppError::ToolExecution {
                    tool: "FFmpeg".to_string(),
                    reason: e.to_string(),
                },
            )?;
        ffmpeg_sidecar::download::unpack_ffmpeg(&archive_path, &destination).map_err(|e| {
            AppError::ToolExecution {
                tool: "FFmpeg".to_string(),
                reason: e.to_string(),
            }
        })?;

        let cached = ffmpeg_cache_path()?;
        if !is_runnable_ffmpeg(&cached) {
            return Err(AppError::ToolExecution {
                tool: "FFmpeg".to_string(),
                reason: format!(
                    "다운로드 후 실행 파일을 확인하지 못했습니다: {}",
                    cached.display()
                ),
            });
        }

        Ok(())
    })
    .await
    .map_err(|e| AppError::Internal(format!("FFmpeg 다운로드 작업 실패: {}", e)))?
}
