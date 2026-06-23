//! 이미지/PSD 썸네일 캐시 모듈

use super::heavy::HeavyOpPermit;
use crate::helpers::*;
use crate::modules::archive_ops::materialize_archive_path_in_cache;
use crate::modules::error::{AppError, Result};
use base64::Engine;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub(crate) const THUMBNAIL_CACHE_MAX_BYTES: u64 = 10 * 1024 * 1024 * 1024;
pub(crate) const THUMBNAIL_CACHE_SIZES: [u32; 10] = [40, 60, 80, 100, 120, 160, 200, 240, 280, 320];
pub(crate) const THUMBNAIL_CACHE_DIR_NAMES: [&str; 4] = [
    "img_thumbnails",
    "psd_thumbnails",
    "video_thumbnails",
    "drive_thumbnails",
];
const THUMBNAIL_CACHE_PRUNE_INTERVAL_MS: u64 = 60_000;
const GOOGLE_DRIVE_THUMBNAIL_CACHE_VERSION: &str = "v5";
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
        b"thumbnail-v4",
        path.as_bytes(),
        modified.as_bytes(),
        file_len.as_bytes(),
        size.as_bytes(),
    ])
}

fn safe_google_drive_file_id(file_id: &str) -> Option<String> {
    let trimmed = file_id.trim();
    if trimmed.is_empty() {
        return None;
    }

    Some(
        trimmed
            .chars()
            .map(|ch| {
                if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                    ch
                } else {
                    '_'
                }
            })
            .collect(),
    )
}

fn google_drive_thumbnail_cache_file(
    app_cache: &Path,
    file_id: &str,
    size: u32,
) -> Option<PathBuf> {
    let safe_file_id = safe_google_drive_file_id(file_id)?;
    let cache_dir = app_cache.join("drive_thumbnails");
    std::fs::create_dir_all(&cache_dir).ok()?;
    Some(cache_dir.join(format!(
        "{}_{}_{}.png",
        safe_file_id, size, GOOGLE_DRIVE_THUMBNAIL_CACHE_VERSION
    )))
}

fn previous_google_drive_thumbnail_cache_files(
    app_cache: &Path,
    file_id: &str,
    size: u32,
) -> Vec<PathBuf> {
    let Some(safe_file_id) = safe_google_drive_file_id(file_id) else {
        return Vec::new();
    };
    let cache_dir = app_cache.join("drive_thumbnails");
    vec![
        cache_dir.join(format!("{}_{}_v4.png", safe_file_id, size)),
        cache_dir.join(format!("{}_{}_v3.png", safe_file_id, size)),
        cache_dir.join(format!("{}_{}_v2.png", safe_file_id, size)),
        cache_dir.join(format!("{}_{}.png", safe_file_id, size)),
    ]
}

fn negative_thumbnail_cache_file(cache_file: &Path) -> PathBuf {
    cache_file.with_extension("none")
}

fn write_negative_thumbnail_cache(cache_file: &Path) {
    let none_file = negative_thumbnail_cache_file(cache_file);
    if let Some(parent) = none_file.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(none_file, b"none").ok();
}

