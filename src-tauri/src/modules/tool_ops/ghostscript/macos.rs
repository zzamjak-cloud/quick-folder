use super::download::ureq_download_to_path;
use crate::modules::constants::download_urls::*;
use crate::modules::error::{AppError, Result};

#[cfg(target_os = "macos")]
pub(super) fn find_brew_executable() -> Option<std::path::PathBuf> {
    use std::path::Path;
    for p in ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"] {
        let path = Path::new(p);
        if path.exists()
            && std::fs::metadata(path)
                .map(|m| m.len() > 0)
                .unwrap_or(false)
        {
            return Some(path.to_path_buf());
        }
    }
    // GUI 앱은 PATH에 brew가 없는 경우가 많음 → 표준 경로를 앞에 둔 PATH로 재시도
    let augmented = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/sbin";
    std::process::Command::new("brew")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .env("PATH", augmented)
        .status()
        .ok()
        .filter(|s| s.success())?;
    Some(std::path::PathBuf::from("brew"))
}

#[cfg(target_os = "macos")]
pub(super) fn brew_install_ghostscript(
    brew: &std::path::Path,
) -> std::io::Result<std::process::Output> {
    let path = std::env::var("PATH").unwrap_or_default();
    let mut cmd = std::process::Command::new(brew);
    cmd.args(["install", "ghostscript"]);
    cmd.env("HOMEBREW_NO_AUTO_UPDATE", "1");
    cmd.env("HOMEBREW_NO_INSTALL_CLEANUP", "1");
    cmd.env("NONINTERACTIVE", "1");
    cmd.env("CI", "1");
    cmd.stdin(std::process::Stdio::null());
    cmd.env(
        "PATH",
        format!("/opt/homebrew/bin:/usr/local/bin:/opt/homebrew/sbin:/usr/local/sbin:{path}"),
    );
    cmd.output()
}

#[cfg(target_os = "macos")]
pub(super) fn brew_install_ghostscript_via_path_script() -> std::io::Result<std::process::Output> {
    let script = r#"export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 NONINTERACTIVE=1 CI=1
if ! command -v brew >/dev/null 2>&1; then exit 127; fi
exec brew install ghostscript"#;
    let path = std::env::var("PATH").unwrap_or_default();
    let mut cmd = std::process::Command::new("/bin/bash");
    cmd.args(["-c", script]);
    cmd.stdin(std::process::Stdio::null());
    cmd.env("PATH", format!("/opt/homebrew/bin:/usr/local/bin:{path}"));
    cmd.output()
}

#[cfg(target_os = "macos")]
pub(super) fn brew_install_ghostscript_via_login_shell() -> std::io::Result<std::process::Output> {
    let mut cmd = std::process::Command::new("/bin/zsh");
    cmd.args([
        "-l",
        "-c",
        "export HOMEBREW_NO_AUTO_UPDATE=1 NONINTERACTIVE=1 CI=1; brew install ghostscript",
    ]);
    cmd.stdin(std::process::Stdio::null());
    cmd.output()
}

// ─── macOS 포터블 패키지 다운로드 ──────────────────────────────────────────

/// macOS: Ghostscript 포터블 패키지의 영구 저장 경로
#[cfg(target_os = "macos")]
pub(super) fn gs_portable_root() -> std::path::PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        std::path::PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("QuickFolder")
            .join("gs_portable")
    } else {
        std::env::current_exe()
            .ok()
            .and_then(|e| e.parent().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("gs_portable")
    }
}

/// macOS: GitHub Releases에서 Ghostscript 포터블 tar.gz 다운로드 후 gs_portable/에 추출
#[cfg(target_os = "macos")]
pub(super) fn macos_download_gs_portable() -> Result<()> {
    let url = if cfg!(target_arch = "aarch64") {
        GHOSTSCRIPT_MACOS_ARM64
    } else {
        GHOSTSCRIPT_MACOS_X86_64
    };

    let root = gs_portable_root();

    // 기존 디렉터리 정리
    if root.exists() {
        std::fs::remove_dir_all(&root)?;
    }
    std::fs::create_dir_all(&root)?;

    let tgz = root.join("ghostscript-portable.tar.gz");
    eprintln!("📦 Ghostscript 포터블 다운로드 중: {}", url);
    ureq_download_to_path(url, 200 * 1024 * 1024, &tgz)?;

    // tar.gz 추출
    let root_str = root
        .to_str()
        .ok_or_else(|| AppError::Internal("경로 인코딩 실패".to_string()))?;
    let tgz_str = tgz
        .to_str()
        .ok_or_else(|| AppError::Internal("경로 인코딩 실패".to_string()))?;
    let st = std::process::Command::new("tar")
        .args(["-xzf", tgz_str, "-C", root_str])
        .status()
        .map_err(|e| AppError::ToolExecution {
            tool: "tar".to_string(),
            reason: format!("tar 실행 실패: {e}"),
        })?;
    if !st.success() {
        return Err(AppError::ToolExecution {
            tool: "tar".to_string(),
            reason: "Ghostscript 포터블 압축 해제 실패".to_string(),
        });
    }
    let _ = std::fs::remove_file(&tgz);

    // gs 실행 권한 부여
    let gs_bin = root.join("bin").join("gs");
    if gs_bin.exists() {
        let _ = std::process::Command::new("chmod")
            .args(["+x", gs_bin.to_str().unwrap_or("")])
            .status();
    }

    eprintln!("✅ Ghostscript 포터블 설치 완료: {:?}", root);
    Ok(())
}
