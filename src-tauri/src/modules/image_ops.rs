//! 이미지 처리 모듈 (썸네일, 픽셀화, 배경 제거, 스프라이트 시트, ICO/ICNS 변환, 폰트 처리)

use crate::helpers::*;
use super::constants::MAX_HEAVY_OPS;
use super::error::{AppError, Result};
use image::ImageEncoder;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub(crate) const THUMBNAIL_CACHE_MAX_BYTES: u64 = 10 * 1024 * 1024 * 1024;
pub(crate) const THUMBNAIL_CACHE_SIZES: [u32; 10] = [40, 60, 80, 100, 120, 160, 200, 240, 280, 320];
pub(crate) const THUMBNAIL_CACHE_DIR_NAMES: [&str; 3] = ["img_thumbnails", "psd_thumbnails", "video_thumbnails"];
const THUMBNAIL_CACHE_PRUNE_INTERVAL_MS: u64 = 60_000;
static LAST_THUMBNAIL_CACHE_PRUNE_MS: AtomicU64 = AtomicU64::new(0);

#[derive(serde::Serialize)]
pub struct ImageCompressPreview {
    pub data_url: String,
    pub size: u64,
}

// 이미지 규격 조회 (헤더만 읽어 빠르게 반환)
// spawn_blocking: 네트워크 파일시스템에서 tokio 워커 차단 방지
#[tauri::command]
pub async fn get_image_dimensions(path: String) -> Result<Option<(u32, u32)>> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Option<(u32, u32)>> {
        use std::io::Read;

        let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
        let supported = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "psd", "psb", "ico", "icns"];
        if !supported.contains(&ext.as_str()) {
            return Ok(None);
        }
        if ext == "psd" || ext == "psb" {
            // PSD 헤더에서 규격만 읽음 (26바이트만 필요, 전체 파일 로드 방지)
            let mut buf = [0u8; 26];
            let mut f = std::fs::File::open(&path)?;
            if f.read_exact(&mut buf).is_err() {
                return Ok(None);
            }
            let h = u32::from_be_bytes([buf[14], buf[15], buf[16], buf[17]]);
            let w = u32::from_be_bytes([buf[18], buf[19], buf[20], buf[21]]);
            return Ok(Some((w, h)));
        }
        if ext == "ico" {
            // ICO: ico 크레이트로 가장 큰 아이콘 크기 반환
            let file = std::fs::File::open(&path)?;
            if let Ok(icon_dir) = ico::IconDir::read(file) {
                let mut max_w = 0u32;
                let mut max_h = 0u32;
                for entry in icon_dir.entries() {
                    let w = entry.width();
                    let h = entry.height();
                    if w >= max_w && h >= max_h { max_w = w; max_h = h; }
                }
                if max_w > 0 { return Ok(Some((max_w, max_h))); }
            }
            return Ok(None);
        }
        if ext == "icns" {
            // ICNS: 가장 큰 아이콘의 크기를 반환
            let file = std::fs::File::open(&path)?;
            if let Ok(family) = icns::IconFamily::read(file) {
                let mut max_size = 0u32;
                for icon_type in family.available_icons() {
                    let s = icon_type.pixel_width();
                    if s > max_size { max_size = s; }
                }
                if max_size > 0 { return Ok(Some((max_size, max_size))); }
            }
            return Ok(None);
        }
        match image::image_dimensions(&path) {
            Ok((w, h)) => Ok(Some((w, h))),
            Err(_) => Ok(None),
        }
    })
    .await
    .map_err(|e| AppError::Internal(format!("이미지 규격 조회 실패: {}", e)))?
}

pub(crate) fn thumbnail_cache_root(app: &tauri::AppHandle) -> Result<PathBuf> {
    use tauri::Manager;
    app.path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))
}

fn thumbnail_cache_key(path: &str, size: u32) -> Option<String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let meta = std::fs::metadata(path).ok()?;
    let modified = meta.modified().ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    modified.hash(&mut hasher);
    size.hash(&mut hasher);
    Some(format!("{:x}", hasher.finish()))
}

fn collect_thumbnail_source_paths(path: &Path, out: &mut Vec<String>) {
    if path.is_file() {
        out.push(path.to_string_lossy().to_string());
        return;
    }
    if !path.is_dir() {
        return;
    }
    for entry in walkdir::WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
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
            let Some(cache_key) = thumbnail_cache_key(&source_path, size) else {
                continue;
            };
            for dir_name in THUMBNAIL_CACHE_DIR_NAMES {
                let cache_file = app_cache.join(dir_name).join(format!("{}.png", cache_key));
                if cache_file.exists() {
                    let _ = std::fs::remove_file(cache_file);
                }
            }
        }
    }
}

