//! FFmpeg 관련 도구 관리
//! FFmpeg 경로 탐색, 설치 확인 및 런타임 다운로드
//!
//! 라이선스 정책: FFmpeg GPL 빌드는 앱과 함께 배포(번들·재호스팅)하지 않는다.
//! 최초 사용 시 원 배포처(gyan.dev / evermeet.cx)에서 사용자 기기로 직접
//! 다운로드하여 GPL 재배포 의무가 발생하지 않도록 한다.

use crate::modules::error::{AppError, Result};

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

    // 1-1. 앱에 번들된 자체 LGPL 빌드 (tauri.conf.json resources: binaries/ffmpeg-dist/*)
    //      macOS: .app/Contents/Resources/binaries/ffmpeg-dist/ffmpeg
    //      Windows: <설치폴더>/binaries/ffmpeg-dist/ffmpeg.exe
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            #[cfg(target_os = "macos")]
            let bundled_res = dir
                .parent()
                .map(|contents| contents.join("Resources"))
                .map(|r| r.join("binaries").join("ffmpeg-dist").join("ffmpeg"));
            #[cfg(target_os = "windows")]
            let bundled_res = Some(
                dir.join("binaries")
                    .join("ffmpeg-dist")
                    .join("ffmpeg.exe"),
            );
            #[cfg(not(any(target_os = "macos", target_os = "windows")))]
            let bundled_res: Option<std::path::PathBuf> = None;

            if let Some(res) = bundled_res {
                // 리소스 복사 과정에서 실행 권한이 유실될 수 있으므로 복구 시도
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ =
                        std::fs::set_permissions(&res, std::fs::Permissions::from_mode(0o755));
                }
                if is_runnable_ffmpeg(&res) {
                    eprintln!("✅ 번들 LGPL FFmpeg 발견: {:?}", res);
                    return Some(res);
                }
            }
        }
    }

    // 2. 런타임 다운로드된 FFmpeg (원 배포처에서 사용자 기기로 직접 설치)
    if let Some(downloaded) = downloaded_ffmpeg_path() {
        if is_runnable_ffmpeg(&downloaded) {
            eprintln!("✅ 다운로드된 FFmpeg 발견: {:?}", downloaded);
            return Some(downloaded);
        }
    }

    // 3. Windows 개발 빌드에서는 설치된 앱의 sidecar를 재사용
    #[cfg(target_os = "windows")]
    {
        for installed in installed_app_ffmpeg_candidates() {
            if is_runnable_ffmpeg(&installed) {
                eprintln!("✅ 설치된 앱의 FFmpeg 발견: {:?}", installed);
                return Some(installed);
            }
        }
    }

    // 4. macOS 개발 빌드에서는 설치된 앱의 sidecar를 재사용
    #[cfg(target_os = "macos")]
    {
        let installed =
            std::path::PathBuf::from("/Applications/QuickFolder Widget.app/Contents/MacOS/ffmpeg");
        if is_runnable_ffmpeg(&installed) {
            eprintln!("✅ 설치된 앱의 FFmpeg 발견: {:?}", installed);
            return Some(installed);
        }
    }

    // 4-1. 패키지 관리자 표준 설치 경로
    // (GUI 앱의 PATH에는 /opt/homebrew/bin 등이 없어 5단계 PATH 탐색이 실패하므로 절대 경로로 직접 확인)
    #[cfg(target_os = "macos")]
    for p in ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"] {
        let path = std::path::PathBuf::from(p);
        if is_runnable_ffmpeg(&path) {
            eprintln!("✅ 패키지 관리자 FFmpeg 발견: {:?}", path);
            return Some(path);
        }
    }
    #[cfg(target_os = "windows")]
    {
        let mut pm_candidates: Vec<std::path::PathBuf> =
            vec![std::path::PathBuf::from(r"C:\ProgramData\chocolatey\bin\ffmpeg.exe")];
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            pm_candidates.push(
                std::path::PathBuf::from(local)
                    .join("Microsoft")
                    .join("WinGet")
                    .join("Links")
                    .join("ffmpeg.exe"),
            );
        }
        for path in pm_candidates {
            if is_runnable_ffmpeg(&path) {
                eprintln!("✅ 패키지 관리자 FFmpeg 발견: {:?}", path);
                return Some(path);
            }
        }
    }

    // 5. 시스템 PATH
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

// ─── 런타임 다운로드 ────────────────────────────────────────────────────────

