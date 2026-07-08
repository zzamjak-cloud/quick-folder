//! FFmpeg 관련 도구 관리
//! FFmpeg 경로 탐색 및 설치 확인

use super::super::error::Result;

#[cfg(target_os = "windows")]
fn local_appdata_ffmpeg_path(local_app_data: impl AsRef<std::path::Path>) -> std::path::PathBuf {
    local_app_data
        .as_ref()
        .join("QuickFolder Widget")
        .join("ffmpeg.exe")
}

#[cfg(target_os = "windows")]
fn installed_app_ffmpeg_candidates() -> Vec<std::path::PathBuf> {
    let mut candidates = Vec::new();

    // 개발 빌드에서는 externalBin sidecar가 0바이트 placeholder일 수 있으므로,
    // 이미 설치된 앱의 정상 sidecar를 fallback으로 사용한다.
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
        candidates.push(local_appdata_ffmpeg_path(local_app_data));
    }

    for env_key in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(program_files) = std::env::var_os(env_key) {
            candidates.push(
                std::path::PathBuf::from(program_files)
                    .join("QuickFolder Widget")
                    .join("ffmpeg.exe"),
            );
        }
    }

    candidates
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

    // 2. Windows 개발 빌드에서는 설치된 앱의 sidecar를 재사용
    #[cfg(target_os = "windows")]
    {
        for installed in installed_app_ffmpeg_candidates() {
            if is_runnable_ffmpeg(&installed) {
                eprintln!("✅ 설치된 앱의 FFmpeg 발견: {:?}", installed);
                return Some(installed);
            }
        }
    }

    // 3. macOS 개발 빌드에서는 설치된 앱의 sidecar를 재사용
    #[cfg(target_os = "macos")]
    {
        let installed =
            std::path::PathBuf::from("/Applications/QuickFolder Widget.app/Contents/MacOS/ffmpeg");
        if is_runnable_ffmpeg(&installed) {
            eprintln!("✅ 설치된 앱의 FFmpeg 발견: {:?}", installed);
            return Some(installed);
        }
    }

    // 4. 시스템 PATH
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_byte_ffmpeg_candidate_is_not_runnable() {
        let dir = std::env::temp_dir().join(format!("qf_ffmpeg_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("create temp dir");

        #[cfg(target_os = "windows")]
        let ffmpeg = dir.join("ffmpeg.exe");
        #[cfg(not(target_os = "windows"))]
        let ffmpeg = dir.join("ffmpeg");

        std::fs::write(&ffmpeg, []).expect("write placeholder ffmpeg");
        assert!(!is_runnable_ffmpeg(&ffmpeg));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_local_appdata_candidate_points_to_installed_sidecar() {
        let path = local_appdata_ffmpeg_path(r"C:\Users\tester\AppData\Local");
        assert_eq!(
            path,
            std::path::PathBuf::from(
                r"C:\Users\tester\AppData\Local\QuickFolder Widget\ffmpeg.exe"
            )
        );
    }
}