pub(crate) fn invalidate_thumbnail_cache_paths(app: &tauri::AppHandle, paths: &[String]) -> Result<()> {
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
    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;

    let meta = std::fs::metadata(path)?;
    // ignore_mtime=true (클라우드 경로): mtime을 키에서 제외 → 재동기화로 mtime이 바뀌어도
    // 캐시 유지(불필요한 재다운로드 방지). 내용 변경은 size 변화로 대부분 감지됨.
    let modified = if ignore_mtime {
        0
    } else {
        meta.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis())
            .unwrap_or(0)
    };

    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    modified.hash(&mut hasher);
    size.hash(&mut hasher);
    let cache_key = format!("{:x}", hasher.finish());

    std::fs::create_dir_all(cache_dir).ok();
    let cache_file = cache_dir.join(format!("{}.png", cache_key));

    // 캐시 히트
    if cache_file.exists() {
        prune_thumbnail_cache_for_dir(cache_dir);
        return Ok(Some(cache_file));
    }

    // 선택적 동시성 제한 + 패닉 방지
    let _permit = if use_heavy_op { Some(HeavyOpPermit::acquire()) } else { None };

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
            Ok(Some(base64::engine::general_purpose::STANDARD.encode(&cached)))
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
                                thumb.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;
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
            let icon = family.get_icon_with_type(icon_type)
                .map_err(|e| AppError::ImageProcessing(format!("ICNS 아이콘 추출 실패: {}", e)))?;
            let rgba = image::RgbaImage::from_raw(icon.width(), icon.height(), icon.data().to_vec())
                .ok_or_else(|| AppError::ImageProcessing("ICNS 이미지 변환 실패".to_string()))?;
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
pub async fn get_file_thumbnail_path(app: tauri::AppHandle, path: String, size: u32) -> Result<Option<String>> {
    use tauri::Manager;

    let cache_dir = app.path().app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))?
        .join("img_thumbnails");

    tauri::async_runtime::spawn_blocking(move || -> Result<Option<String>> {
        let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
        if !THUMBNAIL_IMAGE_EXTS.contains(&ext.as_str()) {
            return Ok(None);
        }
        // 클라우드 경로(구글드라이브 등): OS 네이티브 썸네일 우선 → 풀 다운로드 없이 제공자 썸네일 사용.
        // 캐시 키는 mtime 무시(재동기화 시 재다운로드 방지). 실패하면 일반 디코딩으로 폴백.
        let is_cloud = crate::helpers::is_cloud_path(&path);
        // 클라우드(QuickLook)는 I/O 대기형이라 CPU heavy-op 퍼밋을 잡지 않음 → 동시성↑(프론트 큐가 제한)
        let cache_path = ensure_cached_thumbnail(&cache_dir, &path, size, !is_cloud, is_cloud, || {
            // 클라우드: OS 네이티브 썸네일(QuickLook) 우선, 실패 시 바이트 디코딩 폴백
            if is_cloud {
                if let Ok(Some(bytes)) = crate::modules::media_ops::get_os_thumbnail(&path, size) {
                    return Ok(Some(bytes));
                }
            }
            generate_image_thumbnail_bytes(&path, &ext, size)
        })?;
        Ok(cache_path.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| AppError::Internal(format!("썸네일 경로 생성 실패: {}", e)))?
}

// 이미지 썸네일 생성 (디스크 캐시 + base64 PNG 반환 — 미리보기 등 단건 용도)
// spawn_blocking: 네트워크 파일시스템에서 tokio 워커 차단 방지
#[tauri::command]
pub async fn get_file_thumbnail(app: tauri::AppHandle, path: String, size: u32) -> Result<Option<String>> {
    use tauri::Manager;

    let cache_dir = app.path().app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))?
        .join("img_thumbnails");

    tauri::async_runtime::spawn_blocking(move || {
        let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
        if !THUMBNAIL_IMAGE_EXTS.contains(&ext.as_str()) {
            return Ok(None);
        }

        cached_thumbnail(&cache_dir, &path, size, true, || {
            generate_image_thumbnail_bytes(&path, &ext, size)
        })
    })
    .await
    .map_err(|e| AppError::Internal(format!("썸네일 생성 실패: {}", e)))?
}

