//! FFmpeg 관련 도구 관리
//! FFmpeg 경로 탐색 및 설치 확인

use super::super::error::Result;

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

/// ffmpeg 바이너리 경로 탐색 (번들 바이너리 → 시스템 PATH)
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

    // 2. macOS 개발 빌드에서는 설치된 앱의 sidecar를 재사용
    #[cfg(target_os = "macos")]
    {
        let installed =
            std::path::PathBuf::from("/Applications/QuickFolder Widget.app/Contents/MacOS/ffmpeg");
        if is_runnable_ffmpeg(&installed) {
            eprintln!("✅ 설치된 앱의 FFmpeg 발견: {:?}", installed);
            return Some(installed);
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
