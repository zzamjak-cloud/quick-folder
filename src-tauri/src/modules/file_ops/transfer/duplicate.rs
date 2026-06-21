use crate::helpers::get_copy_destination;
use crate::modules::error::{AppError, Result};

use super::copy_dir_recursive;

// 대상 디렉토리에서 중복되는 파일명 확인
#[tauri::command]
pub async fn check_duplicate_items(sources: Vec<String>, dest: String) -> Result<Vec<String>> {
    let mut duplicates = Vec::new();
    for source in &sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let dest_path = std::path::Path::new(&dest).join(file_name);
        // 같은 파일이 아닌 다른 파일이 이미 존재하는 경우만 중복으로 판단
        if dest_path.exists() && dest_path.canonicalize().ok() != src_path.canonicalize().ok() {
            duplicates.push(file_name.to_string_lossy().to_string());
        }
    }
    Ok(duplicates)
}

// 파일/폴더 복제 (같은 디렉토리에 " (복사)" 접미사)
#[tauri::command]
pub async fn duplicate_items(paths: Vec<String>) -> Result<Vec<String>> {
    let mut new_paths = vec![];
    for source in &paths {
        let src = std::path::Path::new(source);
        let parent = src
            .parent()
            .ok_or_else(|| AppError::InvalidInput(format!("상위 디렉토리 없음: {}", source)))?;
        let stem = src
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let ext = src
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        let is_dir = src.is_dir();

        // 충돌 방지: " (복사)", " (복사 2)", " (복사 3)" ...
        let dest_path = get_copy_destination(parent, &stem, &ext, is_dir);

        if is_dir {
            copy_dir_recursive(src, &dest_path)?;
        } else {
            std::fs::copy(src, &dest_path)?;
        }
        new_paths.push(dest_path.to_string_lossy().to_string());
    }
    Ok(new_paths)
}