// PSD 썸네일 생성 (디스크 캐시 + base64 PNG 반환)
// spawn_blocking: 네트워크 파일시스템에서 tokio 워커 차단 방지
#[tauri::command]
pub async fn get_psd_thumbnail(app: tauri::AppHandle, path: String, size: u32) -> Result<Option<String>> {
    use tauri::Manager;

    let cache_dir = app.path().app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))?
        .join("psd_thumbnails");

    tauri::async_runtime::spawn_blocking(move || {
        cached_thumbnail(&cache_dir, &path, size, true, || {
            let bytes = std::fs::read(&path)?;
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

// 픽셀레이트 헬퍼: 이미지를 축소 후 재확대하여 픽셀 블록 효과 생성
fn apply_pixelate(img: &image::DynamicImage, pixel_size: u32, output_size: u32, max_colors: u32) -> image::DynamicImage {
    let (w, h) = (img.width(), img.height());
    // pixel_size 기준으로 축소 (블록 평균색 생성)
    let small_w = (w / pixel_size).max(1);
    let small_h = (h / pixel_size).max(1);
    // Nearest 필터로 축소: 각 블록의 평균색 계산
    let small = img.resize_exact(small_w, small_h, image::imageops::FilterType::Nearest);
    // 원본 크기로 재확대: 각 블록이 픽셀화된 사각형으로 표현됨
    let mut pixelated = small.resize_exact(w, h, image::imageops::FilterType::Nearest);

    // 컬러 양자화 (max_colors > 0일 때)
    if max_colors > 0 && max_colors < 256 {
        let mut rgba = pixelated.to_rgba8();
        quantize_colors(&mut rgba, max_colors as usize);
        pixelated = image::DynamicImage::ImageRgba8(rgba);
    }

    // 최종 출력 크기 조정 (output_size > 0 이고 원본보다 작을 때만)
    if output_size > 0 && output_size < w.max(h) {
        pixelated.resize(output_size, output_size, image::imageops::FilterType::Nearest)
    } else {
        pixelated
    }
}

// Median-cut 컬러 양자화: 이미지 색상을 max_colors개로 축소
fn quantize_colors(img: &mut image::RgbaImage, max_colors: usize) {
    // 불투명 픽셀의 RGB 수집
    let pixels: Vec<[u8; 3]> = img.pixels()
        .filter(|p| p.0[3] > 0)
        .map(|p| [p.0[0], p.0[1], p.0[2]])
        .collect();
    if pixels.is_empty() { return; }

    // Median-cut으로 팔레트 생성
    let palette = median_cut(pixels, max_colors);

    // 각 픽셀을 가장 가까운 팔레트 색상으로 매핑
    for pixel in img.pixels_mut() {
        if pixel.0[3] == 0 { continue; }
        let rgb = [pixel.0[0], pixel.0[1], pixel.0[2]];
        let nearest = palette.iter()
            .min_by_key(|c| {
                let dr = rgb[0] as i32 - c[0] as i32;
                let dg = rgb[1] as i32 - c[1] as i32;
                let db = rgb[2] as i32 - c[2] as i32;
                dr * dr + dg * dg + db * db
            })
            .unwrap();
        pixel.0[0] = nearest[0];
        pixel.0[1] = nearest[1];
        pixel.0[2] = nearest[2];
    }
}

// Median-cut 알고리즘: RGB 공간을 재귀적으로 분할하여 대표 팔레트 생성
fn median_cut(pixels: Vec<[u8; 3]>, max_colors: usize) -> Vec<[u8; 3]> {
    let mut buckets = vec![pixels];

    while buckets.len() < max_colors {
        // 가장 큰 버킷 선택
        let idx = buckets.iter().enumerate()
            .filter(|(_, b)| b.len() > 1)
            .max_by_key(|(_, b)| b.len())
            .map(|(i, _)| i);

        let idx = match idx {
            Some(i) => i,
            None => break, // 더 이상 분할 불가
        };

        let bucket = buckets.remove(idx);

        // 가장 범위가 넓은 채널로 분할
        let mut ranges = [0u8; 3];
        for ch in 0..3 {
            let min = bucket.iter().map(|p| p[ch]).min().unwrap();
            let max = bucket.iter().map(|p| p[ch]).max().unwrap();
            ranges[ch] = max - min;
        }
        let split_ch = if ranges[0] >= ranges[1] && ranges[0] >= ranges[2] { 0 }
            else if ranges[1] >= ranges[2] { 1 }
            else { 2 };

        let mut sorted = bucket;
        sorted.sort_by_key(|p| p[split_ch]);

        let mid = sorted.len() / 2;
        let right = sorted.split_off(mid);
        buckets.push(sorted);
        buckets.push(right);
    }

    // 각 버킷의 평균색을 팔레트로 반환
    buckets.iter().map(|bucket| {
        let len = bucket.len() as u32;
        let r = bucket.iter().map(|p| p[0] as u32).sum::<u32>() / len;
        let g = bucket.iter().map(|p| p[1] as u32).sum::<u32>() / len;
        let b = bucket.iter().map(|p| p[2] as u32).sum::<u32>() / len;
        [r as u8, g as u8, b as u8]
    }).collect()
}

// 픽셀레이트 미리보기: 빠른 응답을 위해 300px 제한 후 픽셀화, base64 PNG 반환
#[tauri::command]
pub async fn pixelate_preview(input: String, pixel_size: u32, scale: u32, max_colors: u32) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 원본 이미지 열기
        let img = image::open(&input)?;

        // 미리보기용: 긴 변이 300px 초과 시 Lanczos3 필터로 축소
        let preview_img = {
            let (w, h) = (img.width(), img.height());
            let max_side = w.max(h);
            if max_side > 300 {
                img.resize(300, 300, image::imageops::FilterType::Lanczos3)
            } else {
                img
            }
        };

        // 픽셀레이트 적용 (컬러 양자화 포함)
        let pixelated = apply_pixelate(&preview_img, pixel_size, scale, max_colors);

        // PNG로 인코딩 후 base64 문자열 반환 (data:image 접두사 없음)
        let mut buf = vec![];
        pixelated
            .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;

        use base64::Engine;
        Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
    })
    .await
    .map_err(|e| AppError::Internal(format!("픽셀레이트 미리보기 실패: {}", e)))?
}

// 픽셀레이트 저장: 원본 해상도로 픽셀화 후 {stem}_pixel.png 파일로 저장, 경로 반환
#[tauri::command]
pub async fn pixelate_image(input: String, pixel_size: u32, scale: u32, max_colors: u32) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 원본 해상도로 이미지 열기
        let img = image::open(&input)?;

        // 픽셀레이트 적용 (컬러 양자화 포함)
        let pixelated = apply_pixelate(&img, pixel_size, scale, max_colors);

        // 출력 경로 결정: {stem}_pixel.png, 존재하면 _pixel_2.png, _pixel_3.png ... 순서로 탐색
        let input_path = std::path::Path::new(&input);
        let parent = input_path.parent().unwrap_or(std::path::Path::new("."));
        let stem = input_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("image");

        let output_path = find_unique_path(parent, stem, "_pixel", ".png");

        // PNG 파일로 저장
        pixelated.save_with_format(&output_path, image::ImageFormat::Png)?;

        output_path
            .to_str()
            .map(|s| s.to_string())
            .ok_or_else(|| AppError::Internal("출력 경로 변환 실패".to_string()))
    })
    .await
    .map_err(|e| AppError::Internal(format!("픽셀레이트 이미지 저장 실패: {}", e)))?
}

