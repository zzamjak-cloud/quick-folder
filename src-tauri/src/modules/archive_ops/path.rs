use super::{ArchiveVirtualPath, BROWSABLE_ARCHIVE_SUFFIXES};
use crate::modules::error::Result;
use std::path::{Path, PathBuf};

pub(super) fn is_separator(byte: u8) -> bool {
    byte == b'/' || byte == b'\\'
}

pub(super) fn archive_path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

pub fn is_browsable_archive_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    BROWSABLE_ARCHIVE_SUFFIXES
        .iter()
        .any(|suffix| lower.ends_with(suffix))
}

pub(super) fn is_zip_archive_path(path: &Path) -> bool {
    path.to_string_lossy().to_lowercase().ends_with(".zip")
}

pub fn build_archive_root_virtual_path(archive_path: &str, separator: char) -> String {
    let mut root = archive_path.to_string();
    if !root.ends_with(separator) {
        root.push(separator);
    }
    root
}

pub(super) fn build_archive_virtual_path(
    resolved: &ArchiveVirtualPath,
    child_name: &str,
) -> String {
    let root = build_archive_root_virtual_path(&resolved.logical_archive_path, resolved.separator);
    let inner = match resolved.inner_path.as_deref() {
        Some(inner) if !inner.is_empty() => {
            let mut value = inner.replace('/', &resolved.separator.to_string());
            if !value.ends_with(resolved.separator) {
                value.push(resolved.separator);
            }
            value
        }
        _ => String::new(),
    };
    let child = child_name.replace('/', &resolved.separator.to_string());
    format!("{}{}{}", root, inner, child)
}

pub(super) fn resolve_archive_virtual_path_with_loader<F>(
    path: &str,
    mut materialize_nested_archive: F,
) -> Result<Option<ArchiveVirtualPath>>
where
    F: FnMut(&str) -> Result<Option<PathBuf>>,
{
    let bytes = path.as_bytes();
    let separator = if path.contains('\\') { '\\' } else { '/' };
    let mut resolved = None;

    for (idx, byte) in bytes.iter().enumerate() {
        if !is_separator(*byte) {
            continue;
        }

        let prefix = &path[..idx];
        if !is_browsable_archive_path(prefix) {
            continue;
        }

        let archive_path = if Path::new(prefix).is_file() {
            Some(PathBuf::from(prefix))
        } else {
            materialize_nested_archive(prefix)?
        };
        let Some(archive_path) = archive_path else {
            continue;
        };

        let rest = path[idx + 1..].trim_matches(['/', '\\']);
        resolved = Some(ArchiveVirtualPath {
            archive_path,
            logical_archive_path: prefix.to_string(),
            inner_path: if rest.is_empty() {
                None
            } else {
                Some(rest.replace('\\', "/"))
            },
            separator,
        });
    }

    Ok(resolved)
}

#[cfg(test)]
pub(super) fn resolve_archive_virtual_path(path: &str) -> Option<ArchiveVirtualPath> {
    resolve_archive_virtual_path_with_loader(path, |_| Ok(None))
        .ok()
        .flatten()
}

pub fn resolve_archive_virtual_path_with_app<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    path: &str,
) -> Result<Option<ArchiveVirtualPath>> {
    resolve_archive_virtual_path_with_loader(path, |prefix| {
        super::materialize::materialize_archive_path_in_cache(app, prefix)
    })
}
