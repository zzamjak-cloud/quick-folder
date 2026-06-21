mod duplicate;
mod folder_merge;
mod progress;

pub use duplicate::{check_duplicate_items, duplicate_items};
#[cfg(test)]
pub(super) use folder_merge::merge_folders_recursive;
pub use folder_merge::{
    analyze_folder_merge, merge_folders, FolderMergeAnalysis, FolderMergeConflictFile,
    FolderMergeConflictMode,
};
pub use progress::{CopyProgress, TransferFileItem, TransferQueueProgress};

use crate::helpers::get_copy_destination;
use crate::modules::error::{AppError, Result};
use crate::modules::image_ops::{invalidate_thumbnail_cache_paths_in_root, thumbnail_cache_root};

pub fn copy_dir_recursive(src: &std::path::Path, dest: &std::path::Path) -> Result<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)?.flatten() {
        let dest_child = dest.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_recursive(&entry.path(), &dest_child)?;
        } else {
            std::fs::copy(entry.path(), &dest_child)?;
        }
    }
    Ok(())
}

/// copy_items와 동일한 대상 경로 결정 (실제로 복사할 (소스, 대상) 쌍만 수집)
pub(super) fn collect_copy_jobs(
    sources: &[String],
    dest: &std::path::Path,
    overwrite: bool,
    app_cache: Option<&std::path::Path>,
) -> Result<Vec<(std::path::PathBuf, std::path::PathBuf)>> {
    let mut jobs = Vec::new();
    for source in sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let mut dest_path = dest.join(file_name);

        if dest_path.exists() && dest_path.canonicalize().ok() == src_path.canonicalize().ok() {
            let stem = src_path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let ext = src_path
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();
            let is_dir = src_path.is_dir();
            dest_path = get_copy_destination(dest, &stem, &ext, is_dir);
        } else if dest_path.exists() && overwrite {
            if let Some(app_cache) = app_cache {
                invalidate_thumbnail_cache_paths_in_root(
                    app_cache,
                    &[dest_path.to_string_lossy().to_string()],
                );
            }
            if dest_path.is_dir() {
                std::fs::remove_dir_all(&dest_path)?;
            } else {
                std::fs::remove_file(&dest_path)?;
            }
        } else if dest_path.exists() {
            continue;
        }
        jobs.push((src_path.to_path_buf(), dest_path));
    }
    Ok(jobs)
}

/// move_items와 동일한 대상 경로 결정 (실제 이동은 하지 않음)
pub(super) fn collect_move_jobs(
    sources: &[String],
    dest: &std::path::Path,
    overwrite: bool,
    app_cache: Option<&std::path::Path>,
) -> Result<Vec<(std::path::PathBuf, std::path::PathBuf)>> {
    let mut jobs = Vec::new();
    for source in sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let dest_path = dest.join(file_name);

        if dest_path.exists() && dest_path.canonicalize().ok() != src_path.canonicalize().ok() {
            if overwrite {
                if let Some(app_cache) = app_cache {
                    invalidate_thumbnail_cache_paths_in_root(
                        app_cache,
                        &[dest_path.to_string_lossy().to_string()],
                    );
                }
                if dest_path.is_dir() {
                    std::fs::remove_dir_all(&dest_path)?;
                } else {
                    std::fs::remove_file(&dest_path)?;
                }
            } else {
                continue;
            }
        }

        jobs.push((src_path.to_path_buf(), dest_path));
    }
    Ok(jobs)
}

pub(super) fn count_files_to_copy(path: &std::path::Path) -> Result<u64> {
    use walkdir::WalkDir;
    if path.is_file() {
        return Ok(1);
    }
    if !path.is_dir() {
        return Ok(0);
    }
    let mut n = 0u64;
    for entry in WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            n += 1;
        }
    }
    Ok(n)
}

// ===== 복사 =====

// 파일/폴더 복사 (재귀 지원, overwrite=true면 기존 파일 덮어쓰기)
pub(super) async fn copy_items_impl(
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
    app_cache: Option<&std::path::Path>,
) -> Result<()> {
    let overwrite = overwrite.unwrap_or(false);
    for source in &sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let mut dest_path = std::path::Path::new(&dest).join(file_name);

        // 같은 경로 충돌 시 "(복사)", "(복사 2)" 접미사 추가
        if dest_path.exists() && dest_path.canonicalize().ok() == src_path.canonicalize().ok() {
            let stem = src_path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let ext = src_path
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();
            let is_dir = src_path.is_dir();
            dest_path = get_copy_destination(std::path::Path::new(&dest), &stem, &ext, is_dir);
        } else if dest_path.exists() && overwrite {
            // 덮어쓰기: 기존 파일/폴더 삭제 후 복사
            if let Some(app_cache) = app_cache {
                invalidate_thumbnail_cache_paths_in_root(
                    app_cache,
                    &[dest_path.to_string_lossy().to_string()],
                );
            }
            if dest_path.is_dir() {
                std::fs::remove_dir_all(&dest_path)?;
            } else {
                std::fs::remove_file(&dest_path)?;
            }
        } else if dest_path.exists() {
            // 덮어쓰기 안 함: 스킵
            continue;
        }

        if src_path.is_dir() {
            copy_dir_recursive(src_path, &dest_path)?;
        } else {
            std::fs::copy(src_path, &dest_path)?;
        }
    }
    Ok(())
}