// ─── 폰트 처리 ─────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct FontInfo {
    name: String,
    family: String,
    style: String,
    glyph_count: u32,
}

#[tauri::command]
pub fn get_font_info(path: String) -> Result<FontInfo> {
    let data = std::fs::read(&path)?;
    let face = ttf_parser::Face::parse(&data, 0)
        .map_err(|e| AppError::FontProcessing(format!("폰트 파싱 실패: {}", e)))?;

    let mut name = String::new();
    let mut family = String::new();
    let mut style = String::new();

    for record in face.names() {
        // name_id 4 = Full Name, 1 = Family, 2 = Style
        if let Some(s) = record.to_string() {
            match record.name_id {
                ttf_parser::name_id::FULL_NAME => if name.is_empty() { name = s; },
                ttf_parser::name_id::FAMILY => if family.is_empty() { family = s; },
                ttf_parser::name_id::SUBFAMILY => if style.is_empty() { style = s; },
                _ => {}
            }
        }
    }

    if name.is_empty() {
        // 파일명에서 추출
        name = std::path::Path::new(&path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();
    }
    if family.is_empty() { family = name.clone(); }
    if style.is_empty() { style = "Regular".to_string(); }

    Ok(FontInfo {
        name,
        family,
        style,
        glyph_count: face.number_of_glyphs() as u32,
    })
}

#[tauri::command]
pub fn read_font_bytes(path: String) -> Result<String> {
    let data = std::fs::read(&path)?;
    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}

// ─── 이미지 크롭 ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn crop_image(path: String, x: u32, y: u32, width: u32, height: u32) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&path)?;

        // 크롭 영역이 이미지 범위 내인지 검증
        let (iw, ih) = (img.width(), img.height());
        if x + width > iw || y + height > ih {
            return Err(AppError::InvalidInput(format!(
                "크롭 영역이 이미지 범위를 벗어남: 이미지 {}x{}, 요청 ({},{}) {}x{}",
                iw, ih, x, y, width, height
            )));
        }

        let cropped = img.crop_imm(x, y, width, height);

        // 출력 경로: {stem}_crop.png
        let input_path = std::path::Path::new(&path);
        let parent = input_path.parent().unwrap_or(std::path::Path::new("."));
        let stem = input_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("image");

        let output_path = find_unique_path(parent, stem, "_crop", ".png");

        cropped.save_with_format(&output_path, image::ImageFormat::Png)?;

        output_path
            .to_str()
            .map(|s| s.to_string())
            .ok_or_else(|| AppError::Internal("출력 경로 변환 실패".to_string()))
    })
    .await
    .map_err(|e| AppError::Internal(format!("크롭 이미지 저장 실패: {}", e)))?
}

// ─── 이미지 드로잉 합성 저장 ─────────────────────────────────────────

#[tauri::command]
pub async fn save_annotated_image(original_path: String, image_data: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        // data URL에서 base64 부분 추출
        let base64_data = image_data
            .strip_prefix("data:image/png;base64,")
            .unwrap_or(&image_data);

        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(base64_data)
            .map_err(|e| AppError::InvalidInput(format!("base64 디코딩 실패: {}", e)))?;

        let img = image::load_from_memory(&bytes)?;

        let input_path = std::path::Path::new(&original_path);
        let parent = input_path.parent().unwrap_or(std::path::Path::new("."));
        let stem = input_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("image");

        let output_path = find_unique_path(parent, stem, "_edit", ".png");

        img.save_with_format(&output_path, image::ImageFormat::Png)?;

        output_path
            .to_str()
            .map(|s| s.to_string())
            .ok_or_else(|| AppError::Internal("출력 경로 변환 실패".to_string()))
    })
    .await
    .map_err(|e| AppError::Internal(format!("드로잉 저장 실패: {}", e)))?
}

