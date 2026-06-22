use super::paths::fonttools_embed_root;
#[cfg(target_os = "windows")]
use crate::modules::error::{AppError, Result};

// ─── Windows 헬퍼 함수 ─────────────────────────────────────────────────

/// Windows embeddable 배포판에서 `import site` 활성화 (pip / site-packages 사용)
/// 현재 미사용 — embeddable 폴백 경로 복구용으로 보존
#[cfg(target_os = "windows")]
#[allow(dead_code)]
pub(super) fn windows_embed_enable_import_site(embed_dir: &std::path::Path) -> Result<()> {
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
    Err(AppError::Internal(
        "python*._pth 를 찾지 못했습니다.".to_string(),
    ))
}

/// 현재 미사용 — embeddable 폴백 경로 복구용으로 보존
#[cfg(target_os = "windows")]
#[allow(dead_code)]
pub(super) fn windows_run_embed_python_cmd(
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
        reason: e.to_string(),
    })
}

#[cfg(target_os = "windows")]
pub(super) fn python_exe_responds(path: &std::path::Path) -> bool {
    use std::os::windows::process::CommandExt;
    let mut c = std::process::Command::new(path);
    c.arg("--version");
    c.stdout(std::process::Stdio::null());
    c.stderr(std::process::Stdio::null());
    c.creation_flags(0x08000000);
    c.status().map(|s| s.success()).unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
pub(super) fn python_exe_responds(path: &std::path::Path) -> bool {
    std::process::Command::new(path)
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

// ─── Python 경로 탐색 헬퍼 ─────────────────────────────────────────────

#[cfg(any(target_os = "macos", target_os = "linux"))]
pub(super) fn find_python3_in_bin(bin: &std::path::Path) -> Option<std::path::PathBuf> {
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
pub(super) fn find_fonttools_sidecar_python() -> Option<std::path::PathBuf> {
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
pub(super) fn find_python_via_py_launcher() -> Option<String> {
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
pub(super) fn find_python_via_registry() -> Option<String> {
    use super::super::constants::registry::{REG_TYPE_EXPAND_SZ_LEN, REG_TYPE_SZ_LEN};
    use std::os::windows::process::CommandExt;
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
                    line.get(i + REG_TYPE_EXPAND_SZ_LEN..)
                        .unwrap_or("")
                        .trim_start()
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
pub(super) fn find_python_local_appdata_programs() -> Option<String> {
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
pub(super) fn find_python_macos_common_paths() -> Option<String> {
    for p in [
        "/opt/homebrew/bin/python3",
        "/usr/local/bin/python3",
        "/usr/bin/python3",
    ] {
        let path = std::path::Path::new(p);
        if path.exists() && python_exe_responds(path) {
            return Some(p.to_string());
        }
    }
    None
}

/// Python 실행 파일 경로 찾기 (Tauri GUI는 PATH가 비어 있는 경우가 많아 py 런처·레지스트리·일반 경로를 순회)
pub(super) fn find_python() -> Option<String> {
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

pub(super) fn python_has_fonttools(python: &str) -> bool {
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
pub(super) fn python_for_font_merge() -> Option<String> {
    if let Some(p) = find_fonttools_sidecar_python() {
        if let Some(s) = p.to_str() {
            if python_has_fonttools(s) {
                return Some(s.to_string());
            }
        }
    }
    find_python().filter(|p| python_has_fonttools(p))
}