// 파일/폴더 복사 (재귀 지원, overwrite=true면 기존 파일 덮어쓰기)
#[tauri::command]
pub async fn copy_items(
    app: tauri::AppHandle,
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
) -> Result<()> {
    let app_cache = thumbnail_cache_root(&app)?;
    copy_items_impl(sources, dest, overwrite, Some(&app_cache)).await
}

/// 파일 단위 진행률(0~100%)을 Channel로 전송하는 복사 (클라우드 드라이브 등 대용량 복사용)
#[tauri::command]
pub async fn copy_items_with_progress(
    app: tauri::AppHandle,
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
    on_progress: tauri::ipc::Channel<CopyProgress>,
) -> Result<()> {
    let overwrite = overwrite.unwrap_or(false);
    let dest_path = std::path::PathBuf::from(dest);
    let app_cache = thumbnail_cache_root(&app)?;
    let on_progress = on_progress.clone();

    tauri::async_runtime::spawn_blocking(move || {
        progress::run_copy_with_progress(sources, dest_path, overwrite, app_cache, on_progress)
    })
    .await
    .map_err(|e| AppError::Internal(format!("복사 작업 실패: {}", e)))?
}

/// 작업 큐 패널용 복사/이동 (파일별 진행률 + 전체 카운트)
#[tauri::command]
pub async fn transfer_items_with_progress(
    app: tauri::AppHandle,
    operation: String,
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
    on_progress: tauri::ipc::Channel<TransferQueueProgress>,
) -> Result<()> {
    let overwrite = overwrite.unwrap_or(false);
    let dest_path = std::path::PathBuf::from(dest);
    let app_cache = thumbnail_cache_root(&app)?;
    let on_progress = on_progress.clone();
    let op = operation.clone();

    tauri::async_runtime::spawn_blocking(move || {
        progress::run_transfer_with_queue(
            &op,
            &sources,
            &dest_path,
            overwrite,
            Some(&app_cache),
            &on_progress,
        )
    })
    .await
    .map_err(|e| AppError::Internal(format!("전송 작업 실패: {}", e)))?
}

// ===== 이동 =====

// 파일/폴더 이동 (overwrite=true면 기존 파일 덮어쓰기)
pub(super) async fn move_items_impl(
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
    app_cache: Option<&std::path::Path>,
) -> Result<()> {
    let overwrite = overwrite.unwrap_or(false);
    for source in &sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let dest_path = std::path::Path::new(&dest).join(file_name);

        // 대상에 같은 이름 파일이 있으면 덮어쓰기 처리
        if dest_path.exists() && dest_path.canonicalize().ok() != src_path.canonicalize().ok() {
            if overwrite {
                if let Some(app_cache) = app_cache {
                    invalidate_thumbnail_cache_paths_in_root(
                        app_cache,
                        &[dest_path.to_string_lossy().to_string()],
                    );
                }
                if dest_path.is_dir() {
                    std::fs::remove_dir_all(&dest_path)?;
                } else {
                    std::fs::remove_file(&dest_path)?;
                }
            } else {
                continue; // 덮어쓰기 안 함: 스킵
            }
        }

        if let Some(app_cache) = app_cache {
            invalidate_thumbnail_cache_paths_in_root(app_cache, std::slice::from_ref(source));
        }

        // 같은 볼륨이면 rename, 다른 볼륨이면 복사 후 삭제
        if std::fs::rename(src_path, &dest_path).is_err() {
            if src_path.is_dir() {
                copy_dir_recursive(src_path, &dest_path)?;
                std::fs::remove_dir_all(src_path)?;
            } else {
                std::fs::copy(src_path, &dest_path)?;
                std::fs::remove_file(src_path)?;
            }
        }
    }
    Ok(())
}

// 파일/폴더 이동 (overwrite=true면 기존 파일 덮어쓰기)
#[tauri::command]
pub async fn move_items(
    app: tauri::AppHandle,
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
) -> Result<()> {
    let app_cache = thumbnail_cache_root(&app)?;
    move_items_impl(sources, dest, overwrite, Some(&app_cache)).await
}
