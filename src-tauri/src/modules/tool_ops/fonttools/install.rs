#[cfg(any(target_os = "macos", target_os = "linux"))]
use super::archive::extract_tar_gz;
#[cfg(target_os = "windows")]
use super::archive::extract_zip_to_dir;
use super::archive::ureq_download_to_path;
use super::paths::fonttools_embed_root;
#[cfg(any(target_os = "macos", target_os = "linux"))]
use super::python::find_python3_in_bin;
#[cfg(target_os = "windows")]
use super::python::python_exe_responds;
use super::python::{find_python, python_for_font_merge, python_has_fonttools};
use crate::modules::constants::download_urls::*;
use crate::modules::error::{AppError, Result};

// ─── fonttools 설치 함수 ───────────────────────────────────────────────

/// Windows: GitHub Releases 포터블 패키지(python-build-standalone + fonttools)를 다운로드·추출
#[cfg(target_os = "windows")]
fn ensure_windows_fonttools_embed() -> Result<()> {
    let root = fonttools_embed_root();
    let py_exe = root.join("python").join("python.exe");

    // 이미 설치된 경우 스킵
    if py_exe.exists()
        && python_exe_responds(&py_exe)
        && python_has_fonttools(py_exe.to_str().unwrap_or(""))
    {
        return Ok(());
    }

    // 기존 디렉터리 정리 후 재생성
    if root.exists() {
        std::fs::remove_dir_all(&root)?;
    }
    std::fs::create_dir_all(&root)?;

    // GitHub Releases에서 포터블 패키지 다운로드 (python-build-standalone + fonttools 포함)
    let zip_path = root.join(PYTHON_FONTTOOLS_ZIP_NAME);
    ureq_download_to_path(PYTHON_FONTTOOLS_WIN64, 200 * 1024 * 1024, &zip_path)?;

    // ZIP 추출 → root/python/python.exe 생성
    extract_zip_to_dir(&zip_path, &root)?;
    let _ = std::fs::remove_file(&zip_path);

    // 설치 확인
    if !py_exe.exists() || !python_exe_responds(&py_exe) {
        return Err(AppError::ToolInstallation {
            tool: "fonttools".to_string(),
            reason: "포터블 패키지 추출 후 python.exe를 찾지 못했습니다.".to_string(),
        });
    }
    if !python_has_fonttools(py_exe.to_str().unwrap_or("")) {
        return Err(AppError::ToolInstallation {
            tool: "fonttools".to_string(),
            reason: "fonttools 패키지 로드 실패 — 포터블 패키지가 손상됐을 수 있습니다."
                .to_string(),
        });
    }
    Ok(())
}

/// macOS/Linux: indygreg python-build-standalone install_only + pip install fonttools
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn ensure_unix_fonttools_standalone() -> Result<()> {
    let root = fonttools_embed_root();
    let bin_dir = root.join("python").join("bin");

    // 이미 설치되어 있으면 건너뛰기
    if let Some(py) = find_python3_in_bin(&bin_dir) {
        if let Some(s) = py.to_str() {
            if python_has_fonttools(s) {
                return Ok(());
            }
        }
    }

    // 1. GitHub Releases 포터블 패키지 (fonttools 사전 설치됨, pip 불필요)
    #[cfg(target_os = "macos")]
    let (url, name) = if cfg!(target_arch = "aarch64") {
        (
            PYTHON_FONTTOOLS_MACOS_ARM64,
            "python-fonttools-macos-arm64.tar.gz",
        )
    } else {
        (
            PYTHON_FONTTOOLS_MACOS_X86_64,
            "python-fonttools-macos-x86_64.tar.gz",
        )
    };

    #[cfg(target_os = "linux")]
    let (url, name) = (
        "https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-x86_64-unknown-linux-gnu-install_only.tar.gz",
        "cpython-linux-install_only.tar.gz",
    );

    if root.exists() {
        let _ = std::fs::remove_dir_all(&root);
    }
    std::fs::create_dir_all(&root)?;

    let tgz = root.join(name);
    eprintln!("📦 Python+fonttools 포터블 다운로드 중: {}", url);
    ureq_download_to_path(url, 200 * 1024 * 1024, &tgz)?;
    extract_tar_gz(&tgz, &root)?;
    let _ = std::fs::remove_file(&tgz);

    let py = find_python3_in_bin(&bin_dir).ok_or_else(|| AppError::ToolNotFound {
        tool: "standalone Python bin/python3*".to_string(),
    })?;
    let py_s = py
        .to_str()
        .ok_or_else(|| AppError::Internal("python 경로 인코딩 실패".to_string()))?;

    // macOS 포터블 패키지에는 fonttools가 사전 설치됨 → pip 건너뛰기
    if python_has_fonttools(py_s) {
        eprintln!("✅ Python+fonttools 포터블 설치 완료");
        return Ok(());
    }

    // 폴백: fonttools가 없으면 pip install (Linux 또는 패키지 문제 시)
    eprintln!("⚠️ fonttools 미포함, pip install 시도 중...");
    let mut pip = std::process::Command::new(py_s);
    pip.args(["-m", "pip", "install", "fonttools"]);
    pip.env("PIP_DISABLE_PIP_VERSION_CHECK", "1");
    pip.stdin(std::process::Stdio::null());
    let out = pip.output()?;
    if !out.status.success() {
        let e = String::from_utf8_lossy(&out.stderr);
        let o = String::from_utf8_lossy(&out.stdout);
        return Err(AppError::ToolInstallation {
            tool: "fonttools".to_string(),
            reason: format!("pip install fonttools 실패:\n{e}\n{o}"),
        });
    }

    if !python_has_fonttools(py_s) {
        return Err(AppError::ToolInstallation {
            tool: "fonttools".to_string(),
            reason: "standalone Python에 fonttools import 실패".to_string(),
        });
    }
    Ok(())
}

