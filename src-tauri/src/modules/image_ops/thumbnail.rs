//! 이미지/PSD 썸네일 캐시 모듈

use super::heavy::HeavyOpPermit;
use crate::helpers::*;
use crate::modules::archive_ops::materialize_archive_path_in_cache;
use crate::modules::error::{AppError, Result};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub(crate) const THUMBNAIL_CACHE_MAX_BYTES: u64 = 10 * 1024 * 1024 * 1024;
pub(crate) const THUMBNAIL_CACHE_SIZES: [u32; 10] = [40, 60, 80, 100, 120, 160, 200, 240, 280, 320];
pub(crate) const THUMBNAIL_CACHE_DIR_NAMES: [&str; 3] =
    ["img_thumbnails", "psd_thumbnails", "video_thumbnails"];
const THUMBNAIL_CACHE_PRUNE_INTERVAL_MS: u64 = 60_000;
static LAST_THUMBNAIL_CACHE_PRUNE_MS: AtomicU64 = AtomicU64::new(0);

pub(crate) fn thumbnail_cache_root<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<PathBuf> {
    use tauri::Manager;
    app.path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))
}

fn thumbnail_modified_millis(meta: &std::fs::Metadata, ignore_mtime: bool) -> u128 {
    if ignore_mtime {
        return 0;
    }

    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn stable_thumbnail_cache_key(path: &str, modified: u128, file_len: u64, size: u32) -> String {
    let modified = modified.to_string();
    let file_len = file_len.to_string();
    let size = size.to_string();
    stable_cache_key(&[
        b"thumbnail-v2",
        path.as_bytes(),
        modified.as_bytes(),
        file_len.as_bytes(),
        size.as_bytes(),
    ])
}

fn legacy_thumbnail_cache_key(path: &str, modified: u128, size: u32) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    modified.hash(&mut hasher);
    size.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn thumbnail_cache_keys(path: &str, size: u32) -> Vec<String> {
    let Ok(meta) = std::fs::metadata(path) else {
        return Vec::new();
    };
    let file_len = meta.len();
    let actual_modified = thumbnail_modified_millis(&meta, false);
    let mut modified_variants = vec![actual_modified];
    if actual_modified != 0 {
        modified_variants.push(0);
    }

    let mut keys = Vec::new();
    for modified in modified_variants {
        keys.push(stable_thumbnail_cache_key(path, modified, file_len, size));
        keys.push(legacy_thumbnail_cache_key(path, modified, size));
    }
    keys
}

fn collect_thumbnail_source_paths(path: &Path, out: &mut Vec<String>) {
    if path.is_file() {
        out.push(path.to_string_lossy().to_string());
        return;
    }
    if !path.is_dir() {
        return;
    }
    for entry in walkdir::WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            out.push(entry.path().to_string_lossy().to_string());
        }
    }
}

pub(crate) fn invalidate_thumbnail_cache_paths_in_root(app_cache: &Path, paths: &[String]) {
    let mut source_paths = Vec::new();
    for path in paths {
        collect_thumbnail_source_paths(Path::new(path), &mut source_paths);
    }

    for source_path in source_paths {
        for size in THUMBNAIL_CACHE_SIZES {
            let cache_keys = thumbnail_cache_keys(&source_path, size);
            for dir_name in THUMBNAIL_CACHE_DIR_NAMES {
                for cache_key in &cache_keys {
                    let cache_file = app_cache.join(dir_name).join(format!("{}.png", cache_key));
                    if cache_file.exists() {
                        let _ = std::fs::remove_file(cache_file);
                    }
                }
            }
        }
    }
}

pub(crate) fn invalidate_thumbnail_cache_paths<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    paths: &[String],
) -> Result<()> {
    let app_cache = thumbnail_cache_root(app)?;
    invalidate_thumbnail_cache_paths_in_root(&app_cache, paths);
    Ok(())
}

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn prune_thumbnail_cache_root(cache_root: &Path) {
    struct CacheEntry {
        path: PathBuf,
        size: u64,
        modified: std::time::SystemTime,
    }

    let mut entries = Vec::new();
    let mut total_size = 0u64;

    for dir_name in THUMBNAIL_CACHE_DIR_NAMES {
        let cache_dir = cache_root.join(dir_name);
        let Ok(read_dir) = std::fs::read_dir(cache_dir) else {
            continue;
        };
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("png") {
                continue;
            }
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            let size = meta.len();
            total_size = total_size.saturating_add(size);
            entries.push(CacheEntry {
                path,
                size,
                modified: meta.modified().unwrap_or(std::time::UNIX_EPOCH),
            });
        }
    }

    if total_size <= THUMBNAIL_CACHE_MAX_BYTES {
        return;
    }

    entries.sort_by(|a, b| a.modified.cmp(&b.modified));
    for entry in entries {
        if total_size <= THUMBNAIL_CACHE_MAX_BYTES {
            break;
        }
        if std::fs::remove_file(&entry.path).is_ok() {
            total_size = total_size.saturating_sub(entry.size);
        }
    }
}

