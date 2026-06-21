//! 압축 파일 가상 탐색/선택 추출 모듈
//!
//! 실제 파일시스템에 풀지 않고 압축 파일 내부를 "폴더처럼" 탐색하기 위한
//! 공통 헬퍼와 Tauri command를 제공합니다.

use crate::helpers::{get_copy_destination, percent_decode_utf8, stable_cache_key};
use crate::modules::error::{AppError, Result};
use crate::modules::file_ops::copy_dir_recursive;
use crate::modules::types::{classify_file, FileEntry, FileType};
use std::collections::BTreeMap;
use std::ffi::OsString;
use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};

const BROWSABLE_ARCHIVE_SUFFIXES: &[&str] = &[
    ".zip", ".rar", ".7z", ".tar", ".tgz", ".tar.gz", ".tbz2", ".tar.bz2", ".txz", ".tar.xz",
];

#[derive(Debug, Clone)]
pub struct ArchiveVirtualPath {
    pub archive_path: PathBuf,
    pub logical_archive_path: String,
    pub inner_path: Option<String>,
    pub separator: char,
}

#[derive(Debug)]
struct ArchiveEntryRecord {
    normalized_path: String,
    is_dir: bool,
    size: u64,
}

#[derive(Debug, Clone, Copy)]
struct ArchiveChildRecord {
    is_dir: bool,
    size: u64,
}

fn tar_program() -> &'static str {
    if cfg!(target_os = "windows") {
        "tar.exe"
    } else {
        "tar"
    }
}

fn is_separator(byte: u8) -> bool {
    byte == b'/' || byte == b'\\'
}

fn archive_path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

pub fn is_browsable_archive_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    BROWSABLE_ARCHIVE_SUFFIXES
        .iter()
        .any(|suffix| lower.ends_with(suffix))
}

fn is_zip_archive_path(path: &Path) -> bool {
    path.to_string_lossy().to_lowercase().ends_with(".zip")
}

pub fn build_archive_root_virtual_path(archive_path: &str, separator: char) -> String {
    let mut root = archive_path.to_string();
    if !root.ends_with(separator) {
        root.push(separator);
    }
    root
}

fn build_archive_virtual_path(resolved: &ArchiveVirtualPath, child_name: &str) -> String {
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

fn normalize_archive_entry_name(raw: &str, size: u64) -> Option<ArchiveEntryRecord> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let unified = trimmed.replace('\\', "/");
    let stripped = unified.trim_start_matches("./").trim_start_matches('/');
    if stripped.is_empty() {
        return None;
    }

    let is_dir = stripped.ends_with('/');
    let normalized_path = stripped.trim_end_matches('/').to_string();
    if normalized_path.is_empty() {
        return None;
    }

    Some(ArchiveEntryRecord {
        normalized_path,
        is_dir,
        size,
    })
}

fn contains_hangul(value: &str) -> bool {
    value
        .chars()
        .any(|ch| ('\u{ac00}'..='\u{d7a3}').contains(&ch))
}

fn decode_percent_encoded_archive_path(path: &str) -> String {
    let mut decoded = String::with_capacity(path.len());
    let mut component = String::new();

    for ch in path.chars() {
        if ch == '/' || ch == '\\' {
            decoded.push_str(&percent_decode_utf8(&component));
            component.clear();
            decoded.push(ch);
            continue;
        }

        component.push(ch);
    }

    decoded.push_str(&percent_decode_utf8(&component));
    decoded
}

fn decode_zip_entry_name(raw: &[u8], fallback: &str) -> String {
    if let Ok(value) = std::str::from_utf8(raw) {
        return decode_percent_encoded_archive_path(value);
    }

    let (decoded, _, had_errors) = encoding_rs::EUC_KR.decode(raw);
    if !had_errors && contains_hangul(&decoded) {
        return decode_percent_encoded_archive_path(&decoded);
    }

    decode_percent_encoded_archive_path(fallback)
}

fn decode_archive_tool_output(bytes: &[u8]) -> String {
    if let Ok(value) = std::str::from_utf8(bytes) {
        return value.to_string();
    }

    let (decoded, _, had_errors) = encoding_rs::EUC_KR.decode(bytes);
    if !had_errors {
        return decoded.into_owned();
    }

    String::from_utf8_lossy(bytes).to_string()
}

