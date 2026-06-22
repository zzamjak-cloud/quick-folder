use crate::modules::error::{AppError, Result};

// ─── ZIP/TAR 압축 해제 헬퍼 ────────────────────────────────────────────

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

pub(super) fn ureq_download_to_path(
    url: &str,
    max_bytes: u64,
    dest: &std::path::Path,
) -> Result<()> {
    let mut response = ureq::get(url).call().map_err(|e| AppError::ToolDownload {
        tool: "fonttools".to_string(),
        reason: format!("HTTP GET 실패: {e}"),
    })?;
    let bytes = response
        .body_mut()
        .with_config()
        .limit(max_bytes)
        .read_to_vec()
        .map_err(|e| AppError::ToolDownload {
            tool: "fonttools".to_string(),
            reason: format!("본문 읽기 실패: {e}"),
        })?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(dest, &bytes)?;
    Ok(())
}

/// Unix: `tar -xzf` (macOS/Linux install_only tarball)
#[cfg(any(target_os = "macos", target_os = "linux"))]
pub(super) fn extract_tar_gz(archive: &std::path::Path, dest: &std::path::Path) -> Result<()> {
    std::fs::create_dir_all(dest)?;
    let s = archive
        .to_str()
        .ok_or_else(|| AppError::Internal("tar 경로 인코딩 실패".to_string()))?;
    let d = dest
        .to_str()
        .ok_or_else(|| AppError::Internal("출력 경로 인코딩 실패".to_string()))?;
    let st = std::process::Command::new("tar")
        .args(["-xzf", s, "-C", d])
        .status()
        .map_err(|e| AppError::ToolExecution {
            tool: "tar".to_string(),
            reason: format!("tar 실행 실패: {e}"),
        })?;
    if !st.success() {
        return Err(AppError::ToolExecution {
            tool: "tar".to_string(),
            reason: "압축 해제 실패".to_string(),
        });
    }
    Ok(())
}