/// 다운로드된 FFmpeg의 영구 저장 경로
fn ffmpeg_install_root() -> Option<std::path::PathBuf> {
    dirs::data_dir().map(|d| d.join("QuickFolder Widget").join("ffmpeg_portable"))
}

/// 다운로드된 FFmpeg 실행 파일 경로
fn downloaded_ffmpeg_path() -> Option<std::path::PathBuf> {
    let root = ffmpeg_install_root()?;
    if cfg!(target_os = "windows") {
        Some(root.join("ffmpeg.exe"))
    } else {
        Some(root.join("ffmpeg"))
    }
}

fn ureq_download_to_path(url: &str, max_bytes: u64, dest: &std::path::Path) -> Result<()> {
    let mut response = ureq::get(url).call().map_err(|e| AppError::ToolDownload {
        tool: "FFmpeg".to_string(),
        reason: format!("HTTP GET 실패: {e}"),
    })?;
    let bytes = response
        .body_mut()
        .with_config()
        .limit(max_bytes)
        .read_to_vec()
        .map_err(|e| AppError::ToolDownload {
            tool: "FFmpeg".to_string(),
            reason: format!("본문 읽기 실패: {e}"),
        })?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(dest, &bytes)?;
    Ok(())
}

fn extract_zip_to_dir(zip_path: &std::path::Path, dest: &std::path::Path) -> Result<()> {
    let file = std::fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    std::fs::create_dir_all(dest)?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let out_path = dest.join(entry.mangled_name());
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&out_path)?;
            std::io::copy(&mut entry, &mut outfile)?;
        }
    }
    Ok(())
}

/// 압축 해제된 트리에서 ffmpeg 실행 파일 탐색
/// (gyan.dev zip은 `ffmpeg-*-essentials_build/bin/` 하위에 위치)
fn find_binary_in_dir(root: &std::path::Path, name: &str) -> Option<std::path::PathBuf> {
    walkdir::WalkDir::new(root)
        .into_iter()
        .flatten()
        .find(|e| {
            e.file_type().is_file() && e.file_name().to_string_lossy().eq_ignore_ascii_case(name)
        })
        .map(|e| e.into_path())
}

/// martin-riedl.de 인덱스 페이지에서 현재 아키텍처용 최신 릴리스 zip URL을 파싱
/// (arm64 네이티브 빌드 제공처 — 고정 latest URL이 없어 런타임 파싱 필요)
#[cfg(target_os = "macos")]
fn resolve_martin_riedl_url() -> Option<String> {
    let index = crate::modules::constants::download_urls::FFMPEG_MACOS_RIEDL_INDEX;
    let arch = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "amd64"
    };
    let mut resp = ureq::get(index).call().ok()?;
    let html = resp
        .body_mut()
        .with_config()
        .limit(4 * 1024 * 1024)
        .read_to_string()
        .ok()?;
    let prefix = format!("/download/macos/{arch}/");
    let mut fallback: Option<String> = None;
    for part in html.split("href=\"").skip(1) {
        let Some(end) = part.find('"') else { continue };
        let link = &part[..end];
        if !link.starts_with(prefix.as_str()) || !link.ends_with("/ffmpeg.zip") {
            continue;
        }
        let url = format!("{}{}", index.trim_end_matches('/'), link);
        // 버전 세그먼트가 `타임스탬프_x.y.z` 형태인 정식 릴리스를 우선, 스냅샷(N-*)은 폴백
        let seg = link.trim_start_matches(prefix.as_str());
        let is_release = seg
            .split('/')
            .next()
            .and_then(|v| v.split_once('_'))
            .map(|(_, ver)| ver.chars().next().is_some_and(|c| c.is_ascii_digit()))
            .unwrap_or(false);
        if is_release {
            return Some(url);
        }
        if fallback.is_none() {
            fallback = Some(url);
        }
    }
    fallback
}

