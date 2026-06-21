use super::{
    path::{build_archive_virtual_path, resolve_archive_virtual_path_with_app},
    records::list_archive_records,
    ArchiveVirtualPath,
};
use crate::modules::error::{AppError, Result};
use crate::modules::types::{classify_file, FileEntry, FileType};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy)]
struct ArchiveChildRecord {
    is_dir: bool,
    size: u64,
}

pub(super) fn list_archive_directory_resolved(
    resolved: &ArchiveVirtualPath,
) -> Result<Vec<FileEntry>> {
    let path = "";
    let resolved = Some(resolved)
        .ok_or_else(|| AppError::InvalidInput(format!("압축 가상 경로가 아닙니다: {}", path)))?;
    let prefix = resolved
        .inner_path
        .as_deref()
        .map(|value| format!("{}/", value.trim_matches('/')));

    let mut children: BTreeMap<String, ArchiveChildRecord> = BTreeMap::new();
    for record in list_archive_records(&resolved.archive_path)? {
        let remainder = if let Some(prefix_value) = &prefix {
            if !record.normalized_path.starts_with(prefix_value) {
                continue;
            }
            &record.normalized_path[prefix_value.len()..]
        } else {
            &record.normalized_path
        };

        if remainder.is_empty() {
            continue;
        }

        if let Some((child_name, _)) = remainder.split_once('/') {
            children.insert(
                child_name.to_string(),
                ArchiveChildRecord {
                    is_dir: true,
                    size: 0,
                },
            );
        } else {
            let existing = children
                .get(remainder)
                .copied()
                .unwrap_or(ArchiveChildRecord {
                    is_dir: false,
                    size: 0,
                });
            let is_dir = existing.is_dir || record.is_dir;
            children.insert(
                remainder.to_string(),
                ArchiveChildRecord {
                    is_dir,
                    size: if is_dir { 0 } else { record.size },
                },
            );
        }
    }

    Ok(children
        .into_iter()
        .map(|(name, child)| FileEntry {
            path: build_archive_virtual_path(resolved, &name),
            is_dir: child.is_dir,
            size: child.size,
            modified: 0,
            file_type: if child.is_dir {
                FileType::Directory
            } else {
                classify_file(&name)
            },
            name,
        })
        .collect())
}

pub fn list_archive_directory<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    path: &str,
) -> Result<Vec<FileEntry>> {
    let resolved = resolve_archive_virtual_path_with_app(app, path)?.ok_or_else(|| {
        AppError::InvalidInput(format!("압축 가상 경로가 올바르지 않습니다: {}", path))
    })?;
    list_archive_directory_resolved(&resolved)
}
