//! FFmpeg 관련 도구 관리
//! FFmpeg 경로 탐색, 설치 확인 및 런타임 다운로드
//!
//! 라이선스 정책: FFmpeg GPL 빌드는 앱과 함께 배포(번들·재호스팅)하지 않는다.
//! 최초 사용 시 원 배포처(gyan.dev / evermeet.cx)에서 사용자 기기로 직접
//! 다운로드하여 GPL 재배포 의무가 발생하지 않도록 한다.

use crate::error::{AppError, Result};

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

/// 앱에 번들된 FFmpeg 후보 경로들.
///
/// 이 함수는 **GUI 앱(`app.exe`)과 `qf-mcp` 양쪽에서 호출된다.** 설치 폴더 안 위치가
/// 서로 달라서, `current_exe()` 옆만 보면 qf-mcp 쪽이 통째로 빗나간다.
///
/// ```text
/// Windows  <install>/app.exe                      ← GUI
///          <install>/binaries/qf-mcp.exe          ← MCP 서버
///          <install>/binaries/ffmpeg-dist/ffmpeg.exe   ← 실물
///
/// macOS    <app>/Contents/MacOS/QuickFolder            ← GUI
///          <app>/Contents/Resources/binaries/qf-mcp    ← MCP 서버
///          <app>/Contents/Resources/binaries/ffmpeg-dist/ffmpeg  ← 실물
/// ```
///
/// GUI 기준이면 `binaries/ffmpeg-dist/` 로 내려가야 하고, qf-mcp 기준이면 이미
/// `binaries/` 안이라 `ffmpeg-dist/` 만 붙이면 된다. 둘 다 후보에 넣는다.
fn bundled_ffmpeg_candidates() -> Vec<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    const BIN: &str = "ffmpeg.exe";
    #[cfg(not(target_os = "windows"))]
    const BIN: &str = "ffmpeg";

    let Ok(exe) = std::env::current_exe() else {
        return Vec::new();
    };
    let Some(dir) = exe.parent() else {
        return Vec::new();
    };

    // macOS 외 플랫폼에서는 아래 Resources 후보 push 가 컴파일되지 않아 mut 가 남는다
    #[allow(unused_mut)]
    let mut candidates = vec![
        // Tauri externalBin sidecar (실행 파일 바로 옆)
        dir.join(BIN),
        // 호출자가 GUI 앱일 때
        dir.join("binaries").join("ffmpeg-dist").join(BIN),
        // 호출자가 qf-mcp 일 때 (이미 binaries/ 안에 있다)
        dir.join("ffmpeg-dist").join(BIN),
    ];

    // macOS 는 GUI 가 Contents/MacOS 에 있어 Resources 로 건너뛰어야 한다
    #[cfg(target_os = "macos")]
    if let Some(contents) = dir.parent() {
        candidates.push(
            contents
                .join("Resources")
                .join("binaries")
                .join("ffmpeg-dist")
                .join(BIN),
        );
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
    // 1. 앱에 번들된 FFmpeg.
    //
    //    **호출자가 GUI 앱일 수도 있고 qf-mcp 일 수도 있다.** 둘은 설치 폴더 안에서
    //    깊이가 다르므로 두 레이아웃을 모두 본다 (`bundled_ffmpeg_candidates` 주석 참고).
    for candidate in bundled_ffmpeg_candidates() {
        // 리소스 복사 과정에서 실행 권한이 유실될 수 있으므로 복구 시도
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&candidate, std::fs::Permissions::from_mode(0o755));
        }
        if is_runnable_ffmpeg(&candidate) {
            eprintln!("✅ 번들 FFmpeg 발견: {:?}", candidate);
            return Some(candidate);
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
pub async fn check_ffmpeg(
) -> Result<bool> {
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
    let index = crate::constants::download_urls::FFMPEG_MACOS_RIEDL_INDEX;
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
        use crate::constants::download_urls;

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
pub async fn download_ffmpeg(
) -> Result<()> {
    tokio::task::spawn_blocking(download_ffmpeg_inner)
        .await
        .map_err(|e| AppError::Internal(format!("설치 태스크 실패: {}", e)))?
}

pub async fn install_ffmpeg(
) -> Result<()> {
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
    /// qf-mcp 는 설치 폴더의 `binaries/` 안에 있고 GUI 는 그 위에 있다.
    /// 한쪽 기준으로만 후보를 만들면 다른 쪽이 통째로 빗나간다 — 실제로 그랬다.
    #[test]
    fn bundled_candidates_cover_both_gui_and_qf_mcp_layouts() {
        let candidates = bundled_ffmpeg_candidates();
        let as_text: Vec<String> = candidates
            .iter()
            .map(|p| p.display().to_string().replace('\\', "/"))
            .collect();

        assert!(
            as_text.iter().any(|p| p.contains("/binaries/ffmpeg-dist/")),
            "GUI 레이아웃 후보 누락: {:?}",
            as_text
        );
        assert!(
            as_text
                .iter()
                .any(|p| p.ends_with("ffmpeg-dist/ffmpeg") || p.ends_with("ffmpeg-dist/ffmpeg.exe")),
            "qf-mcp 레이아웃 후보 누락: {:?}",
            as_text
        );
        // sidecar(실행 파일 바로 옆)도 계속 본다
        assert!(
            as_text
                .iter()
                .any(|p| p.ends_with("/ffmpeg") || p.ends_with("/ffmpeg.exe")),
            "sidecar 후보 누락: {:?}",
            as_text
        );
    }
}
