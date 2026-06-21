use super::{
    extract::{archive_path_to_dest, extract_archive_patterns_to_dir},
    path::{archive_path_string, resolve_archive_virtual_path_with_app},
};
use crate::helpers::{get_copy_destination, stable_cache_key};
use crate::modules::error::{AppError, Result};
use crate::modules::file_ops::copy_dir_recursive;
use std::path::{Path, PathBuf};

fn archive_cache_root<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    archive_path: &Path,
) -> Result<PathBuf> {
    use tauri::Manager;

    let meta = std::fs::metadata(archive_path)?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|| "0".to_string());
    let size = meta.len().to_string();

    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Internal(e.to_string()))?
        .join("archive_materialized");
    let archive_key = stable_cache_key(&[
        b"archive-materialized-v1",
        archive_path_string(archive_path).as_bytes(),
        modified.as_bytes(),
        size.as_bytes(),
    ]);
    Ok(cache_dir.join(archive_key))
}

pub fn materialize_archive_path_in_cache<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    virtual_path: &str,
) -> Result<Option<PathBuf>> {
    let resolved = match resolve_archive_virtual_path_with_app(app, virtual_path)? {
        Some(value) => value,
        None => return Ok(None),
    };

    let inner_path = resolved.inner_path.clone().ok_or_else(|| {
        AppError::InvalidInput("압축 파일 루트는 직접 materialize 할 수 없습니다".to_string())
    })?;
    let cache_root = archive_cache_root(app, &resolved.archive_path)?.join("content");
    let output_path = archive_path_to_dest(&cache_root, &inner_path)?;
    if output_path.exists() {
        return Ok(Some(output_path));
    }

    extract_archive_patterns_to_dir(&resolved.archive_path, &[inner_path], &cache_root)?;
    if output_path.exists() {
        Ok(Some(output_path))
    } else {
        Err(AppError::NotFound(format!(
            "압축 내부 항목을 찾을 수 없습니다: {}",
            virtual_path
        )))
    }
}

fn copy_materialized_entry_to_batch(src: &Path, batch_root: &Path) -> Result<PathBuf> {
    let file_name = src
        .file_name()
        .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", src.display())))?
        .to_string_lossy()
        .to_string();

    if src.is_dir() {
        let dest = get_copy_destination(batch_root, &file_name, "", true);
        copy_dir_recursive(src, &dest)?;
        return Ok(dest);
    }

    let stem = src
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| file_name.clone());
    let ext = src
        .extension()
        .map(|value| format!(".{}", value.to_string_lossy()))
        .unwrap_or_default();
    let dest = get_copy_destination(batch_root, &stem, &ext, false);
    std::fs::copy(src, &dest)?;
    Ok(dest)
}

#[tauri::command]
pub async fn materialize_archive_paths(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<String>> {
        use tauri::Manager;

        let batch_root = app
            .path()
            .app_cache_dir()
            .map_err(|e| AppError::Internal(e.to_string()))?
            .join("archive_drag_batches")
            .join(stable_cache_key(&[
                b"archive-drag-batch-v1",
                format!("{:?}", std::time::SystemTime::now()).as_bytes(),
            ]));
        std::fs::create_dir_all(&batch_root)?;

        let mut output_paths = Vec::with_capacity(paths.len());
        for path in &paths {
            match materialize_archive_path_in_cache(&app, path)? {
                Some(materialized) => {
                    let copied = copy_materialized_entry_to_batch(&materialized, &batch_root)?;
                    output_paths.push(copied.to_string_lossy().to_string());
                }
                None => output_paths.push(path.clone()),
            }
        }

        Ok(output_paths)
    })
    .await
    .map_err(|e| AppError::Internal(format!("압축 파일 materialize 태스크 실패: {}", e)))?
}
