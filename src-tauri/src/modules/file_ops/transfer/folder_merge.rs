use crate::helpers::get_numbered_destination;
use crate::modules::error::{AppError, Result};
use crate::modules::image_ops::{invalidate_thumbnail_cache_paths_in_root, thumbnail_cache_root};

use super::copy_dir_recursive;

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FolderMergeConflictFile {
    pub relative_path: String,
    pub source_modified: u64,
    pub dest_modified: u64,
    pub source_size: u64,
    pub dest_size: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderMergeAnalysis {
    pub source_path: String,
    pub dest_path: String,
    pub folder_name: String,
    pub conflicts: Vec<FolderMergeConflictFile>,
    pub only_source: Vec<String>,
    pub only_dest: Vec<String>,
}

#[derive(serde::Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum FolderMergeConflictMode {
    Rename,
    OverwriteNewer,
    Skip,
}

fn file_modified_ms(path: &std::path::Path) -> u64 {
    path.metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 디렉토리 내 모든 파일의 상대 경로·메타 수집 (키: `/` 구분 상대 경로)
fn collect_relative_files(
    dir: &std::path::Path,
    base: &std::path::Path,
    out: &mut std::collections::HashMap<String, (u64, u64)>,
) -> Result<()> {
    for entry in std::fs::read_dir(dir)?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_relative_files(&path, base, out)?;
        } else {
            let rel = path
                .strip_prefix(base)
                .map_err(|_| AppError::Internal("상대 경로 계산 실패".into()))?;
            let key = rel.to_string_lossy().replace('\\', "/");
            let meta = path.metadata()?;
            out.insert(key, (meta.len(), file_modified_ms(&path)));
        }
    }
    Ok(())
}

fn analyze_folder_merge_paths(
    source: &std::path::Path,
    dest: &std::path::Path,
) -> Result<FolderMergeAnalysis> {
    let mut source_files = std::collections::HashMap::new();
    let mut dest_files = std::collections::HashMap::new();
    collect_relative_files(source, source, &mut source_files)?;
    collect_relative_files(dest, dest, &mut dest_files)?;

    let mut conflicts = Vec::new();
    let mut only_source = Vec::new();
    let mut only_dest = Vec::new();

    for (rel, (src_size, src_mod)) in &source_files {
        if let Some((dest_size, dest_mod)) = dest_files.get(rel) {
            conflicts.push(FolderMergeConflictFile {
                relative_path: rel.clone(),
                source_modified: *src_mod,
                dest_modified: *dest_mod,
                source_size: *src_size,
                dest_size: *dest_size,
            });
        } else {
            only_source.push(rel.clone());
        }
    }
    for rel in dest_files.keys() {
        if !source_files.contains_key(rel) {
            only_dest.push(rel.clone());
        }
    }

    conflicts.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    only_source.sort();
    only_dest.sort();

    let folder_name = source
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(FolderMergeAnalysis {
        source_path: source.to_string_lossy().to_string(),
        dest_path: dest.to_string_lossy().to_string(),
        folder_name,
        conflicts,
        only_source,
        only_dest,
    })
}

/// 같은 이름 폴더 병합 전 양쪽 내용 비교
#[tauri::command]
pub async fn analyze_folder_merge(
    source: String,
    dest_parent: String,
) -> Result<FolderMergeAnalysis> {
    tauri::async_runtime::spawn_blocking(move || {
        let src_path = std::path::Path::new(&source);
        if !src_path.is_dir() {
            return Err(AppError::InvalidInput("소스가 폴더가 아닙니다".into()));
        }
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let dest_path = std::path::Path::new(&dest_parent).join(file_name);
        if !dest_path.is_dir() {
            return Err(AppError::InvalidInput(
                "대상에 같은 이름의 폴더가 없습니다".into(),
            ));
        }
        analyze_folder_merge_paths(src_path, &dest_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("폴더 병합 분석 실패: {}", e)))?
}

fn merge_copy_file(
    src: &std::path::Path,
    dest: &std::path::Path,
    mode: FolderMergeConflictMode,
    app_cache: Option<&std::path::Path>,
) -> Result<()> {
    if dest.exists() {
        match mode {
            FolderMergeConflictMode::Skip => return Ok(()),
            FolderMergeConflictMode::OverwriteNewer => {
                if file_modified_ms(src) <= file_modified_ms(dest) {
                    return Ok(());
                }
                if let Some(app_cache) = app_cache {
                    invalidate_thumbnail_cache_paths_in_root(
                        app_cache,
                        &[dest.to_string_lossy().to_string()],
                    );
                }
                std::fs::copy(src, dest)?;
            }
            FolderMergeConflictMode::Rename => {
                let stem = src
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let ext = src
                    .extension()
                    .map(|e| format!(".{}", e.to_string_lossy()))
                    .unwrap_or_default();
                let parent = dest
                    .parent()
                    .ok_or_else(|| AppError::Internal("대상 파일의 부모 경로 없음".into()))?;
                let numbered = get_numbered_destination(parent, &stem, &ext, false);
                std::fs::copy(src, &numbered)?;
            }
        }
    } else {
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(src, dest)?;
    }
    Ok(())
}

pub(in crate::modules::file_ops) fn merge_folders_recursive(
    source: &std::path::Path,
    dest: &std::path::Path,
    mode: FolderMergeConflictMode,
    app_cache: Option<&std::path::Path>,
) -> Result<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(source)?.flatten() {
        let src_child = entry.path();
        let dest_child = dest.join(entry.file_name());
        if src_child.is_dir() {
            if dest_child.exists() && dest_child.is_dir() {
                merge_folders_recursive(&src_child, &dest_child, mode, app_cache)?;
            } else if !dest_child.exists() {
                copy_dir_recursive(&src_child, &dest_child)?;
            }
            // 파일·폴더 타입 불일치 시 소스 하위는 건너뜀
        } else {
            merge_copy_file(&src_child, &dest_child, mode, app_cache)?;
        }
    }
    Ok(())
}

/// 스마트 폴더 병합 실행 (is_move=true면 병합 후 소스 폴더 삭제)
#[tauri::command]
pub async fn merge_folders(
    app: tauri::AppHandle,
    source: String,
    dest_parent: String,
    conflict_mode: FolderMergeConflictMode,
    is_move: bool,
) -> Result<()> {
    let app_cache = thumbnail_cache_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let src_path = std::path::Path::new(&source);
        if !src_path.is_dir() {
            return Err(AppError::InvalidInput("소스가 폴더가 아닙니다".into()));
        }
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let dest_path = std::path::Path::new(&dest_parent).join(file_name);
        if !dest_path.is_dir() {
            return Err(AppError::InvalidInput(
                "대상에 같은 이름의 폴더가 없습니다".into(),
            ));
        }

        if let Some(app_cache) = Some(&app_cache) {
            invalidate_thumbnail_cache_paths_in_root(
                app_cache,
                &[dest_path.to_string_lossy().to_string()],
            );
        }

        merge_folders_recursive(src_path, &dest_path, conflict_mode, Some(&app_cache))?;

        if is_move {
            if let Some(app_cache) = Some(&app_cache) {
                invalidate_thumbnail_cache_paths_in_root(app_cache, &[source.clone()]);
            }
            std::fs::remove_dir_all(src_path)?;
        }

        Ok(())
    })
    .await
    .map_err(|e| AppError::Internal(format!("폴더 병합 실패: {}", e)))?
}
