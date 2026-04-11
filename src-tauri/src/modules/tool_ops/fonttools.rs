//! Python fonttools 관련 도구 관리
//! fonttools 경로 탐색, 다운로드, 설치 및 폰트 병합

use super::super::constants::download_urls::*;
use super::super::error::{AppError, Result};

// ─── 경로 및 환경 헬퍼 함수 ──────────────────────────────────────────────

/// ffmpeg sidecar와 동일: 실행 파일이 있는 디렉터리 (여기에 `python_fonttools_embed` 등 배치)
fn app_sidecar_directory() -> Result<std::path::PathBuf> {
    std::env::current_exe()?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| AppError::Internal("실행 파일 디렉터리를 알 수 없습니다.".to_string()))
}

/// fonttools 전용 내장 Python 루트 (사용자 영구 디렉터리, 앱 업데이트 시에도 유지)
fn fonttools_embed_root() -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        // Windows: %LOCALAPPDATA%\QuickFolder\python_fonttools_embed
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            return std::path::PathBuf::from(local_appdata)
                .join("QuickFolder")
                .join("python_fonttools_embed");
        }
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        // macOS/Linux: ~/Library/Application Support/QuickFolder/python_fonttools_embed (macOS)
        //              ~/.local/share/QuickFolder/python_fonttools_embed (Linux)
        if let Ok(home) = std::env::var("HOME") {
            #[cfg(target_os = "macos")]
            return std::path::PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("QuickFolder")
                .join("python_fonttools_embed");

            #[cfg(target_os = "linux")]
            return std::path::PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("QuickFolder")
                .join("python_fonttools_embed");
        }
    }

    // 폴백: 실행 파일 디렉터리 (이전 방식)
    app_sidecar_directory()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("python_fonttools_embed")
}

// ─── ZIP/TAR 압축 해제 헬퍼 ────────────────────────────────────────────

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

fn ureq_download_to_path(url: &str, max_bytes: u64, dest: &std::path::Path) -> Result<()> {
    let mut response = ureq::get(url)
        .call()
        .map_err(|e| AppError::ToolDownload {
            tool: "fonttools".to_string(),
            reason: format!("HTTP GET 실패: {e}")
        })?;
    let bytes = response
        .body_mut()
        .with_config()
        .limit(max_bytes)
        .read_to_vec()
        .map_err(|e| AppError::ToolDownload {
            tool: "fonttools".to_string(),
            reason: format!("본문 읽기 실패: {e}")
        })?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(dest, &bytes)?;
    Ok(())
}

/// Unix: `tar -xzf` (macOS/Linux install_only tarball)
fn extract_tar_gz(archive: &std::path::Path, dest: &std::path::Path) -> Result<()> {
    std::fs::create_dir_all(dest)?;
    let s = archive.to_str().ok_or_else(|| AppError::Internal("tar 경로 인코딩 실패".to_string()))?;
    let d = dest.to_str().ok_or_else(|| AppError::Internal("출력 경로 인코딩 실패".to_string()))?;
    let st = std::process::Command::new("tar")
        .args(["-xzf", s, "-C", d])
        .status()
        .map_err(|e| AppError::ToolExecution {
            tool: "tar".to_string(),
            reason: format!("tar 실행 실패: {e}")
        })?;
    if !st.success() {
        return Err(AppError::ToolExecution {
            tool: "tar".to_string(),
            reason: "압축 해제 실패".to_string()
        });
    }
    Ok(())
}

// ─── Windows 헬퍼 함수 ─────────────────────────────────────────────────

