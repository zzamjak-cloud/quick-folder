//! Python fonttools 관련 도구 관리
//! fonttools 경로 탐색, 다운로드, 설치 및 폰트 병합

mod archive;
mod install;
mod merge;
mod paths;
mod python;

use crate::modules::error::Result;

#[tauri::command]
pub async fn check_fonttools() -> Result<bool> {
    install::check_fonttools().await
}

#[tauri::command]
pub async fn download_fonttools() -> Result<()> {
    install::download_fonttools().await
}

#[tauri::command]
pub async fn install_fonttools() -> Result<()> {
    install::install_fonttools().await
}

#[tauri::command]
pub async fn merge_fonts(
    base_path: String,
    merge_path: String,
    output_path: String,
) -> Result<String> {
    merge::merge_fonts(base_path, merge_path, output_path).await
}
