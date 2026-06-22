use crate::modules::error::{AppError, Result};

pub(super) fn ureq_download_to_path(
    url: &str,
    max_bytes: u64,
    dest: &std::path::Path,
) -> Result<()> {
    let mut response = ureq::get(url).call().map_err(|e| AppError::ToolDownload {
        tool: "Ghostscript".to_string(),
        reason: format!("HTTP GET 실패: {e}"),
    })?;
    let bytes = response
        .body_mut()
        .with_config()
        .limit(max_bytes)
        .read_to_vec()
        .map_err(|e| AppError::ToolDownload {
            tool: "Ghostscript".to_string(),
            reason: format!("본문 읽기 실패: {e}"),
        })?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(dest, &bytes)?;
    Ok(())
}