/// Windows embeddable 배포판에서 `import site` 활성화 (pip / site-packages 사용)
#[cfg(target_os = "windows")]
fn windows_embed_enable_import_site(embed_dir: &std::path::Path) -> Result<()> {
    let rd = std::fs::read_dir(embed_dir)?;
    for e in rd.flatten() {
        let p = e.path();
        if p.extension().is_some_and(|x| x == "pth") {
            let mut s = std::fs::read_to_string(&p)?;
            if !s.lines().any(|l| l.trim() == "import site") {
                if !s.ends_with('\n') {
                    s.push('\n');
                }
                s.push_str("import site\n");
                std::fs::write(&p, s)?;
            }
            return Ok(());
        }
    }
    Err(AppError::Internal("python*._pth 를 찾지 못했습니다.".to_string()))
}

#[cfg(target_os = "windows")]
fn windows_run_embed_python_cmd(
    python_exe: &std::path::Path,
    work_dir: &std::path::Path,
    args: &[&str],
) -> Result<std::process::Output> {
    use std::os::windows::process::CommandExt;
    let mut c = std::process::Command::new(python_exe);
    for a in args {
        c.arg(a);
    }
    c.current_dir(work_dir);
    c.stdin(std::process::Stdio::null());
    c.creation_flags(0x08000000);
    c.output().map_err(|e| AppError::ToolExecution {
        tool: "Python".to_string(),
        reason: e.to_string()
    })
}

