//! Ghostscript 관련 도구 관리
//! Ghostscript 경로 탐색, 다운로드, 설치 및 PDF 압축

mod download;
mod install;
mod macos;
mod path;
mod pdf;
mod windows;

use crate::modules::error::Result;

pub use path::find_gs_path;

#[tauri::command]
pub async fn check_gs() -> Result<bool> {
    install::check_gs().await
}

#[tauri::command]
pub async fn download_gs() -> Result<()> {
    install::download_gs().await
}

#[tauri::command]
pub async fn install_gs() -> Result<()> {
    install::install_gs().await
}

#[tauri::command]
pub async fn compress_pdf(input: String) -> Result<String> {
    pdf::compress_pdf(input).await
}
