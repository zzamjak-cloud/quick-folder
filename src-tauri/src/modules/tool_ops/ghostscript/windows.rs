#[cfg(target_os = "windows")]
use super::download::ureq_download_to_path;
#[cfg(target_os = "windows")]
use crate::modules::constants::download_urls::*;
#[cfg(target_os = "windows")]
use crate::modules::error::{AppError, Result};

#[cfg(target_os = "windows")]
use crate::modules::constants::registry::*;

// ─── Windows 헬퍼 함수 ─────────────────────────────────────────────────────

/// Windows: 레지스트리 App Paths — 설치 프로그램이 등록하는 전체 경로 (가장 신뢰도 높음)
/// 현재 미사용 — GS 탐색 폴백 경로 복구용으로 보존
#[cfg(target_os = "windows")]
#[allow(dead_code)]
pub(super) fn find_gs_via_app_paths_registry() -> Option<String> {
    use std::os::windows::process::CommandExt;
    const KEYS: &[&str] = &[
        r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\gswin64c.exe",
        r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\gswin32c.exe",
        r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\gswin64c.exe",
    ];
    for key in KEYS {
        let mut cmd = std::process::Command::new("reg");
        cmd.args(["query", key, "/ve"]);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let output = cmd.output().ok()?;
        if !output.status.success() {
            continue;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            let line = line.trim();
            if !line.contains("REG_SZ") && !line.contains("REG_EXPAND_SZ") {
                continue;
            }
            let after_type = if let Some(i) = line.find("REG_EXPAND_SZ") {
                line[i + REG_TYPE_EXPAND_SZ_LEN..].trim_start()
            } else if let Some(i) = line.find("REG_SZ") {
                line[i + REG_TYPE_SZ_LEN..].trim_start()
            } else {
                continue;
            };
            let mut path = after_type.trim().trim_matches('"').to_string();
            if path.contains("%ProgramFiles%") {
                if let Ok(pf) = std::env::var("ProgramFiles") {
                    path = path.replace("%ProgramFiles%", &pf);
                }
            }
            if path.contains("%ProgramFiles(x86)%") {
                if let Ok(pf) = std::env::var("ProgramFiles(x86)") {
                    path = path.replace("%ProgramFiles(x86)%", &pf);
                }
            }
            if path.to_lowercase().ends_with(".exe") && std::path::Path::new(&path).exists() {
                return Some(path);
            }
        }
    }
    None
}

/// Windows: GPL Ghostscript 기본 설치 위치 (PATH 없이 gswin64c.exe 전체 경로)
/// 현재 미사용 — GS 탐색 폴백 경로 복구용으로 보존
#[cfg(target_os = "windows")]
#[allow(dead_code)]
pub(super) fn find_gs_exe_in_windows_program_files() -> Option<String> {
    use std::time::SystemTime;
    let mut roots: Vec<String> = vec![
        r"C:\Program Files\gs".to_string(),
        r"C:\Program Files (x86)\gs".to_string(),
    ];
    if let Ok(pf) = std::env::var("ProgramFiles") {
        roots.push(
            std::path::Path::new(&pf)
                .join("gs")
                .to_string_lossy()
                .to_string(),
        );
    }
    if let Ok(pf) = std::env::var("ProgramFiles(x86)") {
        roots.push(
            std::path::Path::new(&pf)
                .join("gs")
                .to_string_lossy()
                .to_string(),
        );
    }
    let mut best: Option<(SystemTime, String)> = None;
    for root in roots {
        let base = std::path::Path::new(&root);
        if !base.is_dir() {
            continue;
        }
        let rd = match std::fs::read_dir(base) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for e in rd.flatten() {
            let ver_dir = e.path();
            if !ver_dir.is_dir() {
                continue;
            }
            for name in ["gswin64c.exe", "gswin32c.exe"] {
                let exe = ver_dir.join("bin").join(name);
                if exe.exists() {
                    let t = std::fs::metadata(&exe)
                        .and_then(|m| m.modified())
                        .unwrap_or(SystemTime::UNIX_EPOCH);
                    let s = exe.to_string_lossy().to_string();
                    let replace = match &best {
                        None => true,
                        Some((bt, _)) => t > *bt,
                    };
                    if replace {
                        best = Some((t, s));
                    }
                }
            }
        }
    }
    best.map(|(_, s)| s)
}

#[cfg(target_os = "windows")]
pub(super) fn windows_winget_available() -> bool {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("winget")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .creation_flags(0x08000000)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
pub(super) fn windows_choco_available() -> bool {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("choco")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .creation_flags(0x08000000)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// ZIP 압축 해제 헬퍼 함수
#[cfg(target_os = "windows")]
pub(super) fn extract_zip_to_dir(zip_path: &std::path::Path, dest: &std::path::Path) -> Result<()> {
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

#[cfg(target_os = "windows")]
pub(super) fn windows_download_gs_portable() -> Result<()> {
    let exe = std::env::current_exe()?;
    let exe_dir = exe
        .parent()
        .ok_or_else(|| AppError::Internal("실행 파일 디렉터리를 찾을 수 없습니다.".to_string()))?;
    let sidecar_dir = exe_dir.join("gs_sidecar");

    // 기존 디렉터리 정리
    if sidecar_dir.exists() {
        std::fs::remove_dir_all(&sidecar_dir)?;
    }
    std::fs::create_dir_all(&sidecar_dir)?;

    let zip_path = sidecar_dir.join(GHOSTSCRIPT_ZIP_NAME);
    ureq_download_to_path(GHOSTSCRIPT_WIN64, 200 * 1024 * 1024, &zip_path)?;

    extract_zip_to_dir(&zip_path, &sidecar_dir)?;
    let _ = std::fs::remove_file(&zip_path);

    Ok(())
}

#[cfg(target_os = "windows")]
pub(super) fn windows_winget_install_ghostscript() -> std::io::Result<std::process::Output> {
    use std::os::windows::process::CommandExt;
    let mut cmd = std::process::Command::new("winget");
    cmd.args([
        "install",
        "--id",
        "ArtifexSoftware.GhostScript",
        "-e",
        "--accept-source-agreements",
        "--accept-package-agreements",
        "--silent",
        "--scope",
        "user",
    ]);
    cmd.stdin(std::process::Stdio::null());
    cmd.creation_flags(0x08000000);
    cmd.output()
}

#[cfg(target_os = "windows")]
pub(super) fn windows_choco_install_ghostscript() -> std::io::Result<std::process::Output> {
    use std::os::windows::process::CommandExt;
    let mut cmd = std::process::Command::new("choco");
    cmd.args(["install", "ghostscript", "-y"]);
    cmd.stdin(std::process::Stdio::null());
    cmd.creation_flags(0x08000000);
    cmd.output()
}

#[cfg(target_os = "windows")]
pub(super) fn windows_gs_install_output_ok(output: &std::process::Output) -> bool {
    if output.status.success() {
        return true;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
    let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
    let combined = format!("{stdout} {stderr}");
    combined.contains("already installed")
        || combined.contains("no applicable upgrade")
        || combined.contains("no newer package versions")
        || combined.contains("no upgrade found")
        || combined.contains("설치되어")
}