/// 단일 출처에서 FFmpeg 다운로드·압축 해제·검증까지 수행
#[cfg(any(target_os = "windows", target_os = "macos"))]
fn try_install_ffmpeg_from_url(url: &str, root: &std::path::Path) -> Result<()> {
    if root.exists() {
        std::fs::remove_dir_all(root)?;
    }
    std::fs::create_dir_all(root)?;

    eprintln!("📦 FFmpeg 다운로드 중 (원 배포처): {url}");
    let zip_path = root.join("ffmpeg-download.zip");
    ureq_download_to_path(url, 500 * 1024 * 1024, &zip_path)?;

    let extract_dir = root.join("extract");
    extract_zip_to_dir(&zip_path, &extract_dir)?;
    let _ = std::fs::remove_file(&zip_path);

    let bin_name = if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    let found =
        find_binary_in_dir(&extract_dir, bin_name).ok_or_else(|| AppError::ToolInstallation {
            tool: "FFmpeg".to_string(),
            reason: "다운로드한 압축 파일에서 ffmpeg 실행 파일을 찾지 못했습니다.".to_string(),
        })?;

    let dest = root.join(bin_name);
    std::fs::copy(&found, &dest)?;
    let _ = std::fs::remove_dir_all(&extract_dir);

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755));
    }

    // 실행 검증 — 아키텍처 불일치(예: Rosetta 없는 Apple Silicon에서 x86_64 빌드)를 여기서 걸러냄
    if !is_runnable_ffmpeg(&dest) {
        return Err(AppError::ToolInstallation {
            tool: "FFmpeg".to_string(),
            reason: "다운로드한 FFmpeg 실행 검증에 실패했습니다 (아키텍처 불일치 가능성)."
                .to_string(),
        });
    }
    eprintln!("✅ FFmpeg 설치 완료: {:?}", dest);
    Ok(())
}

fn download_ffmpeg_inner() -> Result<()> {
    if find_ffmpeg_path().is_some() {
        return Ok(());
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        return Err(AppError::UnsupportedPlatform(
            "이 플랫폼에서는 자동 설치가 지원되지 않습니다.".to_string(),
        ));
    }

    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        use crate::modules::constants::download_urls;

        let root = ffmpeg_install_root().ok_or_else(|| {
            AppError::Internal("애플리케이션 데이터 경로를 찾을 수 없습니다.".to_string())
        })?;

        // 출처 폴백 체인: 앞 순서 실패 시 다음 미러로 자동 재시도
        let mut candidates: Vec<String> = Vec::new();
        #[cfg(target_os = "windows")]
        {
            candidates.push(download_urls::FFMPEG_WIN64.to_string());
            candidates.push(download_urls::FFMPEG_WIN64_MIRROR.to_string());
        }
        #[cfg(target_os = "macos")]
        {
            // Apple Silicon은 네이티브 arm64 빌드 우선 (evermeet은 x86_64 전용 → Rosetta 필요)
            if cfg!(target_arch = "aarch64") {
                if let Some(u) = resolve_martin_riedl_url() {
                    candidates.push(u);
                }
                candidates.push(download_urls::FFMPEG_MACOS.to_string());
            } else {
                candidates.push(download_urls::FFMPEG_MACOS.to_string());
                if let Some(u) = resolve_martin_riedl_url() {
                    candidates.push(u);
                }
            }
        }

        let mut errors: Vec<String> = Vec::new();
        for url in &candidates {
            match try_install_ffmpeg_from_url(url, &root) {
                Ok(()) => return Ok(()),
                Err(e) => {
                    eprintln!("⚠️ FFmpeg 설치 시도 실패 ({url}): {e}");
                    errors.push(format!("• {url}\n  → {e}"));
                }
            }
        }
        let _ = std::fs::remove_dir_all(&root);

        #[cfg(target_os = "macos")]
        let manual = "수동 설치: 터미널에서 `brew install ffmpeg` 실행 후 다시 시도해 주세요.";
        #[cfg(target_os = "windows")]
        let manual = "수동 설치: PowerShell에서 `winget install Gyan.FFmpeg` 실행 후 다시 시도해 주세요.";

        Err(AppError::ToolInstallation {
            tool: "FFmpeg".to_string(),
            reason: format!(
                "모든 다운로드 출처에서 설치에 실패했습니다.\n\n{}\n\n{manual}",
                errors.join("\n")
            ),
        })
    }
}

/// FFmpeg 다운로드 설치 (원 배포처에서 사용자 기기로 직접 다운로드)
#[tauri::command]
pub async fn download_ffmpeg() -> Result<()> {
    tauri::async_runtime::spawn_blocking(download_ffmpeg_inner)
        .await
        .map_err(|e| AppError::Internal(format!("설치 태스크 실패: {}", e)))?
}

#[tauri::command]
pub async fn install_ffmpeg() -> Result<()> {
    download_ffmpeg().await
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
