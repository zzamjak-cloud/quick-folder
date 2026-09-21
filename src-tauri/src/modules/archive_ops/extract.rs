#[cfg(test)]
pub(super) use super::records::decode_archive_tool_output;
use super::{
    path::is_zip_archive_path,
    records::{
        decode_zip_entry_name, list_archive_records, normalize_archive_entry_name, run_tar_output,
    },
};
use crate::modules::error::{AppError, Result};
#[cfg(unix)]
use crate::modules::file_ops::{restore_symlink, restore_unix_mode};
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
        #[cfg(unix)]
        if let Some(mode) = file.unix_mode() {
            if mode & 0xF000 == 0xA000 {
                restore_symlink(&mut file, &output_path)?;
                continue;
            }
        }
        let mut output = File::create(&output_path)?;
        io::copy(&mut file, &mut output)?;
        #[cfg(unix)]
        restore_unix_mode(&output_path, file.unix_mode());
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

// ZIP 외 압축(.7z/.rar/.tar.*)도 우클릭 "압축 풀기"로 통째로 해제한다.
// libarchive 기반 bsdtar가 읽기를 지원하고 유닉스 권한도 그대로 복원한다.
#[tauri::command]
pub async fn extract_archive(
    archive_path: String,
    dest_dir: String,
) -> Result<crate::modules::file_ops::ExtractResult> {
    if is_zip_archive_path(Path::new(&archive_path)) {
        return crate::modules::file_ops::extract_zip(archive_path, dest_dir).await;
    }

    let dest_clone = dest_dir.clone();
    tokio::task::spawn_blocking(move || -> Result<crate::modules::file_ops::ExtractResult> {
        let archive = Path::new(&archive_path);
        let dest = Path::new(&dest_clone);
        std::fs::create_dir_all(dest)?;

        run_tar_output(&[
            OsString::from("-xf"),
            archive.as_os_str().to_os_string(),
            OsString::from("-C"),
            dest.as_os_str().to_os_string(),
        ])?;

        // tar는 개별 실패를 보고하지 않는다 — 전체 성공/실패만 다루고 파일 수는 목록으로 센다
        let total = list_archive_records(archive)
            .map(|records| records.iter().filter(|record| !record.is_dir).count())
            .unwrap_or(0);

        Ok(crate::modules::file_ops::ExtractResult {
            dest_dir: dest_clone.clone(),
            total,
            extracted: total,
            failed: Vec::new(),
        })
    })
    .await
    .map_err(|e| AppError::Internal(format!("압축 해제 작업 실패: {}", e)))?
}
