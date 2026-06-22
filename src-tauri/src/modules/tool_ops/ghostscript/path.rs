#[cfg(target_os = "macos")]
use super::macos::gs_portable_root;

pub fn find_gs_path() -> Option<String> {
    // 1. 번들링된 바이너리 (실행 파일 옆, Tauri externalBin)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            #[cfg(target_os = "windows")]
            let bundled = dir.join("gs.exe");
            #[cfg(not(target_os = "windows"))]
            let bundled = dir.join("gs");

            if bundled.exists()
                && std::fs::metadata(&bundled)
                    .map(|m| m.len() > 1024)
                    .unwrap_or(false)
            {
                // 실제 실행 가능한지 검증 (macOS 스텁 바이너리 필터링)
                let works = std::process::Command::new(&bundled)
                    .arg("--version")
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .status()
                    .map(|s| s.success())
                    .unwrap_or(false);
                if works {
                    eprintln!("✅ 번들링된 Ghostscript 발견: {:?}", bundled);
                    return bundled.to_str().map(|s| s.to_string());
                }
                eprintln!(
                    "⚠️ 번들링된 gs 존재하나 실행 불가 (스텁 또는 dylib 누락): {:?}",
                    bundled
                );
            }
        }
    }

    // 2. macOS 포터블 패키지 (gs_portable/bin/gs) — --version 실행하지 않음 (GS_LIB 없이 hang)
    #[cfg(target_os = "macos")]
    {
        let portable_gs = gs_portable_root().join("bin").join("gs");
        if portable_gs.exists()
            && std::fs::metadata(&portable_gs)
                .map(|m| m.len() > 10000)
                .unwrap_or(false)
        {
            eprintln!("✅ 포터블 Ghostscript 발견: {:?}", portable_gs);
            return portable_gs.to_str().map(|s| s.to_string());
        }
    }

    // 3. Windows 포터블 패키지 (gs_sidecar/bin/gswin64c.exe)
    #[cfg(target_os = "windows")]
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let sidecar_gs = dir.join("gs_sidecar").join("bin").join("gswin64c.exe");
            if sidecar_gs.exists()
                && std::fs::metadata(&sidecar_gs)
                    .map(|m| m.len() > 0)
                    .unwrap_or(false)
            {
                eprintln!("✅ 포터블 Ghostscript (sidecar) 발견: {:?}", sidecar_gs);
                return sidecar_gs.to_str().map(|s| s.to_string());
            }
        }
    }

    // 4. 시스템 PATH
    #[cfg(target_os = "windows")]
    let gs_cmd = "gswin64c";
    #[cfg(not(target_os = "windows"))]
    let gs_cmd = "gs";

    if std::process::Command::new(gs_cmd)
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
    {
        eprintln!("✅ 시스템 PATH에서 Ghostscript 발견");
        return Some(gs_cmd.to_string());
    }

    eprintln!("❌ Ghostscript를 찾을 수 없습니다");
    None
}