fn remove_negative_thumbnail_cache(cache_file: &Path) {
    let _ = std::fs::remove_file(negative_thumbnail_cache_file(cache_file));
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
                    let none_file = app_cache.join(dir_name).join(format!("{}.none", cache_key));
                    if none_file.exists() {
                        let _ = std::fs::remove_file(none_file);
                    }
                }
            }
        }

        if let Ok(Some(file_id)) =
            crate::modules::system_ops::get_google_drive_file_id_for_path(&source_path)
        {
            for size in THUMBNAIL_CACHE_SIZES {
                if let Some(cache_file) =
                    google_drive_thumbnail_cache_file(app_cache, &file_id, size)
                {
                    let _ = std::fs::remove_file(&cache_file);
                    remove_negative_thumbnail_cache(&cache_file);
                }
                for cache_file in
                    previous_google_drive_thumbnail_cache_files(app_cache, &file_id, size)
                {
                    let _ = std::fs::remove_file(&cache_file);
                    remove_negative_thumbnail_cache(&cache_file);
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
            let Some(ext) = path.extension().and_then(|ext| ext.to_str()) else {
                continue;
            };
            if ext != "png" && ext != "none" {
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

fn touch_thumbnail_cache_file(path: &Path) {
    let now = filetime::FileTime::now();
    let _ = filetime::set_file_mtime(path, now);
}

// 동일 캐시 파일(=같은 fileId+size)에 대한 동시 생성을 직렬화하는 per-key 락.
// prewarm 배치와 가시 카드가 같은 파일을 동시에 요청하면 File Provider에서 같은 청크를
// 두 번 다운로드하게 되는데, 이를 합쳐(coalesce) 한 번만 받게 한다.
fn drive_thumbnail_inflight_lock(cache_file: &Path) -> std::sync::Arc<std::sync::Mutex<()>> {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex, OnceLock};
    static INFLIGHT: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();
    let map_mutex = INFLIGHT.get_or_init(|| Mutex::new(HashMap::new()));
    let mut map = map_mutex.lock().unwrap_or_else(|e| e.into_inner());
    // 맵이 너무 커지면 현재 사용 중이 아닌(맵만 보유한) 항목을 정리
    if map.len() > 4096 {
        map.retain(|_, v| Arc::strong_count(v) > 1);
    }
    map.entry(cache_file.to_path_buf())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

pub(crate) fn ensure_google_drive_thumbnail<F>(
    app_cache: &Path,
    path: &str,
    size: u32,
    generate: F,
) -> Result<Option<PathBuf>>
where
    F: FnOnce() -> Result<Option<Vec<u8>>>,
{
    let Some(file_id) = crate::modules::system_ops::get_google_drive_file_id_for_path(path)
        .ok()
        .flatten()
    else {
        return Ok(None);
    };
    let Some(cache_file) = google_drive_thumbnail_cache_file(app_cache, &file_id, size) else {
        return Ok(None);
    };

    if cache_file.exists() {
        touch_thumbnail_cache_file(&cache_file);
        prune_thumbnail_cache_root_throttled(app_cache);
        return Ok(Some(cache_file));
    }
    let none_file = negative_thumbnail_cache_file(&cache_file);
    if none_file.exists() {
        touch_thumbnail_cache_file(&none_file);
        prune_thumbnail_cache_root_throttled(app_cache);
        return Ok(None);
    }

    // 같은 파일 동시 요청 합치기: 락 획득 후 캐시를 재확인해 중복 생성(다운로드)을 막는다.
    let inflight = drive_thumbnail_inflight_lock(&cache_file);
    let _inflight_guard = inflight.lock().unwrap_or_else(|e| e.into_inner());
    if cache_file.exists() {
        touch_thumbnail_cache_file(&cache_file);
        prune_thumbnail_cache_root_throttled(app_cache);
        return Ok(Some(cache_file));
    }
    if none_file.exists() {
        touch_thumbnail_cache_file(&none_file);
        prune_thumbnail_cache_root_throttled(app_cache);
        return Ok(None);
    }

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(generate));
    match result {
        Ok(Ok(Some(bytes))) => {
            remove_negative_thumbnail_cache(&cache_file);
            std::fs::write(&cache_file, &bytes).ok();
            prune_thumbnail_cache_root_throttled(app_cache);
            Ok(Some(cache_file))
        }
        Ok(Ok(None)) => {
            write_negative_thumbnail_cache(&cache_file);
            prune_thumbnail_cache_root_throttled(app_cache);
            Ok(None)
        }
        Ok(Err(e)) => Err(e),
        Err(_) => Ok(None),
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
        touch_thumbnail_cache_file(&cache_file);
        prune_thumbnail_cache_for_dir(cache_dir);
        return Ok(Some(cache_file));
    }
    let none_file = negative_thumbnail_cache_file(&cache_file);
    if none_file.exists() {
        touch_thumbnail_cache_file(&none_file);
        prune_thumbnail_cache_for_dir(cache_dir);
        return Ok(None);
    }
    if legacy_cache_file.exists() {
        if cache_file != legacy_cache_file {
            std::fs::copy(&legacy_cache_file, &cache_file).ok();
        }
        if cache_file.exists() {
            touch_thumbnail_cache_file(&cache_file);
        } else {
            touch_thumbnail_cache_file(&legacy_cache_file);
        }
        prune_thumbnail_cache_for_dir(cache_dir);
        return Ok(Some(if cache_file.exists() {
            cache_file
        } else {
            legacy_cache_file
        }));
    }
    let legacy_none_file = negative_thumbnail_cache_file(&legacy_cache_file);
    if legacy_none_file.exists() {
        write_negative_thumbnail_cache(&cache_file);
        touch_thumbnail_cache_file(&legacy_none_file);
        prune_thumbnail_cache_for_dir(cache_dir);
        return Ok(None);
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
            remove_negative_thumbnail_cache(&cache_file);
            std::fs::write(&cache_file, &bytes).ok();
            prune_thumbnail_cache_for_dir(cache_dir);
            Ok(Some(cache_file))
        }
        Ok(Ok(None)) => {
            write_negative_thumbnail_cache(&cache_file);
            prune_thumbnail_cache_for_dir(cache_dir);
            Ok(None)
        }
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

fn generate_cloud_image_thumbnail_bytes(
    path: &str,
    ext: &str,
    size: u32,
) -> Result<Option<Vec<u8>>> {
    // 실제 이미지 디코딩 우선 → aspect ratio 보존(절대 잘리면 안 됨).
    // QuickLook(get_os_thumbnail)은 비정사각 이미지를 정사각으로 잘라/왜곡해 반환하므로,
    // 디코딩이 가능하면 항상 디코딩 결과를 쓰고, 실패할 때만 OS 썸네일로 폴백한다.

    // ICO/ICNS는 작고 특수 처리가 필요 → 기존 경로(메모리 부담 없음)
    if ext == "ico" || ext == "icns" {
        return match generate_image_thumbnail_bytes(path, ext, size) {
            Ok(Some(bytes)) => Ok(Some(bytes)),
            _ => crate::modules::media_ops::get_os_thumbnail(path, size),
        };
    }

    // 파일 읽기(클라우드 다운로드)는 동시성 제한 없이 24-wide 유지하고,
    // 메모리를 크게 쓰는 디코딩만 heavy-op 퍼밋으로 제한 → 대용량 이미지 동시 디코딩 시
    // RGBA 버퍼 폭증으로 인한 OOM/크래시를 방지한다.
    if let Ok(data) = std::fs::read(path) {
        let decoded = {
            let _permit = HeavyOpPermit::acquire();
            image::load_from_memory(&data).ok().map(|img| {
                let thumb = img.thumbnail(size, size);
                let mut buf = Vec::new();
                let _ =
                    thumb.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png);
                buf
            })
        };
        if let Some(buf) = decoded {
            if !buf.is_empty() {
                return Ok(Some(buf));
            }
        }
    }
    crate::modules::media_ops::get_os_thumbnail(path, size)
}

// PSD/PSB 임베드 썸네일(8BIM 이미지 리소스 ID 1036, JPEG) 추출.
// 파일 앞부분(헤더 + 이미지 리소스 섹션)만 읽으므로 레이어 합성 디코딩 없이
// 용량과 무관하게 가볍다. 임베드 썸네일이 없으면 None.
fn extract_psd_embedded_thumbnail(path: &Path, size: u32) -> Result<Option<Vec<u8>>> {
    use std::io::{Read, Seek, SeekFrom};

    let mut file = std::fs::File::open(path)?;
    let mut header = [0u8; 26];
    if file.read_exact(&mut header).is_err() || &header[0..4] != b"8BPS" {
        return Ok(None);
    }
    // version: 1=PSD, 2=PSB — 이미지 리소스 섹션 구조는 동일하므로 구분 불필요

    let mut len_buf = [0u8; 4];
    // Color Mode Data 섹션: 길이(4바이트) 후 데이터 스킵
    file.read_exact(&mut len_buf)?;
    let color_mode_len = u32::from_be_bytes(len_buf) as i64;
    file.seek(SeekFrom::Current(color_mode_len))?;

    // Image Resources 섹션 길이
    file.read_exact(&mut len_buf)?;
    let resources_len = u32::from_be_bytes(len_buf) as usize;
    // 임베드 썸네일은 보통 수십 KB. 비정상적으로 큰 섹션은 방어적으로 제외.
    const MAX_RESOURCES_BYTES: usize = 64 * 1024 * 1024;
    if resources_len == 0 || resources_len > MAX_RESOURCES_BYTES {
        return Ok(None);
    }
    let mut resources = vec![0u8; resources_len];
    file.read_exact(&mut resources)?;

    // 리소스 블록 순회: '8BIM' + id(2) + pascal name(짝수 패딩) + size(4) + data(짝수 패딩)
    let mut pos = 0usize;
    while pos + 4 <= resources.len() {
        if &resources[pos..pos + 4] != b"8BIM" {
            break;
        }
        pos += 4;
        if pos + 2 > resources.len() {
            break;
        }
        let id = u16::from_be_bytes([resources[pos], resources[pos + 1]]);
        pos += 2;
        if pos >= resources.len() {
            break;
        }
        let name_field = 1 + resources[pos] as usize;
        pos += name_field + (name_field & 1);
        if pos + 4 > resources.len() {
            break;
        }
        let data_size = u32::from_be_bytes([
            resources[pos],
            resources[pos + 1],
            resources[pos + 2],
            resources[pos + 3],
        ]) as usize;
        pos += 4;
        let data_end = pos.checked_add(data_size).filter(|e| *e <= resources.len());
        let Some(data_end) = data_end else {
            break;
        };

        // 1036: thumbnail resource 헤더(28바이트) 후 JFIF(JPEG) 데이터, format 1 = kJpegRGB
        if id == 1036 && data_size > 28 {
            let format = u32::from_be_bytes([
                resources[pos],
                resources[pos + 1],
                resources[pos + 2],
                resources[pos + 3],
            ]);
            let jfif = &resources[pos + 28..data_end];
            if format == 1 && jfif.len() > 2 && jfif[0] == 0xFF && jfif[1] == 0xD8 {
                if let Ok(img) =
                    image::load_from_memory_with_format(jfif, image::ImageFormat::Jpeg)
                {
                    let thumb = if size == 0 {
                        img
                    } else {
                        img.thumbnail(size, size)
                    };
                    let mut buf = vec![];
                    thumb.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;
                    return Ok(Some(buf));
                }
            }
        }
        pos = data_end + (data_size & 1);
    }
    Ok(None)
}

// PackBits(RLE) 한 스캔라인 디코드 → out에 width 바이트를 append.
// 데이터가 모자라면 0으로 패딩(손상 방어).
fn packbits_decode_scanline(src: &[u8], out: &mut Vec<u8>, expected: usize) {
    let start = out.len();
    let mut i = 0usize;
    while i < src.len() && out.len() - start < expected {
        let n = src[i] as i8;
        i += 1;
        if n >= 0 {
            let cnt = n as usize + 1;
            for _ in 0..cnt {
                if i < src.len() {
                    out.push(src[i]);
                    i += 1;
                }
            }
        } else if n != -128 {
            let cnt = (1 - n as i32) as usize;
            if i < src.len() {
                let b = src[i];
                i += 1;
                for _ in 0..cnt {
                    out.push(b);
                }
            }
        }
    }
    while out.len() - start < expected {
        out.push(0);
    }
}

// PSD/PSB 끝부분의 merged composite(평탄화 전체 해상도 이미지)만 추출.
// 파일 앞에서 레이어&마스크 섹션 "길이"만 읽고 seek로 건너뛴 뒤(거대한 레이어 데이터
// 다운로드/파싱 회피), 끝의 Image Data 섹션만 읽어 디코드한다. 클라우드(File Provider)는
// seek+부분 읽기로 해당 구간만 받으므로 수백 MB PSD도 수백 KB만 받고 선명한 미리보기를 얻는다.
// 지원: 8-bit, RGB/Grayscale, 압축 raw(0)/RLE(1). 그 외(16/32-bit, CMYK/Lab, ZIP)는 None → 상위 폴백.
fn extract_psd_merged_composite(path: &Path, size: u32) -> Result<Option<Vec<u8>>> {
    use std::io::{Read, Seek, SeekFrom};

    let mut file = std::fs::File::open(path)?;
    let mut header = [0u8; 26];
    if file.read_exact(&mut header).is_err() || &header[0..4] != b"8BPS" {
        return Ok(None);
    }
    let version = u16::from_be_bytes([header[4], header[5]]);
    let is_psb = version == 2;
    let channels = u16::from_be_bytes([header[12], header[13]]) as usize;
    let height = u32::from_be_bytes([header[14], header[15], header[16], header[17]]) as usize;
    let width = u32::from_be_bytes([header[18], header[19], header[20], header[21]]) as usize;
    let depth = u16::from_be_bytes([header[22], header[23]]);
    let color_mode = u16::from_be_bytes([header[24], header[25]]);

    // 지원 범위 제한(그 외는 상위 폴백). 1=Grayscale, 3=RGB.
    if depth != 8 || !(color_mode == 1 || color_mode == 3) || channels == 0 {
        return Ok(None);
    }
    let plane_size = width.checked_mul(height).unwrap_or(usize::MAX);
    // 합성본 디코드는 width*height*channels 메모리. 비현실적 대용량은 폴백(임베드).
    const MAX_COMPOSITE_PIXELS: usize = 100_000_000; // 100MP
    if plane_size == 0 || plane_size > MAX_COMPOSITE_PIXELS {
        return Ok(None);
    }

    let mut len4 = [0u8; 4];
    let mut len8 = [0u8; 8];
    // Color Mode Data: 길이(4) 후 스킵
    file.read_exact(&mut len4)?;
    file.seek(SeekFrom::Current(u32::from_be_bytes(len4) as i64))?;
    // Image Resources: 길이(4) 후 스킵 (XMP 등 대용량이어도 내용은 안 읽음)
    file.read_exact(&mut len4)?;
    file.seek(SeekFrom::Current(u32::from_be_bytes(len4) as i64))?;
    // Layer & Mask Information: 길이(PSD=4, PSB=8) 후 그만큼 스킵 → 레이어 본문 회피
    let layer_mask_len: u64 = if is_psb {
        file.read_exact(&mut len8)?;
        u64::from_be_bytes(len8)
    } else {
        file.read_exact(&mut len4)?;
        u32::from_be_bytes(len4) as u64
    };
    file.seek(SeekFrom::Current(layer_mask_len as i64))?;

    // Image Data 섹션(파일 끝까지): 압축방식(2) + 채널 planar 데이터
    let mut comp_buf = [0u8; 2];
    if file.read_exact(&mut comp_buf).is_err() {
        return Ok(None);
    }
    let compression = u16::from_be_bytes(comp_buf);
    let mut data = Vec::new();
    file.read_to_end(&mut data)?;

    // 채널 평면 디코드(planar: 전체 R, 전체 G, ...)
    let mut planes: Vec<Vec<u8>> = Vec::with_capacity(channels);
    match compression {
        0 => {
            // raw: channels * plane_size 바이트
            if data.len() < channels.saturating_mul(plane_size) {
                return Ok(None);
            }
            for c in 0..channels {
                planes.push(data[c * plane_size..(c + 1) * plane_size].to_vec());
            }
        }
        1 => {
            // RLE: 스캔라인 바이트수 테이블(PSD 2바이트/PSB 4바이트 × channels×height) + PackBits
            let count_bytes = if is_psb { 4 } else { 2 };
            let total_scanlines = channels.saturating_mul(height);
            let table_len = total_scanlines.saturating_mul(count_bytes);
            if data.len() < table_len {
                return Ok(None);
            }
            let mut counts = Vec::with_capacity(total_scanlines);
            for s in 0..total_scanlines {
                let o = s * count_bytes;
                let c = if is_psb {
                    u32::from_be_bytes([data[o], data[o + 1], data[o + 2], data[o + 3]]) as usize
                } else {
                    u16::from_be_bytes([data[o], data[o + 1]]) as usize
                };
                counts.push(c);
            }
            let mut off = table_len;
            for c in 0..channels {
                let mut plane = Vec::with_capacity(plane_size);
                for y in 0..height {
                    let clen = counts[c * height + y];
                    let end = off.saturating_add(clen);
                    if end > data.len() {
                        return Ok(None);
                    }
                    packbits_decode_scanline(&data[off..end], &mut plane, width);
                    off = end;
                }
                planes.push(plane);
            }
        }
        _ => return Ok(None), // ZIP(2/3) 등은 폴백
    }

    // RGBA 이미지 구성
    let mut img = image::RgbaImage::new(width as u32, height as u32);
    let is_rgb = color_mode == 3 && channels >= 3;
    let has_alpha = if is_rgb { channels >= 4 } else { channels >= 2 };
    for y in 0..height {
        for x in 0..width {
            let i = y * width + x;
            let (r, g, b) = if is_rgb {
                (planes[0][i], planes[1][i], planes[2][i])
            } else {
                let v = planes[0][i];
                (v, v, v)
            };
            let a = if has_alpha {
                let ach = if is_rgb { 3 } else { 1 };
                planes[ach][i]
            } else {
                255
            };
            img.put_pixel(x as u32, y as u32, image::Rgba([r, g, b, a]));
        }
    }

    let dynamic = image::DynamicImage::ImageRgba8(img);
    let output = if size == 0 || (width as u32 <= size && height as u32 <= size) {
        dynamic
    } else {
        dynamic.thumbnail(size, size)
    };
    let mut buf = vec![];
    output.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;
    Ok(Some(buf))
}

// 클라우드(File Provider) 파일이 아직 완전히 다운로드되지 않은 placeholder인지 판정.
// SF_DATALESS 플래그 기준 — 앞부분만 부분 읽기해도(blocks가 늘어도) 플래그는 유지되므로,
// "전체 파싱 시 전체 다운로드를 유발하는가" 판단에 정확하다. (blocks==0 기준은 부분 읽기 후 오판)
#[cfg(target_os = "macos")]
fn is_dataless_cloud_file(path: &Path) -> bool {
    use std::os::macos::fs::MetadataExt;
    const SF_DATALESS: u32 = 0x4000_0000;
    std::fs::metadata(path)
        .map(|meta| (meta.st_flags() & SF_DATALESS) != 0)
        .unwrap_or(false)
}

#[cfg(not(target_os = "macos"))]
fn is_dataless_cloud_file(_path: &Path) -> bool {
    false
}

// 임베드 썸네일(8BIM 1036)은 보통 ~160px로 작다. 그리드 표시(최대 320px)까지는 충분하지만
// 미리보기/컬럼뷰(원본 해상도=size 0 또는 큰 size)에서는 흐릿하므로 전체 합성으로 선명하게 낸다.
const PSD_EMBEDDED_MAX_SIZE: u32 = 320;

// PSD 전체 레이어 합성 후 size로 다운스케일한 PNG 바이트 생성(선명).
// dataless 클라우드 파일이면 std::fs::read가 전체 다운로드를 유발한다.
// 주의: HeavyOpPermit은 여기서 잡지 않는다. 로컬 경로는 호출자(ensure_cached_thumbnail/
// cached_thumbnail, use_heavy_op=true)가 이미 퍼밋을 보유하므로, 여기서 또 잡으면
// 이중 획득으로 슬롯(MAX_HEAVY_OPS=3)이 고갈돼 데드락/직렬화가 발생한다.
fn render_psd_full(path: &Path, size: u32) -> Result<Option<Vec<u8>>> {
    let bytes = std::fs::read(path)?;
    let psd = psd::Psd::from_bytes(&bytes)
        .map_err(|e| AppError::ImageProcessing(format!("PSD 파싱 실패: {}", e)))?;

    let rgba_pixels = psd.rgba();
    let width = psd.width();
    let height = psd.height();

    let img = image::RgbaImage::from_raw(width, height, rgba_pixels)
        .ok_or_else(|| AppError::ImageProcessing("PSD 픽셀 변환 실패".to_string()))?;
    let dynamic = image::DynamicImage::ImageRgba8(img);
    let output = if size == 0 || (width <= size && height <= size) {
        dynamic
    } else {
        dynamic.thumbnail(size, size)
    };

    let mut buf = vec![];
    output.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;
    Ok(Some(buf))
}

fn generate_psd_thumbnail_bytes(path: &Path, size: u32) -> Result<Option<Vec<u8>>> {
    // 1) 그리드용 작은 크기는 임베드 썸네일 우선(용량 무관, 레이어 합성 없음).
    //    size==0(원본) 또는 320 초과(미리보기·컬럼뷰)는 임베드를 건너뛰고 전체 합성.
    if size != 0 && size <= PSD_EMBEDDED_MAX_SIZE {
        if let Ok(Some(bytes)) = extract_psd_embedded_thumbnail(path, size) {
            return Ok(Some(bytes));
        }
    }

    // 2) 전체 파싱(합성). 대용량 PSD 전체 합성은 메모리 과부하·크래시 위험 →
    //    초과 시 임베드 썸네일이라도 반환(미리보기는 다소 작아도 빈 화면보다 낫다).
    const MAX_FULL_PARSE_BYTES: u64 = 200 * 1024 * 1024;
    let file_len = std::fs::metadata(path).map(|m| m.len()).unwrap_or(u64::MAX);
    if file_len > MAX_FULL_PARSE_BYTES {
        return extract_psd_embedded_thumbnail(path, size);
    }

    render_psd_full(path, size)
}

// 미리보기(스페이스바/모달) 전용 PSD 렌더: 임베드 단축 없이 항상 전체 합성으로 선명하게.
// 사용자의 명시적 1회 동작이므로 클라우드 dataless 파일의 전체 다운로드를 감수한다.
// 그리드(generate_psd_thumbnail_bytes)보다 상한을 크게 잡되, 비현실적 대용량은
// 임베드로 폴백해 OOM/크래시를 막는다.
fn generate_psd_preview_bytes(path: &Path, size: u32) -> Result<Option<Vec<u8>>> {
    // 1) 파일 끝의 merged composite(평탄화 전체 해상도)만 부분 읽기 → 거대한 레이어 데이터
    //    다운로드/합성을 회피하면서 캔버스 전체 해상도로 선명. 대용량 PSD에서 가장 빠르다.
    if let Ok(Some(bytes)) = extract_psd_merged_composite(path, size) {
        return Ok(Some(bytes));
    }
    // 2) merged composite가 없거나(최대 호환성 끔) 미지원 포맷 → 임베드 썸네일(작지만 빠름).
    if let Ok(Some(bytes)) = extract_psd_embedded_thumbnail(path, size) {
        return Ok(Some(bytes));
    }
    // 3) 최후: 전체 레이어 합성(느림·메모리). 1GB 이하만 시도, 초과는 빈 결과.
    const MAX_PREVIEW_PARSE_BYTES: u64 = 1024 * 1024 * 1024;
    let file_len = std::fs::metadata(path).map(|m| m.len()).unwrap_or(u64::MAX);
    if file_len <= MAX_PREVIEW_PARSE_BYTES {
        return render_psd_full(path, size);
    }
    Ok(None)
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

    let app_cache = app
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))?;
    let cache_dir = app_cache.join("img_thumbnails");

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
        // 클라우드 이미지: 실제 이미지 디코딩 우선 → aspect ratio 보존. 실패 시 OS 썸네일 폴백.
        let is_cloud = crate::helpers::is_cloud_path(&resolved_path_str);
        if is_cloud {
            if let Some(cache_path) =
                ensure_google_drive_thumbnail(&app_cache, &resolved_path_str, size, || {
                    generate_cloud_image_thumbnail_bytes(&resolved_path_str, &ext, size)
                })?
            {
                return Ok(Some(cache_path.to_string_lossy().to_string()));
            }
        }
        // 클라우드(QuickLook)는 I/O 대기형이라 CPU heavy-op 퍼밋을 잡지 않음 → 동시성↑(프론트 큐가 제한)
        let cache_path = ensure_cached_thumbnail(
            &cache_dir,
            &resolved_path_str,
            size,
            !is_cloud,
            is_cloud,
            || {
                if is_cloud {
                    return generate_cloud_image_thumbnail_bytes(&resolved_path_str, &ext, size);
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

    let app_cache = app
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))?;
    let cache_dir = app_cache.join("img_thumbnails");

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

        let is_cloud = crate::helpers::is_cloud_path(&resolved_path_str);
        if is_cloud {
            if let Some(cache_path) =
                ensure_google_drive_thumbnail(&app_cache, &resolved_path_str, size, || {
                    generate_cloud_image_thumbnail_bytes(&resolved_path_str, &ext, size)
                })?
            {
                let cached = std::fs::read(cache_path)?;
                return Ok(Some(
                    base64::engine::general_purpose::STANDARD.encode(&cached),
                ));
            }
        }

        cached_thumbnail(&cache_dir, &resolved_path_str, size, !is_cloud, || {
            if is_cloud {
                return generate_cloud_image_thumbnail_bytes(&resolved_path_str, &ext, size);
            }
            generate_image_thumbnail_bytes(&resolved_path_str, &ext, size)
        })
    })
    .await
    .map_err(|e| AppError::Internal(format!("썸네일 생성 실패: {}", e)))?
}