// ─── 이미지 압축/리사이즈 ───────────────────────────────────────────

fn encode_compressed_image(path: &str, quality: &str) -> Result<(Vec<u8>, &'static str, &'static str)> {
    use image::codecs::jpeg::JpegEncoder;
    use image::codecs::png::{CompressionType, FilterType, PngEncoder};

    let img = image::open(path)?;
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let out_ext = if ext == "jpg" || ext == "jpeg" { "jpg" } else { "png" };
    let mut bytes = Vec::new();

    if out_ext == "jpg" {
        let q = match quality {
            "low" => 88,
            "medium" => 76,
            "high" => 62,
            _ => 76,
        };
        let rgb = img.to_rgb8();
        let (w, h) = rgb.dimensions();
        let mut enc = JpegEncoder::new_with_quality(&mut bytes, q);
        enc.encode(&rgb, w, h, image::ExtendedColorType::Rgb8)?;
        Ok((bytes, "image/jpeg", "jpg"))
    } else {
        let rgba = img.to_rgba8();
        let (w, h) = rgba.dimensions();
        let (compression, filter) = match quality {
            "low" => (CompressionType::Fast, FilterType::NoFilter),
            "medium" => (CompressionType::Default, FilterType::Adaptive),
            "high" => (CompressionType::Best, FilterType::Adaptive),
            _ => (CompressionType::Default, FilterType::Adaptive),
        };
        let enc = PngEncoder::new_with_quality(&mut bytes, compression, filter);
        enc.write_image(&rgba, w, h, image::ExtendedColorType::Rgba8)?;
        Ok((bytes, "image/png", "png"))
    }
}

#[tauri::command]
pub async fn compress_image_preview(path: String, quality: String) -> Result<ImageCompressPreview> {
    tauri::async_runtime::spawn_blocking(move || {
        use base64::Engine;

        let (bytes, mime, _) = encode_compressed_image(&path, &quality)?;
        let size = bytes.len() as u64;
        let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
        Ok(ImageCompressPreview {
            data_url: format!("data:{};base64,{}", mime, b64),
            size,
        })
    })
    .await
    .map_err(|e| AppError::Internal(format!("이미지 압축 미리보기 실패: {}", e)))?
}

#[tauri::command]
pub async fn compress_image(path: String, quality: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let input_path = std::path::Path::new(&path);
        let parent = input_path.parent().unwrap_or(std::path::Path::new("."));
        let stem = input_path.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
        let (bytes, _, out_ext) = encode_compressed_image(&path, &quality)?;
        let output_path = find_unique_path(parent, stem, "_compressed", &format!(".{}", out_ext));
        std::fs::write(&output_path, bytes)?;

        output_path
            .to_str()
            .map(|s| s.to_string())
            .ok_or_else(|| AppError::Internal("출력 경로 변환 실패".to_string()))
    })
    .await
    .map_err(|e| AppError::Internal(format!("이미지 압축 실패: {}", e)))?
}

#[tauri::command]
pub async fn resize_image(path: String, width: u32, height: u32) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        if width == 0 || height == 0 {
            return Err(AppError::InvalidInput("너비/높이는 1px 이상이어야 합니다.".to_string()));
        }
        let img = image::open(&path)?;
        let resized = img.resize_exact(width, height, image::imageops::FilterType::Lanczos3);

        let input_path = std::path::Path::new(&path);
        let parent = input_path.parent().unwrap_or(std::path::Path::new("."));
        let stem = input_path.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
        let ext = input_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("png")
            .to_lowercase();
        let out_ext = if ext == "jpg" || ext == "jpeg" { "jpg" } else { &ext };
        let output_path = find_unique_path(parent, stem, &format!("_{}x{}", width, height), &format!(".{}", out_ext));
        resized.save(&output_path)?;

        output_path
            .to_str()
            .map(|s| s.to_string())
            .ok_or_else(|| AppError::Internal("출력 경로 변환 실패".to_string()))
    })
    .await
    .map_err(|e| AppError::Internal(format!("이미지 크기조정 실패: {}", e)))?
}

// ─── 배경 제거 ───────────────────────────────────────────────────
// 플러드 필 기반: 지정 색상 영역을 투명 처리. 경계에 색상 디컨태미네이션 적용.

/// 대상 색상으로부터의 유클리드 거리
#[inline]
fn color_dist(r: u8, g: u8, b: u8, tr: u8, tg: u8, tb: u8) -> f64 {
    let dr = tr as f64 - r as f64;
    let dg = tg as f64 - g as f64;
    let db = tb as f64 - b as f64;
    (dr * dr + dg * dg + db * db).sqrt()
}