#[cfg(target_os = "windows")]
fn python_exe_responds(path: &std::path::Path) -> bool {
    use std::os::windows::process::CommandExt;
    let mut c = std::process::Command::new(path);
    c.arg("--version");
    c.stdout(std::process::Stdio::null());
    c.stderr(std::process::Stdio::null());
    c.creation_flags(0x08000000);
    c.status().map(|s| s.success()).unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
fn python_exe_responds(path: &std::path::Path) -> bool {
    std::process::Command::new(path)
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

// ─── Python 경로 탐색 헬퍼 ─────────────────────────────────────────────

fn find_python3_in_bin(bin: &std::path::Path) -> Option<std::path::PathBuf> {
    let rd = std::fs::read_dir(bin).ok()?;
    let mut best: Option<std::path::PathBuf> = None;
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if !name.starts_with("python3") {
            continue;
        }
        if name.contains("config") {
            continue;
        }
        if !e.path().is_file() {
            continue;
        }
        best = Some(e.path());
        if name == "python3" || name.starts_with("python3.") && name.len() > 7 {
            return best;
        }
    }
    best
}

/// sidecar에 풀린 `python.exe` / `python/bin/python3*` (존재만 확인, fonttools 여부는 별도)
fn find_fonttools_sidecar_python() -> Option<std::path::PathBuf> {
    let root = fonttools_embed_root();
    #[cfg(target_os = "windows")]
    {
        // 새 방식: python-build-standalone → python/python.exe
        let p_standalone = root.join("python").join("python.exe");
        if p_standalone.exists() && python_exe_responds(&p_standalone) {
            return Some(p_standalone);
        }
        // 구 방식: embeddable → python.exe (하위 호환)
        let p_embed = root.join("python.exe");
        if p_embed.exists() && python_exe_responds(&p_embed) {
            return Some(p_embed);
        }
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let bin = root.join("python").join("bin");
        if bin.is_dir() {
            return find_python3_in_bin(&bin);
        }
    }
    None
}

/// Windows: `py -3 -c "import sys; print(sys.executable)"` 로 실제 python.exe 경로 확보 (PATH 없이도 동작)
#[cfg(target_os = "windows")]
fn find_python_via_py_launcher() -> Option<String> {
    use std::os::windows::process::CommandExt;
    for extra in [&["-3"][..], &[][..]] {
        let mut cmd = std::process::Command::new("py");
        for a in extra {
            cmd.arg(a);
        }
        cmd.args(["-c", "import sys; print(sys.executable, end='')"]);
        cmd.stdin(std::process::Stdio::null());
        cmd.creation_flags(0x08000000);
        let out = match cmd.output() {
            Ok(o) => o,
            Err(_) => continue,
        };
        if !out.status.success() {
            continue;
        }
        let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if path.is_empty() {
            continue;
        }
        let p = std::path::Path::new(&path);
        if p.exists() && python_exe_responds(p) {
            return Some(path);
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn find_python_via_registry() -> Option<String> {
    use std::os::windows::process::CommandExt;
    use super::super::constants::registry::{REG_TYPE_EXPAND_SZ_LEN, REG_TYPE_SZ_LEN};
    for root in ["HKLM", "HKCU"] {
        for ver in ["3.14", "3.13", "3.12", "3.11", "3.10", "3.9", "3.8"] {
            let key = format!(r"{}\SOFTWARE\Python\PythonCore\{}\InstallPath", root, ver);
            let mut cmd = std::process::Command::new("reg");
            cmd.args(["query", &key, "/ve"]);
            cmd.creation_flags(0x08000000);
            let output = match cmd.output() {
                Ok(o) => o,
                Err(_) => continue,
            };
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
                    line.get(i + REG_TYPE_EXPAND_SZ_LEN..).unwrap_or("").trim_start()
                } else if let Some(i) = line.find("REG_SZ") {
                    line.get(i + REG_TYPE_SZ_LEN..).unwrap_or("").trim_start()
                } else {
                    continue;
                };
                let mut dir = after_type.trim().trim_matches('"').to_string();
                if dir.contains("%ProgramFiles%") {
                    if let Ok(pf) = std::env::var("ProgramFiles") {
                        dir = dir.replace("%ProgramFiles%", &pf);
                    }
                }
                if dir.contains("%LocalAppData%") {
                    if let Ok(la) = std::env::var("LOCALAPPDATA") {
                        dir = dir.replace("%LocalAppData%", &la);
                    }
                }
                let exe = std::path::Path::new(&dir).join("python.exe");
                if exe.exists() && python_exe_responds(&exe) {
                    return Some(exe.to_string_lossy().to_string());
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn find_python_local_appdata_programs() -> Option<String> {
    let local = std::env::var("LOCALAPPDATA").ok()?;
    let base = std::path::Path::new(&local).join("Programs").join("Python");
    let rd = std::fs::read_dir(&base).ok()?;
    for e in rd.flatten() {
        let exe = e.path().join("python.exe");
        if exe.exists() && python_exe_responds(&exe) {
            return Some(exe.to_string_lossy().to_string());
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn find_python_macos_common_paths() -> Option<String> {
    for p in ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"] {
        let path = std::path::Path::new(p);
        if path.exists() && python_exe_responds(path) {
            return Some(p.to_string());
        }
    }
    None
}

/// Python 실행 파일 경로 찾기 (Tauri GUI는 PATH가 비어 있는 경우가 많아 py 런처·레지스트리·일반 경로를 순회)
fn find_python() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(p) = find_python_via_py_launcher() {
            return Some(p);
        }
    }

    for cmd in &["python3", "python"] {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let mut c = std::process::Command::new(cmd);
            c.arg("--version");
            c.stdout(std::process::Stdio::null());
            c.stderr(std::process::Stdio::null());
            c.creation_flags(0x08000000);
            if c.status().map(|s| s.success()).unwrap_or(false) {
                return Some(cmd.to_string());
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            if std::process::Command::new(cmd)
                .arg("--version")
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
            {
                return Some(cmd.to_string());
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(p) = find_python_via_registry() {
            return Some(p);
        }
        if let Some(p) = find_python_local_appdata_programs() {
            return Some(p);
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(p) = find_python_macos_common_paths() {
            return Some(p);
        }
    }

    #[cfg(target_os = "linux")]
    {
        let p = std::path::Path::new("/usr/bin/python3");
        if p.exists() && python_exe_responds(p) {
            return Some("/usr/bin/python3".to_string());
        }
    }

    None
}

fn python_has_fonttools(python: &str) -> bool {
    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;
    let mut cmd = std::process::Command::new(python);
    cmd.args(["-c", "import fontTools.ttLib"]);
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    cmd.status().map(|s| s.success()).unwrap_or(false)
}

/// sidecar(embed) 우선, 그다음 시스템 Python 중 fonttools import 가능한 경로
fn python_for_font_merge() -> Option<String> {
    if let Some(p) = find_fonttools_sidecar_python() {
        if let Some(s) = p.to_str() {
            if python_has_fonttools(s) {
                return Some(s.to_string());
            }
        }
    }
    find_python().filter(|p| python_has_fonttools(p))
}

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
            reason: "포터블 패키지 추출 후 python.exe를 찾지 못했습니다.".to_string()
        });
    }
    if !python_has_fonttools(py_exe.to_str().unwrap_or("")) {
        return Err(AppError::ToolInstallation {
            tool: "fonttools".to_string(),
            reason: "fonttools 패키지 로드 실패 — 포터블 패키지가 손상됐을 수 있습니다.".to_string()
        });
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn ensure_windows_fonttools_embed() -> Result<()> {
    Ok(())
}

/// macOS/Linux: indygreg python-build-standalone install_only + pip install fonttools
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn ensure_unix_fonttools_standalone() -> Result<()> {
    let (url, name) = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            (
                "https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-aarch64-apple-darwin-install_only.tar.gz",
                "cpython-macos-aarch64-install_only.tar.gz",
            )
        } else {
            (
                "https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-x86_64-apple-darwin-install_only.tar.gz",
                "cpython-macos-x86_64-install_only.tar.gz",
            )
        }
    } else {
        (
            "https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-x86_64-unknown-linux-gnu-install_only.tar.gz",
            "cpython-linux-install_only.tar.gz",
        )
    };

    let root = fonttools_embed_root();
    let bin_dir = root.join("python").join("bin");
    if let Some(py) = find_python3_in_bin(&bin_dir) {
        if let Some(s) = py.to_str() {
            if python_has_fonttools(s) {
                return Ok(());
            }
        }
    }

    if root.exists() {
        let _ = std::fs::remove_dir_all(&root);
    }
    std::fs::create_dir_all(&root)?;

    let tgz = root.join(name);
    ureq_download_to_path(url, 120 * 1024 * 1024, &tgz)?;
    extract_tar_gz(&tgz, &root)?;
    let _ = std::fs::remove_file(&tgz);

    let py = find_python3_in_bin(&bin_dir).ok_or_else(|| AppError::ToolNotFound {
        tool: "standalone Python bin/python3*".to_string()
    })?;
    let py_s = py.to_str().ok_or_else(|| AppError::Internal("python 경로 인코딩 실패".to_string()))?;

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
            reason: format!("pip install fonttools 실패:\n{e}\n{o}")
        });
    }

    if !python_has_fonttools(py_s) {
        return Err(AppError::ToolInstallation {
            tool: "fonttools".to_string(),
            reason: "standalone Python에 fonttools import 실패".to_string()
        });
    }
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
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
        tool: "Python".to_string()
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
    let out = pip_user
        .output()
        .map_err(|e| AppError::ToolExecution {
            tool: "pip".to_string(),
            reason: format!("pip 실행 실패: {e}")
        })?;

    if !out.status.success() {
        let mut pip_global = std::process::Command::new(&py);
        pip_global.args(["-m", "pip", "install", "fonttools"]);
        pip_global.env("PIP_DISABLE_PIP_VERSION_CHECK", "1");
        pip_global.stdin(std::process::Stdio::null());
        #[cfg(target_os = "windows")]
        pip_global.creation_flags(0x08000000);
        let out2 = pip_global
            .output()
            .map_err(|e| AppError::ToolExecution {
                tool: "pip".to_string(),
                reason: format!("pip 실행 실패: {e}")
            })?;
        if !out2.status.success() {
            let e1 = String::from_utf8_lossy(&out.stderr);
            let e2 = String::from_utf8_lossy(&out2.stderr);
            return Err(AppError::ToolInstallation {
                tool: "fonttools".to_string(),
                reason: format!(
                    "설치 실패 (내장 런타임 및 시스템 pip).\n\n[--user]\n{e1}\n\n[전역]\n{e2}"
                )
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
#[tauri::command]
pub async fn check_fonttools() -> Result<bool> {
    let ok = tauri::async_runtime::spawn_blocking(|| python_for_font_merge().is_some())
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(ok)
}

/// 내장 런타임 + pip로 fonttools 확보 (`download_ffmpeg`와 동일 UX)
#[tauri::command]
pub async fn download_fonttools() -> Result<()> {
    tauri::async_runtime::spawn_blocking(install_fonttools_inner)
        .await
        .map_err(|e| AppError::Internal(format!("fonttools 다운로드 실패: {e}")))?
}

/// `install_fonttools`와 동일 (호환용)
#[tauri::command]
pub async fn install_fonttools() -> Result<()> {
    download_fonttools().await
}

#[tauri::command]
pub async fn merge_fonts(base_path: String, merge_path: String, output_path: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Python fonttools를 사용한 폰트 병합
        // A 폰트를 베이스로, B 폰트에서 A에 없는 글리프만 복사
        let script = r#"
import sys
from fontTools.ttLib import TTFont

base = TTFont(sys.argv[1])
source = TTFont(sys.argv[2])
output_path = sys.argv[3]

# cmap 테이블에서 코드포인트 → 글리프 이름 매핑 가져오기
base_cmap = base.getBestCmap() or {}
src_cmap = source.getBestCmap() or {}

# B에만 있는 코드포인트 찾기
missing = set(src_cmap.keys()) - set(base_cmap.keys())

if missing:
    has_glyf = 'glyf' in base and 'glyf' in source

    for cp in missing:
        glyph_name = src_cmap[cp]

        # cmap 테이블에 코드포인트 등록
        for table in base['cmap'].tables:
            if hasattr(table, 'cmap') and table.format in (4, 12):
                table.cmap[cp] = glyph_name

        # glyf 테이블에서 글리프 데이터 복사 (TrueType)
        if has_glyf and glyph_name in source['glyf']:
            base['glyf'][glyph_name] = source['glyf'][glyph_name]

        # hmtx (수평 메트릭) 복사
        if 'hmtx' in base and 'hmtx' in source:
            if glyph_name in source['hmtx'].metrics:
                base['hmtx'][glyph_name] = source['hmtx'].metrics[glyph_name]

        # vmtx (수직 메트릭) 복사 (존재 시)
        if 'vmtx' in base and 'vmtx' in source:
            if glyph_name in source['vmtx'].metrics:
                base['vmtx'][glyph_name] = source['vmtx'].metrics[glyph_name]

    # 글리프 순서 업데이트
    new_glyphs = [src_cmap[cp] for cp in missing if src_cmap[cp] not in base.getGlyphOrder()]
    if new_glyphs:
        base.setGlyphOrder(base.getGlyphOrder() + new_glyphs)

    # maxp 테이블 업데이트 (글리프 수)
    if 'maxp' in base:
        base['maxp'].numGlyphs = len(base.getGlyphOrder())

base.save(output_path)
count = len(missing)
print(f'OK:{count}')
"#;

        let python = python_for_font_merge().ok_or_else(|| AppError::ToolNotFound {
            tool: "fonttools".to_string()
        })?;

        let mut cmd = std::process::Command::new(&python);
        cmd.args(["-c", script, &base_path, &merge_path, &output_path]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let output = cmd
            .output()
            .map_err(|e| AppError::ToolExecution {
                tool: "Python".to_string(),
                reason: e.to_string()
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("No module named 'fontTools'") || stderr.contains("No module named 'fonttools'") {
                return Err(AppError::ToolNotFound {
                    tool: "fonttools 패키지".to_string()
                });
            }
            return Err(AppError::FontProcessing(stderr.to_string()));
        }

        Ok(output_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("폰트 병합 태스크 실패: {}", e)))?
}