// 미리보기 캐시(psd_previews / 클라우드는 drive_thumbnails)를 보장하고 캐시 PNG 경로를 반환.
// 미리보기 표시(base64)와 백그라운드 프리워밍이 같은 캐시 키를 공유하도록 공통화한다.
fn resolve_psd_preview_cache(
    app: &tauri::AppHandle,
    app_cache: &Path,
    path: &str,
    size: u32,
) -> Result<Option<PathBuf>> {
    let resolved_path =
        materialize_archive_path_in_cache(app, path)?.unwrap_or_else(|| PathBuf::from(path));
    let resolved_path_str = resolved_path.to_string_lossy().to_string();

    // 클라우드(구글드라이브): fileId 기반 캐시로 안정화. dataless여도 끝부분 merged composite만
    // 부분 읽기하므로 전체 다운로드 없이 선명 렌더(generate_psd_preview_bytes).
    if crate::helpers::is_cloud_path(&resolved_path_str) {
        return ensure_google_drive_thumbnail(app_cache, &resolved_path_str, size, || {
            generate_psd_preview_bytes(&resolved_path, size)
        });
    }

    let cache_dir = app_cache.join("psd_previews");
    ensure_cached_thumbnail(&cache_dir, &resolved_path_str, size, true, false, || {
        generate_psd_preview_bytes(&resolved_path, size)
    })
}