/// 배경 제거 핵심 알고리즘 (플러드 필 방식)
/// threshold: 0-100, feather: 0-50
/// seeds: 사용자 지정 시드 포인트. 비어있으면 가장자리 기반.
/// bg_color: 제거할 배경 색상 [R, G, B]
fn remove_bg(img: &image::DynamicImage, threshold: u8, feather: u8, seeds: &[[u32; 2]], bg_color: [u8; 3]) -> image::RgbaImage {
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let [bg_r, bg_g, bg_b] = bg_color;

    // 거리 스케일 변환 (최대 거리: sqrt(255² * 3) ≈ 441.67)
    let max_dist: f64 = (255.0_f64 * 255.0 * 3.0).sqrt();
    let t_dist = (threshold as f64 / 100.0) * max_dist;
    let f_dist = (feather as f64 / 100.0) * max_dist;
    let outer = t_dist + f_dist;

    // 1단계: 플러드 필로 배경 영역 마킹
    let mut mask = vec![0u8; (w * h) as usize];
    let mut queue = std::collections::VecDeque::new();

    if seeds.is_empty() {
        for x in 0..w {
            queue.push_back((x, 0));
            queue.push_back((x, h - 1));
        }
        for y in 1..h - 1 {
            queue.push_back((0, y));
            queue.push_back((w - 1, y));
        }
    } else {
        for seed in seeds {
            let sx = seed[0].min(w - 1);
            let sy = seed[1].min(h - 1);
            queue.push_back((sx, sy));
        }
    }

    while let Some((x, y)) = queue.pop_front() {
        let idx = (y * w + x) as usize;
        if mask[idx] != 0 {
            continue;
        }

        let px = rgba.get_pixel(x, y);
        let [r, g, b, a] = px.0;

        if a == 0 {
            mask[idx] = 1;
            if x > 0 { queue.push_back((x - 1, y)); }
            if x + 1 < w { queue.push_back((x + 1, y)); }
            if y > 0 { queue.push_back((x, y - 1)); }
            if y + 1 < h { queue.push_back((x, y + 1)); }
            continue;
        }

        let dist = color_dist(r, g, b, bg_r, bg_g, bg_b);

        if dist <= t_dist {
            mask[idx] = 1;
            if x > 0 { queue.push_back((x - 1, y)); }
            if x + 1 < w { queue.push_back((x + 1, y)); }
            if y > 0 { queue.push_back((x, y - 1)); }
            if y + 1 < h { queue.push_back((x, y + 1)); }
        } else if dist < outer {
            mask[idx] = 2;
        }
    }

    // 2단계: 마스크 기반으로 출력 이미지 생성
    let mut out = rgba.clone();
    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            let flag = mask[idx];

            if flag == 0 {
                continue;
            }

            if flag == 1 {
                out.put_pixel(x, y, image::Rgba([0, 0, 0, 0]));
            } else {
                let px = rgba.get_pixel(x, y);
                let [r, g, b, a] = px.0;
                let dist = color_dist(r, g, b, bg_r, bg_g, bg_b);

                let t = if f_dist > 0.0 { (dist - t_dist) / f_dist } else { 1.0 };
                let new_alpha = (t * a as f64).round().clamp(0.0, 255.0) as u8;

                if new_alpha == 0 {
                    out.put_pixel(x, y, image::Rgba([0, 0, 0, 0]));
                } else {
                    // 색상 디컨태미네이션: RGB에서 배경색 성분 제거
                    let af = new_alpha as f64 / 255.0;
                    let decontam = |c: u8, bg: u8| -> u8 {
                        let v = (c as f64 - bg as f64 * (1.0 - af)) / af;
                        v.round().clamp(0.0, 255.0) as u8
                    };
                    out.put_pixel(x, y, image::Rgba([
                        decontam(r, bg_r), decontam(g, bg_g), decontam(b, bg_b), new_alpha,
                    ]));
                }
            }
        }
    }
    out
}

// 배경 제거 미리보기
#[tauri::command]
pub async fn remove_white_bg_preview(input: String, threshold: u8, feather: u8, seeds: Vec<[u32; 2]>) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&input)?;

        // 미리보기용: 긴 변이 600px 초과 시 축소
        let (preview_img, scale) = {
            let max_side = img.width().max(img.height());
            if max_side > 600 {
                let s = 600.0 / max_side as f64;
                (img.resize(600, 600, image::imageops::FilterType::Lanczos3), s)
            } else {
                (img, 1.0)
            }
        };

        let scaled_seeds: Vec<[u32; 2]> = seeds.iter().map(|s| {
            [(s[0] as f64 * scale) as u32, (s[1] as f64 * scale) as u32]
        }).collect();

        let result = remove_bg(&preview_img, threshold, feather, &scaled_seeds, [255, 255, 255]);

        let mut buf = vec![];
        image::DynamicImage::ImageRgba8(result)
            .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;

        use base64::Engine;
        Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
    })
    .await
    .map_err(|e| AppError::Internal(format!("배경 제거 미리보기 실패: {}", e)))?
}