/// 비(非) macOS/Linux 플랫폼용 no-op 스텁 (Windows에서는 호출되지 않음)
#[cfg(not(any(target_os = "macos", target_os = "linux")))]
#[allow(dead_code)]
fn ensure_unix_fonttools_standalone() -> Result<()> {
    Ok(())
}

fn install_fonttools_inner() -> Result<()> {
    if python_for_font_merge().is_some() {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    ensure_windows_fonttools_embed()?;

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    ensure_unix_fonttools_standalone()?;

    if python_for_font_merge().is_some() {
        return Ok(());
    }

    let py = find_python().ok_or_else(|| AppError::ToolNotFound {
        tool: "Python".to_string(),
    })?;

    if python_has_fonttools(&py) {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;

    let mut pip_user = std::process::Command::new(&py);
    pip_user.args(["-m", "pip", "install", "--user", "fonttools"]);
    pip_user.env("PIP_DISABLE_PIP_VERSION_CHECK", "1");
    pip_user.stdin(std::process::Stdio::null());
    #[cfg(target_os = "windows")]
    pip_user.creation_flags(0x08000000);
    let out = pip_user.output().map_err(|e| AppError::ToolExecution {
        tool: "pip".to_string(),
        reason: format!("pip 실행 실패: {e}"),
    })?;

    if !out.status.success() {
        let mut pip_global = std::process::Command::new(&py);
        pip_global.args(["-m", "pip", "install", "fonttools"]);
        pip_global.env("PIP_DISABLE_PIP_VERSION_CHECK", "1");
        pip_global.stdin(std::process::Stdio::null());
        #[cfg(target_os = "windows")]
        pip_global.creation_flags(0x08000000);
        let out2 = pip_global.output().map_err(|e| AppError::ToolExecution {
            tool: "pip".to_string(),
            reason: format!("pip 실행 실패: {e}"),
        })?;
        if !out2.status.success() {
            let e1 = String::from_utf8_lossy(&out.stderr);
            let e2 = String::from_utf8_lossy(&out2.stderr);
            return Err(AppError::ToolInstallation {
                tool: "fonttools".to_string(),
                reason: format!(
                    "설치 실패 (내장 런타임 및 시스템 pip).\n\n[--user]\n{e1}\n\n[전역]\n{e2}"
                ),
            });
        }
    }

    if !python_has_fonttools(&py) {
        return Err(AppError::ToolInstallation {
            tool: "fonttools".to_string(),
            reason: "pip는 완료되었지만 fonttools import에 실패했습니다. 터미널에서 `python -m pip install --user fonttools`를 실행해 주세요.".to_string()
        });
    }
    Ok(())
}

// ─── Tauri 커맨드 ──────────────────────────────────────────────────────

/// fonttools 사용 가능 여부 (sidecar 내장 Python 우선, 이후 시스템 Python)
pub async fn check_fonttools() -> Result<bool> {
    let ok = tauri::async_runtime::spawn_blocking(|| python_for_font_merge().is_some())
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(ok)
}

/// 내장 런타임 + pip로 fonttools 확보
pub async fn download_fonttools() -> Result<()> {
    tauri::async_runtime::spawn_blocking(install_fonttools_inner)
        .await
        .map_err(|e| AppError::Internal(format!("fonttools 다운로드 실패: {e}")))?
}

/// `install_fonttools`와 동일 (호환용)
pub async fn install_fonttools() -> Result<()> {
    download_fonttools().await
}