// PSD 썸네일 생성 (디스크 캐시 + base64 PNG 반환)
// spawn_blocking: 네트워크 파일시스템에서 tokio 워커 차단 방지
#[tauri::command]
pub async fn get_psd_thumbnail(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>> {
    use base64::Engine;
    use tauri::Manager;

    let app_cache = app
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))?;

    tauri::async_runtime::spawn_blocking(move || {
        match resolve_psd_preview_cache(&app, &app_cache, &path, size)? {
            Some(cache_path) => {
                let cached = std::fs::read(cache_path)?;
                Ok(Some(
                    base64::engine::general_purpose::STANDARD.encode(&cached),
                ))
            }
            None => Ok(None),
        }
    })
    .await
    .map_err(|e| AppError::Internal(format!("PSD 썸네일 생성 실패: {}", e)))?
}

// 미리보기 composite 캐시를 백그라운드로 미리 데움(바이트 미반환 → IPC 경량).
// 선택 항목을 미리 워밍해 스페이스바 미리보기를 즉시 표시하기 위함.
#[tauri::command]
pub async fn prewarm_psd_preview(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<bool> {
    use tauri::Manager;

    let app_cache = app
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))?;

    tauri::async_runtime::spawn_blocking(move || {
        Ok(resolve_psd_preview_cache(&app, &app_cache, &path, size)?.is_some())
    })
    .await
    .map_err(|e| AppError::Internal(format!("PSD 미리보기 프리워밍 실패: {}", e)))?
}

