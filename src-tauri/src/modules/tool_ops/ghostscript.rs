//! Ghostscript 관련 도구 관리
//! Ghostscript 경로 탐색, 다운로드, 설치 및 PDF 압축

#[cfg(target_os = "windows")]
use super::super::constants::registry::*;
use super::super::constants::download_urls::*;
use super::super::error::{AppError, Result};

// ─── macOS 헬퍼 함수 ───────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn find_brew_executable() -> Option<std::path::PathBuf> {
    use std::path::Path;
    for p in ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"] {
        let path = Path::new(p);
        if path.exists() && std::fs::metadata(path).map(|m| m.len() > 0).unwrap_or(false) {
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
fn brew_install_ghostscript(brew: &std::path::Path) -> std::io::Result<std::process::Output> {
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
fn brew_install_ghostscript_via_path_script() -> std::io::Result<std::process::Output> {
    let script = r#"export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 NONINTERACTIVE=1 CI=1
if ! command -v brew >/dev/null 2>&1; then exit 127; fi
exec brew install ghostscript"#;
    let path = std::env::var("PATH").unwrap_or_default();
    let mut cmd = std::process::Command::new("/bin/bash");
    cmd.args(["-c", script]);
    cmd.stdin(std::process::Stdio::null());
    cmd.env(
        "PATH",
        format!("/opt/homebrew/bin:/usr/local/bin:{path}"),
    );
    cmd.output()
}

#[cfg(target_os = "macos")]
fn brew_install_ghostscript_via_login_shell() -> std::io::Result<std::process::Output> {
    let mut cmd = std::process::Command::new("/bin/zsh");
    cmd.args([
        "-l",
        "-c",
        "export HOMEBREW_NO_AUTO_UPDATE=1 NONINTERACTIVE=1 CI=1; brew install ghostscript",
    ]);
    cmd.stdin(std::process::Stdio::null());
    cmd.output()
}

// ─── Windows 헬퍼 함수 ─────────────────────────────────────────────────────

/// Windows: 레지스트리 App Paths — 설치 프로그램이 등록하는 전체 경로 (가장 신뢰도 높음)
#[cfg(target_os = "windows")]
fn find_gs_via_app_paths_registry() -> Option<String> {
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
#[cfg(target_os = "windows")]
fn find_gs_exe_in_windows_program_files() -> Option<String> {
    use std::time::SystemTime;
    let mut roots: Vec<String> = vec![
        r"C:\Program Files\gs".to_string(),
        r"C:\Program Files (x86)\gs".to_string(),
    ];
    if let Ok(pf) = std::env::var("ProgramFiles") {
        roots.push(std::path::Path::new(&pf).join("gs").to_string_lossy().to_string());
    }
    if let Ok(pf) = std::env::var("ProgramFiles(x86)") {
        roots.push(std::path::Path::new(&pf).join("gs").to_string_lossy().to_string());
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
                    let t = std::fs::metadata(&exe).and_then(|m| m.modified()).unwrap_or(SystemTime::UNIX_EPOCH);
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
fn windows_winget_available() -> bool {
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
fn windows_choco_available() -> bool {
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

/// HTTP 다운로드 헬퍼 함수
fn ureq_download_to_path(url: &str, max_bytes: u64, dest: &std::path::Path) -> Result<()> {
    let mut response = ureq::get(url)
        .call()
        .map_err(|e| AppError::ToolDownload {
            tool: "Ghostscript".to_string(),
            reason: format!("HTTP GET 실패: {e}")
        })?;
    let bytes = response
        .body_mut()
        .with_config()
        .limit(max_bytes)
        .read_to_vec()
        .map_err(|e| AppError::ToolDownload {
            tool: "Ghostscript".to_string(),
            reason: format!("본문 읽기 실패: {e}")
        })?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(dest, &bytes)?;
    Ok(())
}

/// Windows: GitHub Releases에서 Ghostscript 포터블 ZIP 다운로드 후 gs_sidecar/에 추출
#[cfg(target_os = "windows")]
fn windows_download_gs_portable() -> Result<()> {
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
fn windows_winget_install_ghostscript() -> std::io::Result<std::process::Output> {
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
fn windows_choco_install_ghostscript() -> std::io::Result<std::process::Output> {
    use std::os::windows::process::CommandExt;
    let mut cmd = std::process::Command::new("choco");
    cmd.args(["install", "ghostscript", "-y"]);
    cmd.stdin(std::process::Stdio::null());
    cmd.creation_flags(0x08000000);
    cmd.output()
}

#[cfg(target_os = "windows")]
fn windows_gs_install_output_ok(output: &std::process::Output) -> bool {
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
                )
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
            )
        });
    }

    #[cfg(target_os = "macos")]
    {
        let mut _last_out: Option<std::process::Output> = None;

        if let Some(brew) = find_brew_executable() {
            let output = brew_install_ghostscript(&brew)
                .map_err(|e| AppError::ToolExecution {
                    tool: "brew".to_string(),
                    reason: format!("brew install 실행 실패: {}", e)
                })?;
            if output.status.success() && find_gs_path().is_some() {
                return Ok(());
            }
            _last_out = Some(output);
        }

        let output2 = brew_install_ghostscript_via_path_script()
            .map_err(|e| AppError::ToolExecution {
                tool: "brew".to_string(),
                reason: format!("brew install 실행 실패: {}", e)
            })?;
        if output2.status.success() && find_gs_path().is_some() {
            return Ok(());
        }
        _last_out = Some(output2);

        let output3 = brew_install_ghostscript_via_login_shell()
            .map_err(|e| AppError::ToolExecution {
                tool: "brew".to_string(),
                reason: format!("brew install 실행 실패: {}", e)
            })?;
        if output3.status.success() && find_gs_path().is_some() {
            return Ok(());
        }
        _last_out = Some(output3);

        let out = _last_out.unwrap();
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        if find_gs_path().is_some() {
            return Ok(());
        }
        return Err(AppError::ToolInstallation {
            tool: "Ghostscript".to_string(),
            reason: format!(
                "설치에 실패했습니다.\n\
                     (Homebrew로 ghostscript 설치)\n\n\
                     stdout:\n{}\n\nstderr:\n{}\n\n\
                     터미널에서 `brew install ghostscript` 실행 후 다시 시도하거나,\n\
                     Homebrew가 없다면 https://brew.sh 를 참고해 설치해 주세요.",
                stdout.trim(),
                stderr.trim()
            )
        });
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err(AppError::UnsupportedPlatform("이 플랫폼에서는 자동 설치가 지원되지 않습니다.".to_string()))
    }
}

/// Ghostscript(gs) 실행 파일 경로 찾기
pub fn find_gs_path() -> Option<String> {
    // 1. 번들링된 바이너리 (실행 파일 옆, Tauri externalBin)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            #[cfg(target_os = "windows")]
            let bundled = dir.join("gs.exe");
            #[cfg(not(target_os = "windows"))]
            let bundled = dir.join("gs");

            if bundled.exists() && std::fs::metadata(&bundled).map(|m| m.len() > 0).unwrap_or(false) {
                eprintln!("✅ 번들링된 Ghostscript 발견: {:?}", bundled);
                return bundled.to_str().map(|s| s.to_string());
            }
        }
    }

    // 2. 시스템 PATH
    if std::process::Command::new("gs")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
    {
        eprintln!("✅ 시스템 PATH에서 Ghostscript 발견");
        return Some("gs".to_string());
    }

    eprintln!("❌ Ghostscript를 찾을 수 없습니다");
    None
}

/// Ghostscript 설치 확인
#[tauri::command]
pub async fn check_gs() -> Result<bool> {
    Ok(find_gs_path().is_some())
}

/// Ghostscript 확보 (ffmpeg `download_ffmpeg`와 동일 UX — Windows: 공식 설치 파일 다운로드·sidecar 복사 우선)
#[tauri::command]
pub async fn download_gs() -> Result<()> {
    tauri::async_runtime::spawn_blocking(ensure_ghostscript_installed_inner)
        .await
        .map_err(|e| AppError::Internal(format!("설치 태스크 실패: {}", e)))?
}

#[tauri::command]
pub async fn install_gs() -> Result<()> {
    download_gs().await
}

fn format_file_size(bytes: u64) -> String {
    if bytes >= 1_073_741_824 { format!("{:.1} GB", bytes as f64 / 1_073_741_824.0) }
    else if bytes >= 1_048_576 { format!("{:.1} MB", bytes as f64 / 1_048_576.0) }
    else if bytes >= 1024 { format!("{:.1} KB", bytes as f64 / 1024.0) }
    else { format!("{} B", bytes) }
}

#[tauri::command]
pub async fn compress_pdf(input: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let gs = find_gs_path().ok_or_else(|| AppError::ToolNotFound {
            tool: "Ghostscript".to_string()
        })?;

        // 고화질 압축 (Ghostscript PDFSETTINGS=printer)
        let pdf_settings = "/printer";

        let input_path = std::path::Path::new(&input);
        let parent = input_path.parent().unwrap_or(std::path::Path::new("."));
        let stem = input_path.file_stem().and_then(|s| s.to_str()).unwrap_or("document");
        let output_path = crate::helpers::find_unique_path(parent, stem, "_compressed", ".pdf");
        let output_str = output_path.to_string_lossy().to_string();

        let mut cmd = std::process::Command::new(&gs);
        // 포터블 GS(gs_sidecar/bin/gswin64c.exe) 사용 시 lib/ 위치를 GS_LIB으로 명시.
        // gswin64c.exe 위치: <root>/bin/gswin64c.exe → lib: <root>/lib/
        // 시스템 설치(C:\Program Files\gs\...\bin\gswin64c.exe)도 동일 구조라 안전하게 적용 가능.
        #[cfg(target_os = "windows")]
        if let Some(gs_lib) = std::path::Path::new(&gs)
            .parent()                   // bin/
            .and_then(|p| p.parent())   // <root>/
            .map(|root| root.join("lib"))
            .filter(|p| p.exists())
        {
            cmd.env("GS_LIB", gs_lib);
        }
        cmd.args([
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.4",
            &format!("-dPDFSETTINGS={}", pdf_settings),
            "-dNOPAUSE",
            "-dBATCH",
            "-dQUIET",
            &format!("-sOutputFile={}", output_str),
            &input,
        ]);

        // Windows: 콘솔 창 숨기기
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let output = cmd.output().map_err(|e| AppError::ToolExecution {
            tool: "Ghostscript".to_string(),
            reason: e.to_string()
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let _ = std::fs::remove_file(&output_path);
            return Err(AppError::PdfProcessing(stderr.to_string()));
        }

        // 결과 파일이 원본보다 크면 의미 없음 → 경고 포함하여 반환
        let orig_size = std::fs::metadata(&input).map(|m| m.len()).unwrap_or(0);
        let comp_size = std::fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);

        if comp_size >= orig_size {
            let _ = std::fs::remove_file(&output_path);
            return Err(AppError::Cancelled(format!(
                "압축 결과가 원본({})보다 크거나 같아 취소되었습니다.",
                format_file_size(orig_size)
            )));
        }

        Ok(output_str)
    })
    .await
    .map_err(|e| AppError::Internal(format!("PDF 압축 실패: {}", e)))?
}
