use super::{path::is_zip_archive_path, ArchiveEntryRecord};
use crate::helpers::percent_decode_utf8;
use crate::modules::error::{AppError, Result};
use std::ffi::OsString;
use std::fs::File;
use std::path::Path;

fn tar_program() -> &'static str {
    if cfg!(target_os = "windows") {
        "tar.exe"
    } else {
        "tar"
    }
}

pub(super) fn normalize_archive_entry_name(raw: &str, size: u64) -> Option<ArchiveEntryRecord> {
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

pub(super) fn decode_zip_entry_name(raw: &[u8], fallback: &str) -> String {
    if let Ok(value) = std::str::from_utf8(raw) {
        return decode_percent_encoded_archive_path(value);
    }

    let (decoded, _, had_errors) = encoding_rs::EUC_KR.decode(raw);
    if !had_errors && contains_hangul(&decoded) {
        return decode_percent_encoded_archive_path(&decoded);
    }

    decode_percent_encoded_archive_path(fallback)
}

pub(super) fn decode_archive_tool_output(bytes: &[u8]) -> String {
    if let Ok(value) = std::str::from_utf8(bytes) {
        return value.to_string();
    }

    let (decoded, _, had_errors) = encoding_rs::EUC_KR.decode(bytes);
    if !had_errors {
        return decoded.into_owned();
    }

    String::from_utf8_lossy(bytes).to_string()
}

pub(super) fn run_tar_output(args: &[OsString]) -> Result<std::process::Output> {
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
        let stderr = decode_archive_tool_output(&output.stderr)
            .trim()
            .to_string();
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

pub(super) fn list_archive_records(archive_path: &Path) -> Result<Vec<ArchiveEntryRecord>> {
    if is_zip_archive_path(archive_path) {
        return list_zip_records(archive_path);
    }

    list_tar_records(archive_path)
}