// 배경 제거 저장 (다중 파일)
#[tauri::command]
pub async fn remove_white_bg_save(inputs: Vec<String>, threshold: u8, feather: u8, seeds: Vec<[u32; 2]>, trim: bool) -> Result<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut outputs = Vec::new();
        for input in &inputs {
            let img = image::open(input)
                .map_err(|e| AppError::ImageProcessing(format!("이미지 열기 실패 ({}): {}", input, e)))?;
            let result = remove_bg(&img, threshold, feather, &seeds, [255, 255, 255]);

            let input_path = std::path::Path::new(input);
            let parent = input_path.parent().unwrap_or(std::path::Path::new("."));
            let stem = input_path.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
            let output_path = find_unique_path(parent, stem, "_nobg", ".png");

            // Trim: 투명 픽셀 여백 제거
            let final_img = if trim {
                let (w, h) = (result.width(), result.height());
                let mut min_x = w;
                let mut min_y = h;
                let mut max_x = 0u32;
                let mut max_y = 0u32;
                for y in 0..h {
                    for x in 0..w {
                        if result[(x, y)][3] > 0 {
                            min_x = min_x.min(x);
                            min_y = min_y.min(y);
                            max_x = max_x.max(x);
                            max_y = max_y.max(y);
                        }
                    }
                }
                if max_x >= min_x && max_y >= min_y {
                    let cropped = image::imageops::crop_imm(&result, min_x, min_y, max_x - min_x + 1, max_y - min_y + 1);
                    image::DynamicImage::ImageRgba8(cropped.to_image())
                } else {
                    image::DynamicImage::ImageRgba8(result)
                }
            } else {
                image::DynamicImage::ImageRgba8(result)
            };

            final_img.save_with_format(&output_path, image::ImageFormat::Png)?;

            outputs.push(
                output_path.to_str().map(|s| s.to_string())
                    .ok_or_else(|| AppError::Internal("출력 경로 변환 실패".to_string()))?
            );
        }
        Ok(outputs)
    })
    .await
    .map_err(|e| AppError::Internal(format!("배경 제거 저장 실패: {}", e)))?
}

// 스프라이트 시트 미리보기: 이미지 목록을 그리드로 배치하여 base64 PNG 반환
#[tauri::command]
pub async fn sprite_sheet_preview(
    images: Vec<String>,
    cell_width: u32,
    cell_height: u32,
    cols: u32,
    rows: u32,
) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        use image::imageops;

        let canvas = create_sprite_canvas(&images, cell_width, cell_height, cols, rows)?;
        let (canvas_w, canvas_h) = (cols * cell_width, rows * cell_height);

        // 미리보기용: 긴 변 > 800px이면 축소
        let (w, h) = (canvas_w, canvas_h);
        let preview = if w > 800 || h > 800 {
            let scale = 800.0 / w.max(h) as f64;
            let nw = (w as f64 * scale) as u32;
            let nh = (h as f64 * scale) as u32;
            image::imageops::resize(&canvas, nw, nh, imageops::FilterType::Lanczos3)
        } else {
            canvas
        };

        let mut buf = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(preview)
            .write_to(&mut buf, image::ImageFormat::Png)?;

        use base64::Engine;
        Ok(base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
    })
    .await
    .map_err(|e| AppError::Internal(format!("스프라이트 시트 미리보기 실패: {}", e)))?
}

// 스프라이트 시트 저장: 원본 크기로 배치 후 PNG 파일로 저장
#[tauri::command]
pub async fn save_sprite_sheet(
    images: Vec<String>,
    cell_width: u32,
    cell_height: u32,
    cols: u32,
    rows: u32,
    output: String,
) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let canvas = create_sprite_canvas(&images, cell_width, cell_height, cols, rows)?;

        // 출력 경로 결정: 중복 시 _sheet_2.png, _sheet_3.png ... 순서
        let output_path = std::path::Path::new(&output);
        let parent = output_path.parent().unwrap_or(std::path::Path::new("."));
        let stem = output_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("sprite");

        let final_path = find_unique_path(parent, stem, "_sheet", ".png");

        canvas.save_with_format(&final_path, image::ImageFormat::Png)?;

        final_path
            .to_str()
            .map(|s| s.to_string())
            .ok_or_else(|| AppError::Internal("출력 경로 변환 실패".to_string()))
    })
    .await
    .map_err(|e| AppError::Internal(format!("스프라이트 시트 저장 실패: {}", e)))?
}

// 스프라이트 시트 분해: 이미지를 행×열로 분할하여 개별 PNG 파일 저장
#[tauri::command]
pub async fn split_sprite_sheet(
    input: String,
    cols: u32,
    rows: u32,
    output_dir: String,
    base_name: String,
) -> Result<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&input)?;
        let (width, height) = (img.width(), img.height());
        let cell_w = width / cols;
        let cell_h = height / rows;

        let mut saved_paths = Vec::new();
        let out_dir = std::path::Path::new(&output_dir);

        for row in 0..rows {
            for col in 0..cols {
                let idx = row * cols + col + 1;
                let x = col * cell_w;
                let y = row * cell_h;
                let cropped = img.crop_imm(x, y, cell_w, cell_h);

                let file_name = format!("{}_{}.png", base_name, idx);
                let output_path = out_dir.join(&file_name);

                cropped
                    .save_with_format(&output_path, image::ImageFormat::Png)
                    .map_err(|e| AppError::ImageProcessing(format!("파일 저장 실패 ({}): {}", file_name, e)))?;

                saved_paths.push(
                    output_path
                        .to_str()
                        .map(|s| s.to_string())
                        .ok_or_else(|| AppError::Internal("경로 변환 실패".to_string()))?,
                );
            }
        }

        Ok(saved_paths)
    })
    .await
    .map_err(|e| AppError::Internal(format!("스프라이트 시트 분해 실패: {}", e)))?
}