fn archive_path_to_dest(root: &Path, normalized_path: &str) -> Result<PathBuf> {
    let mut output = root.to_path_buf();
    for part in normalized_path.split('/') {
        if part.is_empty() || part == "." || part == ".." {
            return Err(AppError::InvalidInput(format!(
                "?섎せ???뺤텞 ??ぉ 寃쎈줈: {}",
                normalized_path
            )));
        }
        output.push(part);
    }
    Ok(output)
}

fn run_tar_output(args: &[OsString]) -> Result<std::process::Output> {
    let output = std::process::Command::new(tar_program())
        .args(args)
        .output()
        .map_err(|e| AppError::ToolExecution {
            tool: tar_program().to_string(),
            reason: e.to_string(),
        })?;

    if output.status.success() {
        Ok(output)
    } else {
        let stderr = decode_archive_tool_output(&output.stderr).trim().to_string();
        Err(AppError::ToolExecution {
            tool: tar_program().to_string(),
            reason: if stderr.is_empty() {
                format!("종료 코드 {}", output.status)
            } else {
                stderr
            },
        })
    }
}

fn list_zip_records(archive_path: &Path) -> Result<Vec<ArchiveEntryRecord>> {
    let file = File::open(archive_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    let mut records = Vec::new();

    for index in 0..archive.len() {
        let file = archive.by_index(index)?;
        let name = decode_zip_entry_name(file.name_raw(), file.name());
        if let Some(record) = normalize_archive_entry_name(&name, file.size()) {
            records.push(record);
        }
    }

    Ok(records)
}

fn parse_tar_verbose_size(line: &str) -> u64 {
    line.split_whitespace()
        .skip(1)
        .take(4)
        .filter_map(|value| value.parse::<u64>().ok())
        .last()
        .unwrap_or(0)
}

fn list_tar_records(archive_path: &Path) -> Result<Vec<ArchiveEntryRecord>> {
    let names_output = run_tar_output(&[
        OsString::from("-tf"),
        archive_path.as_os_str().to_os_string(),
    ])?;
    let verbose_output = run_tar_output(&[
        OsString::from("-tvf"),
        archive_path.as_os_str().to_os_string(),
    ])
    .ok();

    let sizes = verbose_output
        .as_ref()
        .map(|output| {
            decode_archive_tool_output(&output.stdout)
                .lines()
                .map(parse_tar_verbose_size)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let stdout = decode_archive_tool_output(&names_output.stdout);
    Ok(stdout
        .lines()
        .enumerate()
        .filter_map(|(index, name)| {
            normalize_archive_entry_name(name, sizes.get(index).copied().unwrap_or(0))
        })
        .collect())
}

fn list_archive_records(archive_path: &Path) -> Result<Vec<ArchiveEntryRecord>> {
    if is_zip_archive_path(archive_path) {
        return list_zip_records(archive_path);
    }

    list_tar_records(archive_path)
}

fn extract_archive_patterns_to_dir(
    archive_path: &Path,
    patterns: &[String],
    dest_dir: &Path,
) -> Result<()> {
    if is_zip_archive_path(archive_path) {
        return extract_zip_patterns_to_dir(archive_path, patterns, dest_dir);
    }

    std::fs::create_dir_all(dest_dir)?;

    let mut args = vec![
        OsString::from("-xf"),
        archive_path.as_os_str().to_os_string(),
        OsString::from("-C"),
        dest_dir.as_os_str().to_os_string(),
    ];
    for pattern in patterns {
        args.push(OsString::from(pattern));
    }

    run_tar_output(&args).map(|_| ())
}

fn archive_entry_matches_patterns(entry_path: &str, patterns: &[String]) -> bool {
    patterns.iter().any(|pattern| {
        let normalized = pattern.trim_matches('/').replace('\\', "/");
        entry_path == normalized || entry_path.starts_with(&format!("{}/", normalized))
    })
}

fn extract_zip_patterns_to_dir(
    archive_path: &Path,
    patterns: &[String],
    dest_dir: &Path,
) -> Result<()> {
    std::fs::create_dir_all(dest_dir)?;

    let file = File::open(archive_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    let mut matched = false;

    for index in 0..archive.len() {
        let mut file = archive.by_index(index)?;
        let name = decode_zip_entry_name(file.name_raw(), file.name());
        let Some(record) = normalize_archive_entry_name(&name, file.size()) else {
            continue;
        };
        if !archive_entry_matches_patterns(&record.normalized_path, patterns) {
            continue;
        }

        matched = true;
        let output_path = archive_path_to_dest(dest_dir, &record.normalized_path)?;
        if record.is_dir {
            std::fs::create_dir_all(&output_path)?;
            continue;
        }

        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut output = File::create(&output_path)?;
        io::copy(&mut file, &mut output)?;
    }

    if matched {
        Ok(())
    } else {
        Err(AppError::NotFound(format!(
            "?뺤텞 ?대? ??ぉ??李얠쓣 ???놁뒿?덈떎: {}",
            patterns.join(", ")
        )))
    }
}

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

fn resolve_archive_virtual_path_with_loader<F>(
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
pub fn resolve_archive_virtual_path(path: &str) -> Option<ArchiveVirtualPath> {
    resolve_archive_virtual_path_with_loader(path, |_| Ok(None))
        .ok()
        .flatten()
}

pub fn resolve_archive_virtual_path_with_app<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    path: &str,
) -> Result<Option<ArchiveVirtualPath>> {
    resolve_archive_virtual_path_with_loader(path, |prefix| {
        materialize_archive_path_in_cache(app, prefix)
    })
}

fn list_archive_directory_resolved(resolved: &ArchiveVirtualPath) -> Result<Vec<FileEntry>> {
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
            path: build_archive_virtual_path(&resolved, &name),
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::{Seek, Write};

    fn setup_test_dir(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("quickfolder_archive_test_{}", name));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn cleanup_test_dir(path: &Path) {
        let _ = fs::remove_dir_all(path);
    }

    fn create_test_zip(path: &Path) {
        let file = fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        zip.add_directory("folder/", options).unwrap();
        zip.start_file("folder/file.txt", options).unwrap();
        zip.write_all(b"archive entry").unwrap();
        zip.start_file("root.txt", options).unwrap();
        zip.write_all(b"root entry").unwrap();
        zip.finish().unwrap();
    }

    fn create_cp949_named_zip(path: &Path) {
        let mut file = fs::File::create(path).unwrap();
        let name = [0xc6, 0xfa, 0xb4, 0xf5, b'/'];
        let mut central = Vec::new();

        file.write_all(&0x04034b50u32.to_le_bytes()).unwrap();
        file.write_all(&20u16.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&0u32.to_le_bytes()).unwrap();
        file.write_all(&0u32.to_le_bytes()).unwrap();
        file.write_all(&0u32.to_le_bytes()).unwrap();
        file.write_all(&(name.len() as u16).to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&name).unwrap();

        let central_offset = file.stream_position().unwrap();
        central.extend_from_slice(&0x02014b50u32.to_le_bytes());
        central.extend_from_slice(&20u16.to_le_bytes());
        central.extend_from_slice(&20u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u32.to_le_bytes());
        central.extend_from_slice(&0u32.to_le_bytes());
        central.extend_from_slice(&0u32.to_le_bytes());
        central.extend_from_slice(&(name.len() as u16).to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0x10u32.to_le_bytes());
        central.extend_from_slice(&0u32.to_le_bytes());
        central.extend_from_slice(&name);
        file.write_all(&central).unwrap();

        file.write_all(&0x06054b50u32.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&1u16.to_le_bytes()).unwrap();
        file.write_all(&1u16.to_le_bytes()).unwrap();
        file.write_all(&(central.len() as u32).to_le_bytes())
            .unwrap();
        file.write_all(&(central_offset as u32).to_le_bytes())
            .unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
    }

    fn create_percent_encoded_zip(path: &Path) {
        let file = fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        zip.start_file(
            "%EB%A8%B8%EC%A7%80%EB%A8%B8%EC%A7%80_%ED%83%80%EC%9D%B4%ED%8B%80_en_black.png",
            options,
        )
        .unwrap();
        zip.write_all(b"encoded entry").unwrap();
        zip.finish().unwrap();
    }

    fn create_cp949_file_zip(path: &Path) {
        fn write_stored_entry(
            file: &mut fs::File,
            central: &mut Vec<u8>,
            name: &[u8],
            external_attrs: u32,
        ) {
            let local_offset = file.stream_position().unwrap();
            file.write_all(&0x04034b50u32.to_le_bytes()).unwrap();
            file.write_all(&20u16.to_le_bytes()).unwrap();
            file.write_all(&0u16.to_le_bytes()).unwrap();
            file.write_all(&0u16.to_le_bytes()).unwrap();
            file.write_all(&0u16.to_le_bytes()).unwrap();
            file.write_all(&0u16.to_le_bytes()).unwrap();
            file.write_all(&0u32.to_le_bytes()).unwrap();
            file.write_all(&0u32.to_le_bytes()).unwrap();
            file.write_all(&0u32.to_le_bytes()).unwrap();
            file.write_all(&(name.len() as u16).to_le_bytes()).unwrap();
            file.write_all(&0u16.to_le_bytes()).unwrap();
            file.write_all(name).unwrap();

            central.extend_from_slice(&0x02014b50u32.to_le_bytes());
            central.extend_from_slice(&20u16.to_le_bytes());
            central.extend_from_slice(&20u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u32.to_le_bytes());
            central.extend_from_slice(&0u32.to_le_bytes());
            central.extend_from_slice(&0u32.to_le_bytes());
            central.extend_from_slice(&(name.len() as u16).to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&external_attrs.to_le_bytes());
            central.extend_from_slice(&(local_offset as u32).to_le_bytes());
            central.extend_from_slice(name);
        }

        let mut file = fs::File::create(path).unwrap();
        let mut central = Vec::new();
        write_stored_entry(
            &mut file,
            &mut central,
            &[0xc6, 0xfa, 0xb4, 0xf5, b'/'],
            0x10,
        );
        write_stored_entry(
            &mut file,
            &mut central,
            &[
                0xc6, 0xfa, 0xb4, 0xf5, b'/', 0xc0, 0xcc, 0xb9, 0xcc, 0xc1, 0xf6, b'.', b'p', b'n',
                b'g',
            ],
            0,
        );

        let central_offset = file.stream_position().unwrap();
        file.write_all(&central).unwrap();
        file.write_all(&0x06054b50u32.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
        file.write_all(&2u16.to_le_bytes()).unwrap();
        file.write_all(&2u16.to_le_bytes()).unwrap();
        file.write_all(&(central.len() as u32).to_le_bytes())
            .unwrap();
        file.write_all(&(central_offset as u32).to_le_bytes())
            .unwrap();
        file.write_all(&0u16.to_le_bytes()).unwrap();
    }

    #[test]
    fn test_resolve_archive_virtual_path_root_and_child() {
        let test_dir = setup_test_dir("resolve_virtual");
        let archive = test_dir.join("sample.zip");
        fs::write(&archive, b"placeholder").unwrap();

        let root = resolve_archive_virtual_path(&format!("{}\\", archive.display())).unwrap();
        assert_eq!(root.archive_path, archive);
        assert_eq!(root.logical_archive_path, archive.display().to_string());
        assert_eq!(root.inner_path, None);

        let child =
            resolve_archive_virtual_path(&format!("{}\\folder\\file.txt", archive.display()))
                .unwrap();
        assert_eq!(child.inner_path.as_deref(), Some("folder/file.txt"));

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_list_archive_directory_for_zip_root_and_child() {
        let test_dir = setup_test_dir("list_zip");
        let archive = test_dir.join("sample.zip");
        create_test_zip(&archive);

        let root_resolved =
            resolve_archive_virtual_path(&format!("{}\\", archive.display())).unwrap();
        let root_entries = list_archive_directory_resolved(&root_resolved).unwrap();
        assert_eq!(root_entries.len(), 2);
        assert!(root_entries
            .iter()
            .any(|entry| entry.name == "folder" && entry.is_dir));
        assert!(root_entries
            .iter()
            .any(|entry| entry.name == "root.txt" && !entry.is_dir && entry.size > 0));

        let child_resolved =
            resolve_archive_virtual_path(&format!("{}\\folder", archive.display())).unwrap();
        let child_entries = list_archive_directory_resolved(&child_resolved).unwrap();
        assert_eq!(child_entries.len(), 1);
        assert_eq!(child_entries[0].name, "file.txt");
        assert!(!child_entries[0].is_dir);

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_list_zip_cp949_directory_name() {
        let test_dir = setup_test_dir("list_zip_cp949");
        let archive = test_dir.join("cp949.zip");
        create_cp949_named_zip(&archive);

        let root_resolved =
            resolve_archive_virtual_path(&format!("{}\\", archive.display())).unwrap();
        let root_entries = list_archive_directory_resolved(&root_resolved).unwrap();
        assert!(root_entries
            .iter()
            .any(|entry| entry.name == "\u{d3f4}\u{b354}" && entry.is_dir));

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_list_zip_percent_encoded_file_name() {
        let test_dir = setup_test_dir("list_zip_percent_encoded");
        let archive = test_dir.join("percent_encoded.zip");
        create_percent_encoded_zip(&archive);

        let root_resolved =
            resolve_archive_virtual_path(&format!("{}\\", archive.display())).unwrap();
        let root_entries = list_archive_directory_resolved(&root_resolved).unwrap();
        assert!(root_entries.iter().any(|entry| {
            entry.name == "머지머지_타이틀_en_black.png" && !entry.is_dir
        }));

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_extract_zip_percent_encoded_file_by_decoded_path() {
        let test_dir = setup_test_dir("extract_zip_percent_encoded");
        let archive = test_dir.join("percent_encoded.zip");
        let dest = test_dir.join("out");
        create_percent_encoded_zip(&archive);

        extract_archive_patterns_to_dir(
            &archive,
            &[String::from("머지머지_타이틀_en_black.png")],
            &dest,
        )
        .unwrap();

        assert!(dest.join("머지머지_타이틀_en_black.png").exists());

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_decode_archive_tool_output_cp949() {
        let decoded = decode_archive_tool_output(&[0xc6, 0xfa, 0xb4, 0xf5, b'\n']);
        assert_eq!(decoded.trim(), "\u{d3f4}\u{b354}");
    }

    #[test]
    fn test_extract_zip_cp949_file_by_decoded_path() {
        let test_dir = setup_test_dir("extract_zip_cp949");
        let archive = test_dir.join("cp949.zip");
        let dest = test_dir.join("out");
        create_cp949_file_zip(&archive);

        extract_archive_patterns_to_dir(
            &archive,
            &[String::from(
                "\u{d3f4}\u{b354}/\u{c774}\u{bbf8}\u{c9c0}.png",
            )],
            &dest,
        )
        .unwrap();

        assert!(dest
            .join("\u{d3f4}\u{b354}")
            .join("\u{c774}\u{bbf8}\u{c9c0}.png")
            .exists());

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_resolve_nested_archive_virtual_path_with_loader() {
        let test_dir = setup_test_dir("resolve_nested_virtual");
        let outer_archive = test_dir.join("outer.zip");
        let materialized_inner_archive = test_dir.join("materialized").join("inner.7z");
        fs::write(&outer_archive, b"outer").unwrap();
        fs::create_dir_all(materialized_inner_archive.parent().unwrap()).unwrap();
        fs::write(&materialized_inner_archive, b"inner").unwrap();

        let nested_archive_path = format!("{}\\inner.7z", outer_archive.display());
        let nested_entry_path = format!("{}\\docs\\file.txt", nested_archive_path);
        let resolved = resolve_archive_virtual_path_with_loader(&nested_entry_path, |prefix| {
            if prefix == nested_archive_path {
                Ok(Some(materialized_inner_archive.clone()))
            } else {
                Ok(None)
            }
        })
        .unwrap()
        .unwrap();

        assert_eq!(resolved.archive_path, materialized_inner_archive);
        assert_eq!(resolved.logical_archive_path, nested_archive_path);
        assert_eq!(resolved.inner_path.as_deref(), Some("docs/file.txt"));

        cleanup_test_dir(&test_dir);
    }
}
