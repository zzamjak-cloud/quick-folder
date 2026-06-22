use super::path::find_gs_path;
use crate::modules::error::{AppError, Result};

#[cfg(target_os = "macos")]
use super::macos::{
    brew_install_ghostscript, brew_install_ghostscript_via_login_shell,
    brew_install_ghostscript_via_path_script, find_brew_executable, macos_download_gs_portable,
};
#[cfg(target_os = "windows")]
use super::windows::{
    windows_choco_available, windows_choco_install_ghostscript, windows_download_gs_portable,
    windows_gs_install_output_ok, windows_winget_available, windows_winget_install_ghostscript,
};

fn ensure_ghostscript_installed_inner() -> Result<()> {
    if find_gs_path().is_some() {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let mut logs: Vec<String> = Vec::new();

        // 1. GitHub Releases 포터블 패키지 (가장 안정적, winget/choco 불필요)
        match windows_download_gs_portable() {
            Ok(()) => {}
            Err(e) => logs.push(format!("포터블 패키지 다운로드: {e}")),
        }
        if find_gs_path().is_some() {
            return Ok(());
        }

        if windows_winget_available() {
            match windows_winget_install_ghostscript() {
                Ok(output) => {
                    if !windows_gs_install_output_ok(&output) {
                        logs.push(format!(
                            "winget exit code {:?}\nstdout:\n{}\nstderr:\n{}",
                            output.status.code(),
                            String::from_utf8_lossy(&output.stdout).trim(),
                            String::from_utf8_lossy(&output.stderr).trim(),
                        ));
                    }
                }
                Err(e) => logs.push(format!("winget 실행 오류: {e}")),
            }
            if find_gs_path().is_some() {
                return Ok(());
            }
        }

        if windows_choco_available() {
            match windows_choco_install_ghostscript() {
                Ok(output) => {
                    if !output.status.success() {
                        logs.push(format!(
                            "choco exit code {:?}\nstdout:\n{}\nstderr:\n{}",
                            output.status.code(),
                            String::from_utf8_lossy(&output.stdout).trim(),
                            String::from_utf8_lossy(&output.stderr).trim(),
                        ));
                    }
                }
                Err(e) => logs.push(format!("choco 실행 오류: {e}")),
            }
            if find_gs_path().is_some() {
                return Ok(());
            }
        }

        if find_gs_path().is_some() {
            return Ok(());
        }

        let manual = "수동 설치:\n\
              • PowerShell: winget install -e --id ArtifexSoftware.GhostScript --silent --accept-source-agreements --accept-package-agreements\n\
              • 또는 Chocolatey: choco install ghostscript -y\n\
              • 또는 https://www.ghostscript.com/releases/gsdnld.html";

        if !windows_winget_available() && !windows_choco_available() {
            return Err(AppError::ToolInstallation {
                tool: "Ghostscript".to_string(),
                reason: format!(
                    "자동 설치할 수 없습니다.\n\n\
                     winget과 Chocolatey를 찾을 수 없습니다.\n\n\
                     {manual}"
                ),
            });
        }

        let detail = if logs.is_empty() {
            "설치 시도 후에도 gswin64c.exe를 찾지 못했습니다.\n\
                 `C:\\Program Files\\gs\\…\\bin\\gswin64c.exe` 또는 실행 파일 옆 폴더를 확인해 주세요."
                .to_string()
        } else {
            logs.join("\n\n---\n\n")
        };

        return Err(AppError::ToolNotFound {
            tool: format!(
                "Ghostscript 실행 파일(gswin64c)을 찾을 수 없습니다.\n\n\
                     {detail}\n\n\
                     {manual}"
            ),
        });
    }

    #[cfg(target_os = "macos")]
    {
        // 1. GitHub Releases 포터블 패키지 (가장 안정적, Homebrew 불필요)
        match macos_download_gs_portable() {
            Ok(()) => {}
            Err(e) => eprintln!("⚠️ Ghostscript 포터블 다운로드 실패: {e}"),
        }
        if find_gs_path().is_some() {
            return Ok(());
        }

        // 2. Homebrew 폴백
        if let Some(brew) = find_brew_executable() {
            let output = brew_install_ghostscript(&brew).map_err(|e| AppError::ToolExecution {
                tool: "brew".to_string(),
                reason: format!("brew install 실행 실패: {}", e),
            })?;
            if output.status.success() && find_gs_path().is_some() {
                return Ok(());
            }
        }

        let output2 = brew_install_ghostscript_via_path_script().ok();
        if output2
            .as_ref()
            .map(|o| o.status.success())
            .unwrap_or(false)
            && find_gs_path().is_some()
        {
            return Ok(());
        }

        let output3 = brew_install_ghostscript_via_login_shell().ok();
        if output3
            .as_ref()
            .map(|o| o.status.success())
            .unwrap_or(false)
            && find_gs_path().is_some()
        {
            return Ok(());
        }

        if find_gs_path().is_some() {
            return Ok(());
        }

        return Err(AppError::ToolInstallation {
            tool: "Ghostscript".to_string(),
            reason: "Ghostscript 포터블 패키지 다운로드 및 Homebrew 설치 모두 실패했습니다.\n\n\
                     터미널에서 `brew install ghostscript` 실행 후 다시 시도하거나,\n\
                     Homebrew가 없다면 https://brew.sh 를 참고해 설치해 주세요."
                .to_string(),
        });
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err(AppError::UnsupportedPlatform(
            "이 플랫폼에서는 자동 설치가 지원되지 않습니다.".to_string(),
        ))
    }
}

pub async fn check_gs() -> Result<bool> {
    Ok(find_gs_path().is_some())
}

/// Ghostscript 확보 (Windows: 공식 설치 파일 다운로드·sidecar 복사 우선)
pub async fn download_gs() -> Result<()> {
    tauri::async_runtime::spawn_blocking(ensure_ghostscript_installed_inner)
        .await
        .map_err(|e| AppError::Internal(format!("설치 태스크 실패: {}", e)))?
}

pub async fn install_gs() -> Result<()> {
    download_gs().await
}