fn prune_thumbnail_cache_root_throttled(cache_root: &Path) {
    let now = now_millis();
    let last = LAST_THUMBNAIL_CACHE_PRUNE_MS.load(Ordering::Relaxed);
    if now.saturating_sub(last) < THUMBNAIL_CACHE_PRUNE_INTERVAL_MS {
        return;
    }
    if LAST_THUMBNAIL_CACHE_PRUNE_MS
        .compare_exchange(last, now, Ordering::Relaxed, Ordering::Relaxed)
        .is_ok()
    {
        prune_thumbnail_cache_root(cache_root);
    }
}

fn prune_thumbnail_cache_for_dir(cache_dir: &Path) {
    if let Some(cache_root) = cache_dir.parent() {
        prune_thumbnail_cache_root_throttled(cache_root);
    }
}

/// 디스크 캐시 썸네일을 보장하고 캐시 PNG 파일 경로를 반환
/// 캐시 키(경로+수정시각+크기)로 히트 확인 후, 미스 시 `generate` 클로저로 PNG 바이트 생성·저장
/// base64 인코딩/IPC 왕복 없이 경로만 반환 → 프론트는 asset 프로토콜(convertFileSrc)로 직접 로드
pub(crate) fn ensure_cached_thumbnail<F>(
    cache_dir: &std::path::Path,
    path: &str,
    size: u32,
    use_heavy_op: bool,
    ignore_mtime: bool,
    generate: F,
) -> Result<Option<PathBuf>>
where
    F: FnOnce() -> Result<Option<Vec<u8>>>,
{
    let meta = std::fs::metadata(path)?;
    // ignore_mtime=true (클라우드 경로): mtime을 키에서 제외 → 재동기화로 mtime이 바뀌어도
    // 캐시 유지(불필요한 재다운로드 방지). 내용 변경은 파일 크기 변화로 대부분 감지됨.
    let modified = thumbnail_modified_millis(&meta, ignore_mtime);
    let cache_key = stable_thumbnail_cache_key(path, modified, meta.len(), size);
    let legacy_cache_key = legacy_thumbnail_cache_key(path, modified, size);

    std::fs::create_dir_all(cache_dir).ok();
    let cache_file = cache_dir.join(format!("{}.png", cache_key));
    let legacy_cache_file = cache_dir.join(format!("{}.png", legacy_cache_key));

    // 캐시 히트
    if cache_file.exists() {
        prune_thumbnail_cache_for_dir(cache_dir);
        return Ok(Some(cache_file));
    }
    if legacy_cache_file.exists() {
        if cache_file != legacy_cache_file {
            std::fs::copy(&legacy_cache_file, &cache_file).ok();
        }
        prune_thumbnail_cache_for_dir(cache_dir);
        return Ok(Some(if cache_file.exists() {
            cache_file
        } else {
            legacy_cache_file
        }));
    }

    // 선택적 동시성 제한 + 패닉 방지
    let _permit = if use_heavy_op {
        Some(HeavyOpPermit::acquire())
    } else {
        None
    };

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(generate));
    match result {
        Ok(Ok(Some(bytes))) => {
            std::fs::write(&cache_file, &bytes).ok();
            prune_thumbnail_cache_for_dir(cache_dir);
            Ok(Some(cache_file))
        }
        Ok(Ok(None)) => Ok(None),
        Ok(Err(e)) => Err(e),
        Err(_) => Ok(None),
    }
}

