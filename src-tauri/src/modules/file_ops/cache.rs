use crate::helpers::stable_cache_key;
use crate::modules::error::{AppError, Result};
use crate::modules::image_ops::thumbnail_cache_root;
use crate::modules::types::FileEntry;

// ===== 디렉토리 목록 영속 캐시 (구글 드라이브 등 콜드스타트 대응) =====
// 마지막으로 본 목록을 디스크에 저장 → 앱 재시작 후 재방문 시 즉시 stale 표시 + 백그라운드 갱신

#[derive(serde::Serialize, serde::Deserialize)]
struct CachedListing {
    path: String,
    entries: Vec<FileEntry>,
}

fn legacy_dir_listing_cache_key(path: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn dir_listing_cache_files(
    app: &tauri::AppHandle,
    path: &str,
) -> Result<(std::path::PathBuf, std::path::PathBuf)> {
    let dir = thumbnail_cache_root(app)?.join("dir_listings");
    std::fs::create_dir_all(&dir).ok();
    let stable_key = stable_cache_key(&[b"dir-listing-v2", path.as_bytes()]);
    let legacy_key = legacy_dir_listing_cache_key(path);
    Ok((
        dir.join(format!("{}.json", stable_key)),
        dir.join(format!("{}.json", legacy_key)),
    ))
}

fn read_cached_listing_file(file: &std::path::Path, path: &str) -> Result<Option<Vec<FileEntry>>> {
    if !file.exists() {
        return Ok(None);
    }
    let data = std::fs::read(file)?;
    match serde_json::from_slice::<CachedListing>(&data) {
        // 해시 충돌 방어: 저장된 path가 일치할 때만 사용
        Ok(c) if c.path == path => Ok(Some(c.entries)),
        _ => Ok(None),
    }
}

// 디스크에 저장된 디렉토리 목록 조회 (없으면 None). 빠른 로컬 읽기.
#[tauri::command]
pub async fn read_cached_listing(
    app: tauri::AppHandle,
    path: String,
) -> Result<Option<Vec<FileEntry>>> {
    let (file, legacy_file) = dir_listing_cache_files(&app, &path)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<Option<Vec<FileEntry>>> {
        if let Some(entries) = read_cached_listing_file(&file, &path)? {
            return Ok(Some(entries));
        }

        if let Some(entries) = read_cached_listing_file(&legacy_file, &path)? {
            let cached = CachedListing {
                path: path.clone(),
                entries: entries.clone(),
            };
            if let Ok(data) = serde_json::to_vec(&cached) {
                std::fs::write(&file, data).ok();
            }
            return Ok(Some(entries));
        }

        Ok(None)
    })
    .await
    .map_err(|e| AppError::Internal(format!("디렉토리 캐시 읽기 실패: {}", e)))?
}

// 디렉토리 목록을 디스크 캐시에 저장 (fire-and-forget).
#[tauri::command]
pub async fn write_cached_listing(
    app: tauri::AppHandle,
    path: String,
    entries: Vec<FileEntry>,
) -> Result<()> {
    let (file, _) = dir_listing_cache_files(&app, &path)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<()> {
        let cached = CachedListing { path, entries };
        if let Ok(data) = serde_json::to_vec(&cached) {
            std::fs::write(&file, data).ok();
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::Internal(format!("디렉토리 캐시 저장 실패: {}", e)))?
}