/// PNG → ICO 변환 (16, 32, 48, 256px 멀티 사이즈)
#[tauri::command]
pub async fn convert_to_ico(path: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&path)?;
        let sizes = [16u32, 32, 48, 256];
        let out_path = {
            let p = std::path::Path::new(&path);
            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("icon");
            p.with_file_name(format!("{}.ico", stem))
        };
        let file = std::fs::File::create(&out_path)?;
        let mut icon_dir = ico::IconDir::new(ico::ResourceType::Icon);
        for &sz in &sizes {
            let resized = img.resize_exact(sz, sz, image::imageops::FilterType::Lanczos3);
            let rgba = resized.to_rgba8();
            let icon_image = ico::IconImage::from_rgba_data(sz, sz, rgba.into_raw());
            icon_dir.add_entry(ico::IconDirEntry::encode(&icon_image)
                .map_err(|e| AppError::ImageProcessing(format!("ICO 인코딩 실패: {}", e)))?);
        }
        icon_dir.write(file)
            .map_err(|e| AppError::ImageProcessing(format!("ICO 저장 실패: {}", e)))?;
        Ok(out_path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| AppError::Internal(format!("ICO 변환 실패: {}", e)))?
}

/// PNG → ICNS 변환 (간단한 ICNS 포맷 — 256px ic08, 512px ic09)
#[tauri::command]
pub async fn convert_to_icns(path: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&path)?;
        let out_path = {
            let p = std::path::Path::new(&path);
            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("icon");
            p.with_file_name(format!("{}.icns", stem))
        };
        let file = std::fs::File::create(&out_path)?;
        let mut icon_family = icns::IconFamily::new();
        // 256x256 (ic08)
        let resized_256 = img.resize_exact(256, 256, image::imageops::FilterType::Lanczos3);
        let rgba_256 = resized_256.to_rgba8();
        let icns_img_256 = icns::Image::from_data(icns::PixelFormat::RGBA, 256, 256, rgba_256.into_raw())
            .map_err(|e| AppError::ImageProcessing(format!("ICNS 이미지 생성 실패: {}", e)))?;
        icon_family.add_icon_with_type(&icns_img_256, icns::IconType::RGBA32_256x256)
            .map_err(|e| AppError::ImageProcessing(format!("ICNS 아이콘 추가 실패: {}", e)))?;
        // 512x512
        let resized_512 = img.resize_exact(512, 512, image::imageops::FilterType::Lanczos3);
        let rgba_512 = resized_512.to_rgba8();
        let icns_img_512 = icns::Image::from_data(icns::PixelFormat::RGBA, 512, 512, rgba_512.into_raw())
            .map_err(|e| AppError::ImageProcessing(format!("ICNS 이미지 생성 실패: {}", e)))?;
        icon_family.add_icon_with_type(&icns_img_512, icns::IconType::RGBA32_512x512)
            .map_err(|e| AppError::ImageProcessing(format!("ICNS 아이콘 추가 실패: {}", e)))?;
        icon_family.write(file)
            .map_err(|e| AppError::ImageProcessing(format!("ICNS 저장 실패: {}", e)))?;
        Ok(out_path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| AppError::Internal(format!("ICNS 변환 실패: {}", e)))?
}

// --- 동시성 제한 (이미지 처리 메모리 폭주 방지) ---
use std::sync::{OnceLock, Mutex, Condvar};

fn heavy_op_guard() -> &'static (Mutex<usize>, Condvar) {
    static GUARD: OnceLock<(Mutex<usize>, Condvar)> = OnceLock::new();
    GUARD.get_or_init(|| (Mutex::new(0), Condvar::new()))
}

/// RAII 가드: 생성 시 슬롯 획득, 드롭 시 슬롯 반환
struct HeavyOpPermit;

impl HeavyOpPermit {
    fn acquire() -> Self {
        let (lock, cvar) = heavy_op_guard();
        let mut count = lock.lock().unwrap();
        while *count >= MAX_HEAVY_OPS {
            count = cvar.wait(count).unwrap();
        }
        *count += 1;
        HeavyOpPermit
    }
}

impl Drop for HeavyOpPermit {
    fn drop(&mut self) {
        let (lock, cvar) = heavy_op_guard();
        let mut count = lock.lock().unwrap();
        *count -= 1;
        cvar.notify_one();
    }
}