/// 디스크 캐시 기반 썸네일 생성 공통 헬퍼 (base64 PNG 반환 — 미리보기 등 단건 용도)
pub(crate) fn cached_thumbnail<F>(
    cache_dir: &std::path::Path,
    path: &str,
    size: u32,
    use_heavy_op: bool,
    generate: F,
) -> Result<Option<String>>
where
    F: FnOnce() -> Result<Option<Vec<u8>>>,
{
    use base64::Engine;
    match ensure_cached_thumbnail(cache_dir, path, size, use_heavy_op, false, generate)? {
        Some(cache_file) => {
            let cached = std::fs::read(&cache_file)?;
            Ok(Some(
                base64::engine::general_purpose::STANDARD.encode(&cached),
            ))
        }
        None => Ok(None),
    }
}

const THUMBNAIL_IMAGE_EXTS: [&str; 8] = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "ico", "icns"];

// 이미지 → PNG 썸네일 바이트 생성 (ICO/ICNS 특수 처리 포함)
fn generate_image_thumbnail_bytes(path: &str, ext: &str, size: u32) -> Result<Option<Vec<u8>>> {
    if ext == "ico" {
        // ICO: image crate로 열기 시도, 실패 시 ICO 디코더 직접 사용
        match image::open(path) {
            Ok(img) => {
                let thumb = img.thumbnail(size, size);
                let mut buf = vec![];
                thumb.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;
                return Ok(Some(buf));
            }
            Err(_) => {
                // image crate 실패 시: 파일을 바이트로 읽어 ICO 디코더 직접 사용
                let data = std::fs::read(path)?;
                let cursor = std::io::Cursor::new(&data);
                match image::codecs::ico::IcoDecoder::new(cursor) {
                    Ok(decoder) => {
                        use image::ImageDecoder;
                        let (w, h): (u32, u32) = decoder.dimensions();
                        let mut rgba = vec![0u8; (w * h * 4) as usize];
                        if decoder.read_image(&mut rgba).is_ok() {
                            if let Some(img) = image::RgbaImage::from_raw(w, h, rgba) {
                                let dyn_img = image::DynamicImage::ImageRgba8(img);
                                let thumb = dyn_img.thumbnail(size, size);
                                let mut buf = vec![];
                                thumb.write_to(
                                    &mut std::io::Cursor::new(&mut buf),
                                    image::ImageFormat::Png,
                                )?;
                                return Ok(Some(buf));
                            }
                        }
                        return Ok(None);
                    }
                    Err(_) => return Ok(None),
                }
            }
        }
    }
    if ext == "icns" {
        // ICNS: icns 크레이트로 가장 큰 아이콘을 PNG로 변환
        let file = std::fs::File::open(path)?;
        let family = icns::IconFamily::read(file)
            .map_err(|e| AppError::ImageProcessing(format!("ICNS 읽기 실패: {}", e)))?;
        // 가장 큰 아이콘 타입 찾기
        let mut best_type: Option<icns::IconType> = None;
        for icon_type in family.available_icons() {
            if best_type.map_or(true, |bt| icon_type.pixel_width() > bt.pixel_width()) {
                best_type = Some(icon_type);
            }
        }
        if let Some(icon_type) = best_type {
            let icon = family
                .get_icon_with_type(icon_type)
                .map_err(|e| AppError::ImageProcessing(format!("ICNS 아이콘 추출 실패: {}", e)))?;
            let rgba =
                image::RgbaImage::from_raw(icon.width(), icon.height(), icon.data().to_vec())
                    .ok_or_else(|| {
                        AppError::ImageProcessing("ICNS 이미지 변환 실패".to_string())
                    })?;
            let img = image::DynamicImage::ImageRgba8(rgba);
            let thumb = img.thumbnail(size, size);
            let mut buf = vec![];
            thumb.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;
            return Ok(Some(buf));
        }
        return Ok(None);
    }
    let img = image::open(path)?;
    let thumb = img.thumbnail(size, size);
    let mut buf = vec![];
    thumb.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;
    Ok(Some(buf))
}

