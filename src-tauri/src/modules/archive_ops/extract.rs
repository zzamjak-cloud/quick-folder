#[cfg(test)]
pub(super) use super::records::decode_archive_tool_output;
use super::{
    path::is_zip_archive_path,
    records::{decode_zip_entry_name, normalize_archive_entry_name, run_tar_output},
};
use crate::modules::error::{AppError, Result};
use std::ffi::OsString;
use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};

pub(super) fn archive_path_to_dest(root: &Path, normalized_path: &str) -> Result<PathBuf> {
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

pub(super) fn extract_archive_patterns_to_dir(
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