#[tauri::command]
pub async fn get_psd_thumbnail_path(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>> {
    use tauri::Manager;

    let app_cache = app
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))?;
    let cache_dir = app_cache.join("psd_thumbnails");

    tauri::async_runtime::spawn_blocking(move || -> Result<Option<String>> {
        let resolved_path =
            materialize_archive_path_in_cache(&app, &path)?.unwrap_or_else(|| PathBuf::from(&path));
        let resolved_path_str = resolved_path.to_string_lossy().to_string();
        let is_cloud = crate::helpers::is_cloud_path(&resolved_path_str);

        if is_cloud {
            if let Some(cache_path) =
                ensure_google_drive_thumbnail(&app_cache, &resolved_path_str, size, || {
                    // 임베드 썸네일은 파일 앞부분(헤더+이미지 리소스)에만 있어 부분 읽기로 추출 가능하다.
                    // File Provider(구글드라이브)는 부분 다운로드를 지원해 dataless여도 앞 ~수 MB만 받는다.
                    // QuickLook은 비정사각 이미지를 잘라/왜곡하므로 PSD 경로에서는 쓰지 않는다(비율 보존).
                    if is_dataless_cloud_file(&resolved_path) {
                        // 미다운로드: 임베드 썸네일만 부분 읽기로 추출. 전체 파싱(=전체 다운로드)은 회피.
                        return extract_psd_embedded_thumbnail(&resolved_path, size);
                    }
                    // 다운로드됨: 임베드 우선 + 전체 파싱 폴백(둘 다 비율 보존).
                    generate_psd_thumbnail_bytes(&resolved_path, size)
                })?
            {
                return Ok(Some(cache_path.to_string_lossy().to_string()));
            }
            return Ok(None);
        }

        let cache_path =
            ensure_cached_thumbnail(&cache_dir, &resolved_path_str, size, true, false, || {
                generate_psd_thumbnail_bytes(&resolved_path, size)
            })?;
        Ok(cache_path.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| AppError::Internal(format!("PSD 썸네일 생성 실패: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::{
        ensure_cached_thumbnail, ensure_google_drive_thumbnail,
        generate_cloud_image_thumbnail_bytes, google_drive_thumbnail_cache_file,
        invalidate_thumbnail_cache_paths_in_root, negative_thumbnail_cache_file,
        safe_google_drive_file_id,
    };

    fn unique_test_dir(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "quickfolder_drive_thumbnail_cache_{}_{}_{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn single_none_file(dir: &std::path::Path) -> std::path::PathBuf {
        std::fs::read_dir(dir)
            .unwrap()
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .find(|path| path.extension().and_then(|ext| ext.to_str()) == Some("none"))
            .expect("negative cache sentinel")
    }

    #[test]
    fn drive_thumbnail_cache_file_uses_safe_file_id_and_size() {
        let root = unique_test_dir("path");
        let cache_file = google_drive_thumbnail_cache_file(&root, "drive:id/123", 128)
            .expect("drive thumbnail cache path");

        assert!(cache_file.ends_with("drive_thumbnails/drive_id_123_128_v5.png"));
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn drive_thumbnail_cache_ignores_blank_file_id() {
        assert_eq!(safe_google_drive_file_id("  "), None);
    }

    #[test]
    fn ensure_google_drive_thumbnail_roundtrips_service_file_id_cache() {
        let root = unique_test_dir("roundtrip");
        std::fs::create_dir_all(&root).unwrap();
        let service_file = root.join("sample.gdoc");
        std::fs::write(&service_file, r#"{"doc_id":"drive_file_123"}"#).unwrap();
        let bytes = vec![137, 80, 78, 71, 13, 10, 26, 10];

        let cache_file =
            ensure_google_drive_thumbnail(&root, &service_file.to_string_lossy(), 160, || {
                Ok(Some(bytes.clone()))
            })
            .expect("drive thumbnail cache")
            .expect("cache file");

        assert!(cache_file.ends_with("drive_thumbnails/drive_file_123_160_v5.png"));
        assert_eq!(std::fs::read(&cache_file).unwrap(), bytes);

        let hit =
            ensure_google_drive_thumbnail(&root, &service_file.to_string_lossy(), 160, || {
                panic!("cache hit should not regenerate")
            })
            .expect("drive thumbnail cache hit")
            .expect("cache hit file");
        assert_eq!(hit, cache_file);

        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn cloud_image_thumbnail_prefers_uncropped_decoded_image() {
        let root = unique_test_dir("cloud_uncropped");
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("wide.png");
        let image = image::RgbaImage::from_pixel(320, 120, image::Rgba([255, 0, 0, 255]));
        image.save(&source).unwrap();

        let bytes =
            generate_cloud_image_thumbnail_bytes(&source.to_string_lossy(), "png", 160).unwrap();
        let decoded = image::load_from_memory(&bytes.expect("thumbnail bytes")).unwrap();

        assert_eq!((decoded.width(), decoded.height()), (160, 60));
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn ensure_cached_thumbnail_refreshes_mtime_on_hit() {
        let root = unique_test_dir("touch");
        let cache_dir = root.join("img_thumbnails");
        let source = root.join("source.png");
        std::fs::create_dir_all(&cache_dir).unwrap();
        std::fs::write(&source, b"source").unwrap();
        let bytes = vec![137, 80, 78, 71, 13, 10, 26, 10];

        let cache_file = ensure_cached_thumbnail(
            &cache_dir,
            &source.to_string_lossy(),
            128,
            false,
            false,
            || Ok(Some(bytes.clone())),
        )
        .expect("thumbnail cache")
        .expect("cache file");
        let old_time = filetime::FileTime::from_unix_time(1, 0);
        filetime::set_file_mtime(&cache_file, old_time).unwrap();

        let hit = ensure_cached_thumbnail(
            &cache_dir,
            &source.to_string_lossy(),
            128,
            false,
            false,
            || panic!("cache hit should not regenerate"),
        )
        .expect("thumbnail cache hit")
        .expect("cache hit file");

        assert_eq!(hit, cache_file);
        assert!(
            std::fs::metadata(&cache_file).unwrap().modified().unwrap() > std::time::UNIX_EPOCH
        );
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn ensure_cached_thumbnail_persists_negative_cache() {
        let root = unique_test_dir("negative");
        let cache_dir = root.join("img_thumbnails");
        let source = root.join("source.png");
        std::fs::create_dir_all(&cache_dir).unwrap();
        std::fs::write(&source, b"source").unwrap();

        let miss = ensure_cached_thumbnail(
            &cache_dir,
            &source.to_string_lossy(),
            160,
            false,
            false,
            || Ok(None),
        )
        .expect("negative thumbnail cache");
        assert_eq!(miss, None);

        let none_file = single_none_file(&cache_dir);
        assert!(none_file.exists());

        let hit = ensure_cached_thumbnail(
            &cache_dir,
            &source.to_string_lossy(),
            160,
            false,
            false,
            || panic!("negative cache hit should not regenerate"),
        )
        .expect("negative thumbnail cache hit");
        assert_eq!(hit, None);

        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn invalidate_thumbnail_cache_removes_negative_cache() {
        let root = unique_test_dir("negative_invalidate");
        let cache_dir = root.join("img_thumbnails");
        let source = root.join("source.png");
        std::fs::create_dir_all(&cache_dir).unwrap();
        std::fs::write(&source, b"source").unwrap();

        ensure_cached_thumbnail(
            &cache_dir,
            &source.to_string_lossy(),
            160,
            false,
            false,
            || Ok(None),
        )
        .expect("negative thumbnail cache");
        let none_file = single_none_file(&cache_dir);

        invalidate_thumbnail_cache_paths_in_root(&root, &[source.to_string_lossy().to_string()]);
        assert!(!none_file.exists());

        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn invalidate_thumbnail_cache_removes_legacy_drive_cache() {
        let root = unique_test_dir("drive_legacy_invalidate");
        std::fs::create_dir_all(root.join("drive_thumbnails")).unwrap();
        let service_file = root.join("sample.gdoc");
        std::fs::write(&service_file, r#"{"doc_id":"drive_legacy_123"}"#).unwrap();
        let legacy_file = root
            .join("drive_thumbnails")
            .join("drive_legacy_123_160.png");
        let v2_file = root
            .join("drive_thumbnails")
            .join("drive_legacy_123_160_v2.png");
        std::fs::write(&legacy_file, b"old").unwrap();
        std::fs::write(&v2_file, b"old").unwrap();

        invalidate_thumbnail_cache_paths_in_root(
            &root,
            &[service_file.to_string_lossy().to_string()],
        );
        assert!(!legacy_file.exists());
        assert!(!v2_file.exists());

        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn ensure_google_drive_thumbnail_refreshes_mtime_on_hit() {
        let root = unique_test_dir("drive_touch");
        std::fs::create_dir_all(&root).unwrap();
        let service_file = root.join("sample.gdoc");
        std::fs::write(&service_file, r#"{"doc_id":"drive_touch_123"}"#).unwrap();
        let bytes = vec![137, 80, 78, 71, 13, 10, 26, 10];

        let cache_file =
            ensure_google_drive_thumbnail(&root, &service_file.to_string_lossy(), 160, || {
                Ok(Some(bytes.clone()))
            })
            .expect("drive thumbnail cache")
            .expect("cache file");
        let old_time = filetime::FileTime::from_unix_time(1, 0);
        filetime::set_file_mtime(&cache_file, old_time).unwrap();

        let hit =
            ensure_google_drive_thumbnail(&root, &service_file.to_string_lossy(), 160, || {
                panic!("cache hit should not regenerate")
            })
            .expect("drive thumbnail cache hit")
            .expect("cache hit file");

        assert_eq!(hit, cache_file);
        assert!(
            std::fs::metadata(&cache_file).unwrap().modified().unwrap() > std::time::UNIX_EPOCH
        );
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn ensure_google_drive_thumbnail_persists_negative_cache() {
        let root = unique_test_dir("drive_negative");
        std::fs::create_dir_all(&root).unwrap();
        let service_file = root.join("sample.gdoc");
        std::fs::write(&service_file, r#"{"doc_id":"drive_none_123"}"#).unwrap();

        let miss =
            ensure_google_drive_thumbnail(&root, &service_file.to_string_lossy(), 160, || Ok(None))
                .expect("drive negative thumbnail cache");
        assert_eq!(miss, None);

        let cache_file = google_drive_thumbnail_cache_file(&root, "drive_none_123", 160).unwrap();
        let none_file = negative_thumbnail_cache_file(&cache_file);
        assert!(none_file.exists());

        let hit =
            ensure_google_drive_thumbnail(&root, &service_file.to_string_lossy(), 160, || {
                panic!("drive negative cache hit should not regenerate")
            })
            .expect("drive negative thumbnail cache hit");
        assert_eq!(hit, None);

        std::fs::remove_dir_all(root).ok();
    }
}