// 이미지 썸네일 캐시 PNG 경로 반환 (asset 프로토콜용 — base64/IPC 왕복 없음)
// 그리드의 대량 썸네일 표시 경로. spawn_blocking: 네트워크 파일시스템 차단 방지
#[tauri::command]
pub async fn get_file_thumbnail_path(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>> {
    use tauri::Manager;

    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))?
        .join("img_thumbnails");

    tauri::async_runtime::spawn_blocking(move || -> Result<Option<String>> {
        let resolved_path =
            materialize_archive_path_in_cache(&app, &path)?.unwrap_or_else(|| PathBuf::from(&path));
        let resolved_path_str = resolved_path.to_string_lossy().to_string();
        let ext = resolved_path_str
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_lowercase();
        if !THUMBNAIL_IMAGE_EXTS.contains(&ext.as_str()) {
            return Ok(None);
        }
        // 클라우드 경로(구글드라이브 등): OS 네이티브 썸네일 우선 → 풀 다운로드 없이 제공자 썸네일 사용.
        // 캐시 키는 mtime 무시(재동기화 시 재다운로드 방지). 실패하면 일반 디코딩으로 폴백.
        let is_cloud = crate::helpers::is_cloud_path(&resolved_path_str);
        // 클라우드(QuickLook)는 I/O 대기형이라 CPU heavy-op 퍼밋을 잡지 않음 → 동시성↑(프론트 큐가 제한)
        let cache_path = ensure_cached_thumbnail(
            &cache_dir,
            &resolved_path_str,
            size,
            !is_cloud,
            is_cloud,
            || {
                // 클라우드: OS 네이티브 썸네일(QuickLook) 우선, 실패 시 바이트 디코딩 폴백
                if is_cloud {
                    if let Ok(Some(bytes)) =
                        crate::modules::media_ops::get_os_thumbnail(&resolved_path_str, size)
                    {
                        return Ok(Some(bytes));
                    }
                }
                generate_image_thumbnail_bytes(&resolved_path_str, &ext, size)
            },
        )?;
        Ok(cache_path.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| AppError::Internal(format!("썸네일 경로 생성 실패: {}", e)))?
}

// 이미지 썸네일 생성 (디스크 캐시 + base64 PNG 반환 — 미리보기 등 단건 용도)
// spawn_blocking: 네트워크 파일시스템에서 tokio 워커 차단 방지
#[tauri::command]
pub async fn get_file_thumbnail(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>> {
    use tauri::Manager;

    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))?
        .join("img_thumbnails");

    tauri::async_runtime::spawn_blocking(move || {
        let resolved_path =
            materialize_archive_path_in_cache(&app, &path)?.unwrap_or_else(|| PathBuf::from(&path));
        let resolved_path_str = resolved_path.to_string_lossy().to_string();
        let ext = resolved_path_str
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_lowercase();
        if !THUMBNAIL_IMAGE_EXTS.contains(&ext.as_str()) {
            return Ok(None);
        }

        cached_thumbnail(&cache_dir, &resolved_path_str, size, true, || {
            generate_image_thumbnail_bytes(&resolved_path_str, &ext, size)
        })
    })
    .await
    .map_err(|e| AppError::Internal(format!("썸네일 생성 실패: {}", e)))?
}

// PSD 썸네일 생성 (디스크 캐시 + base64 PNG 반환)
// spawn_blocking: 네트워크 파일시스템에서 tokio 워커 차단 방지
#[tauri::command]
pub async fn get_psd_thumbnail(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>> {
    use tauri::Manager;

    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))?
        .join("psd_thumbnails");

    tauri::async_runtime::spawn_blocking(move || {
        let resolved_path =
            materialize_archive_path_in_cache(&app, &path)?.unwrap_or_else(|| PathBuf::from(&path));
        let resolved_path_str = resolved_path.to_string_lossy().to_string();
        cached_thumbnail(&cache_dir, &resolved_path_str, size, true, || {
            let bytes = std::fs::read(&resolved_path)?;
            let psd = psd::Psd::from_bytes(&bytes)
                .map_err(|e| AppError::ImageProcessing(format!("PSD 파싱 실패: {}", e)))?;

            let rgba_pixels = psd.rgba();
            let width = psd.width();
            let height = psd.height();

            let img = image::RgbaImage::from_raw(width, height, rgba_pixels)
                .ok_or_else(|| AppError::ImageProcessing("PSD 픽셀 변환 실패".to_string()))?;
            let dynamic = image::DynamicImage::ImageRgba8(img);
            // size == 0: 원본 해상도 유지 (미리보기용), size > 0: 썸네일 생성 (그리드용)
            let output = if size == 0 || (width <= size && height <= size) {
                dynamic
            } else {
                dynamic.thumbnail(size, size)
            };

            let mut buf = vec![];
            output.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;
            Ok(Some(buf))
        })
    })
    .await
    .map_err(|e| AppError::Internal(format!("PSD 썸네일 생성 실패: {}", e)))?
}
