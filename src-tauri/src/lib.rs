mod helpers;
use helpers::*;

// 파일 타입 enum (프론트엔드 FileType 유니온과 1:1 매핑)
#[derive(serde::Serialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
enum FileType {
    Image,
    Video,
    Document,
    Code,
    Archive,
    Directory,
    Other,
}

// 파일 항목 구조체 (파일 탐색기용)
#[derive(serde::Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    modified: u64,      // epoch ms
    file_type: FileType,
}

// 파일 타입 분류 헬퍼
fn classify_file(name: &str) -> FileType {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "ico" => FileType::Image,
        "mp4" | "mov" | "avi" | "mkv" | "webm" => FileType::Video,
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md"
        | "gslides" | "gdoc" | "gsheet" => FileType::Document,
        "rs" | "js" | "ts" | "tsx" | "jsx" | "py" | "go" | "java" | "c" | "cpp" | "h"
        | "css" | "html" | "json" | "toml" | "yaml" | "yml" => FileType::Code,
        "zip" | "tar" | "gz" | "7z" | "rar" | "dmg" | "pkg" | "unitypackage" => FileType::Archive,
        _ => FileType::Other,
    }
}

// 디렉토리 목록 조회
#[tauri::command]
async fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    // spawn_blocking: 네트워크 파일시스템(Google Drive 등) I/O가 tokio 워커를 차단하지 않도록 분리
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<FileEntry>, String> {
        let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
        let mut result = vec![];
        for entry in entries.flatten() {
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            // Windows: 숨김(HIDDEN) 또는 시스템(SYSTEM) 속성 파일 제외
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::fs::MetadataExt;
                // FILE_ATTRIBUTE_HIDDEN(0x2) | FILE_ATTRIBUTE_SYSTEM(0x4)
                if meta.file_attributes() & 0x6 != 0 {
                    continue;
                }
            }

            let name = entry.file_name().to_string_lossy().to_string();
            // 숨김 파일 제외 (점으로 시작하는 파일)
            if name.starts_with('.') {
                continue;
            }
            // Windows 시스템 파일 이름으로 필터링 (대소문자 무관)
            let name_lower = name.to_lowercase();
            if name_lower == "desktop.ini" || name_lower == "thumbs.db" || name_lower == "ntuser.dat" {
                continue;
            }

            let file_type = if meta.is_dir() {
                FileType::Directory
            } else {
                classify_file(&name)
            };
            result.push(FileEntry {
                path: entry.path().to_string_lossy().to_string(),
                is_dir: meta.is_dir(),
                size: if meta.is_dir() { 0 } else { meta.len() },
                modified,
                file_type,
                name,
            });
        }
        Ok(result)
    })
    .await
    .map_err(|e| format!("디렉토리 읽기 태스크 실패: {}", e))?
}

// 이미지 규격 조회 (헤더만 읽어 빠르게 반환)
// spawn_blocking: 네트워크 파일시스템에서 tokio 워커 차단 방지
#[tauri::command]
async fn get_image_dimensions(path: String) -> Result<Option<(u32, u32)>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Option<(u32, u32)>, String> {
        use std::io::Read;

        let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
        let supported = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "psd", "psb"];
        if !supported.contains(&ext.as_str()) {
            return Ok(None);
        }
        if ext == "psd" || ext == "psb" {
            // PSD 헤더에서 규격만 읽음 (26바이트만 필요, 전체 파일 로드 방지)
            let mut buf = [0u8; 26];
            let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
            if f.read_exact(&mut buf).is_err() {
                return Ok(None);
            }
            let h = u32::from_be_bytes([buf[14], buf[15], buf[16], buf[17]]);
            let w = u32::from_be_bytes([buf[18], buf[19], buf[20], buf[21]]);
            return Ok(Some((w, h)));
        }
        match image::image_dimensions(&path) {
            Ok((w, h)) => Ok(Some((w, h))),
            Err(_) => Ok(None),
        }
    })
    .await
    .map_err(|e| format!("이미지 규격 조회 실패: {}", e))?
}

/// 디스크 캐시 기반 썸네일 생성 공통 헬퍼
/// 캐시 키(경로+수정시각+크기)로 히트 확인 후, 미스 시 `generate` 클로저로 PNG 바이트 생성
fn cached_thumbnail<F>(
    cache_dir: &std::path::Path,
    path: &str,
    size: u32,
    use_heavy_op: bool,
    generate: F,
) -> Result<Option<String>, String>
where
    F: FnOnce() -> Result<Option<Vec<u8>>, String>,
{
    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;
    use base64::Engine;

    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = meta.modified().ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    modified.hash(&mut hasher);
    size.hash(&mut hasher);
    let cache_key = format!("{:x}", hasher.finish());

    std::fs::create_dir_all(cache_dir).ok();
    let cache_file = cache_dir.join(format!("{}.png", cache_key));

    // 캐시 히트
    if cache_file.exists() {
        let cached = std::fs::read(&cache_file).map_err(|e| e.to_string())?;
        return Ok(Some(base64::engine::general_purpose::STANDARD.encode(&cached)));
    }

    // 선택적 동시성 제한 + 패닉 방지
    let _permit = if use_heavy_op { Some(HeavyOpPermit::acquire()) } else { None };

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(generate));
    match result {
        Ok(Ok(Some(bytes))) => {
            std::fs::write(&cache_file, &bytes).ok();
            Ok(Some(base64::engine::general_purpose::STANDARD.encode(&bytes)))
        }
        Ok(Ok(None)) => Ok(None),
        Ok(Err(e)) => Err(e),
        Err(_) => Ok(None),
    }
}

// 이미지 썸네일 생성 (디스크 캐시 + base64 PNG 반환)
// spawn_blocking: 네트워크 파일시스템에서 tokio 워커 차단 방지
#[tauri::command]
async fn get_file_thumbnail(app: tauri::AppHandle, path: String, size: u32) -> Result<Option<String>, String> {
    use tauri::Manager;

    let cache_dir = app.path().app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("img_thumbnails");

    tauri::async_runtime::spawn_blocking(move || {
        let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
        let supported = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
        if !supported.contains(&ext.as_str()) {
            return Ok(None);
        }

        cached_thumbnail(&cache_dir, &path, size, true, || {
            let img = image::open(&path).map_err(|e| e.to_string())?;
            let thumb = img.thumbnail(size, size);
            let mut buf = vec![];
            thumb.write_to(
                &mut std::io::Cursor::new(&mut buf),
                image::ImageFormat::Png,
            ).map_err(|e| e.to_string())?;
            Ok(Some(buf))
        })
    })
    .await
    .map_err(|e| format!("썸네일 생성 실패: {}", e))?
}

// PSD 썸네일 생성 (디스크 캐시 + base64 PNG 반환)
// spawn_blocking: 네트워크 파일시스템에서 tokio 워커 차단 방지
#[tauri::command]
async fn get_psd_thumbnail(app: tauri::AppHandle, path: String, size: u32) -> Result<Option<String>, String> {
    use tauri::Manager;

    let cache_dir = app.path().app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("psd_thumbnails");

    tauri::async_runtime::spawn_blocking(move || {
        cached_thumbnail(&cache_dir, &path, size, true, || {
            let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
            let psd = psd::Psd::from_bytes(&bytes).map_err(|e| format!("PSD 파싱 실패: {}", e))?;

            let rgba_pixels = psd.rgba();
            let width = psd.width();
            let height = psd.height();

            let img = image::RgbaImage::from_raw(width, height, rgba_pixels)
                .ok_or_else(|| "PSD 픽셀 변환 실패".to_string())?;
            let dynamic = image::DynamicImage::ImageRgba8(img);
            // size == 0: 원본 해상도 유지 (미리보기용), size > 0: 썸네일 생성 (그리드용)
            let output = if size == 0 || (width <= size && height <= size) {
                dynamic
            } else {
                dynamic.thumbnail(size, size)
            };

            let mut buf = vec![];
            output.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
                .map_err(|e| e.to_string())?;
            Ok(Some(buf))
        })
    })
    .await
    .map_err(|e| format!("PSD 썸네일 생성 실패: {}", e))?
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
async fn pixelate_preview(input: String, pixel_size: u32, scale: u32, max_colors: u32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 원본 이미지 열기
        let img = image::open(&input).map_err(|e| format!("이미지 열기 실패: {}", e))?;

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
            .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .map_err(|e| format!("PNG 인코딩 실패: {}", e))?;

        use base64::Engine;
        Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
    })
    .await
    .map_err(|e| format!("픽셀레이트 미리보기 실패: {}", e))?
}

// 픽셀레이트 저장: 원본 해상도로 픽셀화 후 {stem}_pixel.png 파일로 저장, 경로 반환
#[tauri::command]
async fn pixelate_image(input: String, pixel_size: u32, scale: u32, max_colors: u32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 원본 해상도로 이미지 열기
        let img = image::open(&input).map_err(|e| format!("이미지 열기 실패: {}", e))?;

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
        pixelated
            .save_with_format(&output_path, image::ImageFormat::Png)
            .map_err(|e| format!("파일 저장 실패: {}", e))?;

        output_path
            .to_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "출력 경로 변환 실패".to_string())
    })
    .await
    .map_err(|e| format!("픽셀레이트 이미지 저장 실패: {}", e))?
}

// 스프라이트 시트 미리보기: 이미지 목록을 그리드로 배치하여 base64 PNG 반환
#[tauri::command]
async fn sprite_sheet_preview(
    images: Vec<String>,
    cell_width: u32,
    cell_height: u32,
    cols: u32,
    rows: u32,
) -> Result<String, String> {
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
            .write_to(&mut buf, image::ImageFormat::Png)
            .map_err(|e| format!("PNG 인코딩 실패: {}", e))?;

        use base64::Engine;
        Ok(base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
    })
    .await
    .map_err(|e| format!("스프라이트 시트 미리보기 실패: {}", e))?
}

// 스프라이트 시트 저장: 원본 크기로 배치 후 PNG 파일로 저장
#[tauri::command]
async fn save_sprite_sheet(
    images: Vec<String>,
    cell_width: u32,
    cell_height: u32,
    cols: u32,
    rows: u32,
    output: String,
) -> Result<String, String> {
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

        canvas
            .save_with_format(&final_path, image::ImageFormat::Png)
            .map_err(|e| format!("파일 저장 실패: {}", e))?;

        final_path
            .to_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "출력 경로 변환 실패".to_string())
    })
    .await
    .map_err(|e| format!("스프라이트 시트 저장 실패: {}", e))?
}

// 스프라이트 시트 분해: 이미지를 행×열로 분할하여 개별 PNG 파일 저장
#[tauri::command]
async fn split_sprite_sheet(
    input: String,
    cols: u32,
    rows: u32,
    output_dir: String,
    base_name: String,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&input).map_err(|e| format!("이미지 열기 실패: {}", e))?;
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
                    .map_err(|e| format!("파일 저장 실패 ({}): {}", file_name, e))?;

                saved_paths.push(
                    output_path
                        .to_str()
                        .map(|s| s.to_string())
                        .ok_or_else(|| "경로 변환 실패".to_string())?,
                );
            }
        }

        Ok(saved_paths)
    })
    .await
    .map_err(|e| format!("스프라이트 시트 분해 실패: {}", e))?
}

// 대상 디렉토리에서 중복되는 파일명 확인
#[tauri::command]
async fn check_duplicate_items(sources: Vec<String>, dest: String) -> Result<Vec<String>, String> {
    let mut duplicates = Vec::new();
    for source in &sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| format!("잘못된 경로: {}", source))?;
        let dest_path = std::path::Path::new(&dest).join(file_name);
        // 같은 파일이 아닌 다른 파일이 이미 존재하는 경우만 중복으로 판단
        if dest_path.exists() && dest_path.canonicalize().ok() != src_path.canonicalize().ok() {
            duplicates.push(file_name.to_string_lossy().to_string());
        }
    }
    Ok(duplicates)
}

// 파일/폴더 복사 (재귀 지원, overwrite=true면 기존 파일 덮어쓰기)
#[tauri::command]
async fn copy_items(sources: Vec<String>, dest: String, overwrite: Option<bool>) -> Result<(), String> {
    let overwrite = overwrite.unwrap_or(false);
    for source in &sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| format!("잘못된 경로: {}", source))?;
        let mut dest_path = std::path::Path::new(&dest).join(file_name);

        // 같은 경로 충돌 시 "(복사)", "(복사 2)" 접미사 추가
        if dest_path.exists() && dest_path.canonicalize().ok() == src_path.canonicalize().ok() {
            let stem = src_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let ext = src_path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
            let is_dir = src_path.is_dir();
            dest_path = get_copy_destination(std::path::Path::new(&dest), &stem, &ext, is_dir);
        } else if dest_path.exists() && overwrite {
            // 덮어쓰기: 기존 파일/폴더 삭제 후 복사
            if dest_path.is_dir() {
                std::fs::remove_dir_all(&dest_path)
                    .map_err(|e| format!("기존 폴더 삭제 실패: {}", e))?;
            } else {
                std::fs::remove_file(&dest_path)
                    .map_err(|e| format!("기존 파일 삭제 실패: {}", e))?;
            }
        } else if dest_path.exists() {
            // 덮어쓰기 안 함: 스킵
            continue;
        }

        if src_path.is_dir() {
            copy_dir_recursive(src_path, &dest_path)?;
        } else {
            std::fs::copy(src_path, &dest_path)
                .map_err(|e| format!("복사 실패 {}: {}", source, e))?;
        }
    }
    Ok(())
}

// 재귀 디렉토리 복사 헬퍼
fn copy_dir_recursive(src: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| format!("디렉토리 생성 실패: {}", e))?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let dest_child = dest.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_recursive(&entry.path(), &dest_child)?;
        } else {
            std::fs::copy(entry.path(), &dest_child)
                .map_err(|e| format!("복사 실패: {}", e))?;
        }
    }
    Ok(())
}

// 파일/폴더 복제 (같은 디렉토리에 " (복사)" 접미사)
#[tauri::command]
async fn duplicate_items(paths: Vec<String>) -> Result<Vec<String>, String> {
    let mut new_paths = vec![];
    for source in &paths {
        let src = std::path::Path::new(source);
        let parent = src.parent().ok_or_else(|| format!("상위 디렉토리 없음: {}", source))?;
        let stem = src.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let ext = src.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
        let is_dir = src.is_dir();

        // 충돌 방지: " (복사)", " (복사 2)", " (복사 3)" ...
        let dest_path = get_copy_destination(parent, &stem, &ext, is_dir);

        if is_dir {
            copy_dir_recursive(src, &dest_path)?;
        } else {
            std::fs::copy(src, &dest_path)
                .map_err(|e| format!("복제 실패 {}: {}", source, e))?;
        }
        new_paths.push(dest_path.to_string_lossy().to_string());
    }
    Ok(new_paths)
}

// 파일/폴더 이동 (overwrite=true면 기존 파일 덮어쓰기)
#[tauri::command]
async fn move_items(sources: Vec<String>, dest: String, overwrite: Option<bool>) -> Result<(), String> {
    let overwrite = overwrite.unwrap_or(false);
    for source in &sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| format!("잘못된 경로: {}", source))?;
        let dest_path = std::path::Path::new(&dest).join(file_name);

        // 대상에 같은 이름 파일이 있으면 덮어쓰기 처리
        if dest_path.exists() && dest_path.canonicalize().ok() != src_path.canonicalize().ok() {
            if overwrite {
                if dest_path.is_dir() {
                    std::fs::remove_dir_all(&dest_path)
                        .map_err(|e| format!("기존 폴더 삭제 실패: {}", e))?;
                } else {
                    std::fs::remove_file(&dest_path)
                        .map_err(|e| format!("기존 파일 삭제 실패: {}", e))?;
                }
            } else {
                continue; // 덮어쓰기 안 함: 스킵
            }
        }

        // 같은 볼륨이면 rename, 다른 볼륨이면 복사 후 삭제
        if std::fs::rename(src_path, &dest_path).is_err() {
            if src_path.is_dir() {
                copy_dir_recursive(src_path, &dest_path)?;
                std::fs::remove_dir_all(src_path)
                    .map_err(|e| format!("원본 삭제 실패: {}", e))?;
            } else {
                std::fs::copy(src_path, &dest_path)
                    .map_err(|e| format!("이동 실패 {}: {}", source, e))?;
                std::fs::remove_file(src_path)
                    .map_err(|e| format!("원본 삭제 실패: {}", e))?;
            }
        }
    }
    Ok(())
}

/// 클라우드 스토리지 경로 판별 (Google Drive, OneDrive, Dropbox 등)
/// macOS에서 trash::delete 시 시스템 권한 팝업을 방지하기 위해 사용
fn is_cloud_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.contains("/library/cloudstorage/")
        || lower.contains("/library/mobile documents/")
        || lower.contains("/google drive/")
        || lower.contains("/onedrive/")
        || lower.contains("/dropbox/")
}

/// 경로에 따라 직접 삭제 수행 (디렉토리/파일 구분)
fn remove_directly(p: &std::path::Path, path: &str) -> Result<(), String> {
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| format!("삭제 실패 {}: {}", path, e))
    } else {
        std::fs::remove_file(p).map_err(|e| format!("삭제 실패 {}: {}", path, e))
    }
}

// 파일/폴더 삭제 (use_trash=true면 휴지통, 클라우드 경로는 직접 삭제)
// spawn_blocking: 네트워크 파일시스템에서 tokio 워커 차단 방지
// macOS: NsFileManager 사용 (Finder AppleScript 대비 빠르고 권한 문제 없음)
#[tauri::command]
async fn delete_items(paths: Vec<String>, use_trash: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let mut ctx = trash::TrashContext::new();
        #[cfg(target_os = "macos")]
        {
            use trash::macos::{DeleteMethod, TrashContextExtMacos};
            ctx.set_delete_method(DeleteMethod::NsFileManager);
        }
        for path in &paths {
            let p = std::path::Path::new(path.as_str());
            if use_trash && !is_cloud_path(path) {
                ctx.delete(p).map_err(|e| format!("휴지통 이동 실패 {}: {}", path, e))?;
            } else {
                remove_directly(p, path)?;
            }
        }
        Ok(())
    }).await.map_err(|e| format!("삭제 작업 실패: {}", e))?
}

// 휴지통에서 파일 복원 (원래 경로로)
#[tauri::command]
async fn restore_trash_items(original_paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        for orig_path in &original_paths {
            restore_single_item(orig_path)?;
        }
        Ok(())
    }).await.map_err(|e| format!("복원 작업 실패: {}", e))?
}

#[cfg(target_os = "macos")]
fn restore_single_item(orig_path: &str) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|_| "HOME 환경변수 없음".to_string())?;
    let trash_dir = std::path::Path::new(&home).join(".Trash");
    let orig = std::path::Path::new(orig_path);
    let name = orig.file_name()
        .ok_or_else(|| format!("잘못된 경로: {}", orig_path))?
        .to_string_lossy();

    // 정확한 이름 일치 먼저 시도
    let exact = trash_dir.join(&*name);
    if exact.exists() {
        return std::fs::rename(&exact, orig)
            .map_err(|e| format!("복원 실패 {}: {}", orig_path, e));
    }

    // 충돌로 인해 이름이 변경되었을 수 있음 — 타임스탬프 패턴으로 검색
    // macOS는 "file 12.34.56 PM.ext" 형식으로 이름 변경
    let stem = orig.file_stem().unwrap_or_default().to_string_lossy();
    let ext = orig.extension().map(|e| e.to_string_lossy().to_string());
    let mut candidates: Vec<_> = std::fs::read_dir(&trash_dir)
        .map_err(|e| format!("휴지통 읽기 실패: {}", e))?
        .flatten()
        .filter(|entry| {
            let ename = entry.file_name().to_string_lossy().to_string();
            ename.starts_with(&*stem)
                && ext.as_ref().map_or(true, |e| ename.ends_with(&format!(".{}", e)))
        })
        .collect();

    // 가장 최근 수정된 항목 선택
    candidates.sort_by(|a, b| {
        let ma = a.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
        let mb = b.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
        mb.cmp(&ma)
    });

    if let Some(found) = candidates.first() {
        std::fs::rename(found.path(), orig)
            .map_err(|e| format!("복원 실패 {}: {}", orig_path, e))
    } else {
        Err(format!("휴지통에서 파일을 찾을 수 없습니다: {}", orig_path))
    }
}

#[cfg(target_os = "windows")]
fn restore_single_item(orig_path: &str) -> Result<(), String> {
    let items = trash::os_limited::list()
        .map_err(|e| format!("휴지통 조회 실패: {}", e))?;
    let orig = std::path::Path::new(orig_path);
    let target_name = orig.file_name().unwrap_or_default();
    let target_parent = orig.parent().unwrap_or(std::path::Path::new(""));

    // 원래 경로와 일치하는 항목 찾기 (가장 최근 것)
    let mut matching: Vec<_> = items.into_iter()
        .filter(|item| item.original_parent == target_parent && item.name == target_name)
        .collect();
    matching.sort_by(|a, b| b.time_deleted.cmp(&a.time_deleted));

    if let Some(item) = matching.into_iter().next() {
        trash::os_limited::restore_all(std::iter::once(item))
            .map_err(|e| format!("복원 실패 {}: {}", orig_path, e))
    } else {
        Err(format!("휴지통에서 파일을 찾을 수 없습니다: {}", orig_path))
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn restore_single_item(orig_path: &str) -> Result<(), String> {
    Err(format!("이 플랫폼에서는 휴지통 복원이 지원되지 않습니다: {}", orig_path))
}

// 새 폴더 생성
#[tauri::command]
async fn create_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("폴더 생성 실패: {}", e))
}

// 빈 텍스트 파일 생성
#[tauri::command]
async fn create_text_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.exists() {
        return Err("이미 존재하는 파일입니다".to_string());
    }
    std::fs::write(&path, "").map_err(|e| format!("파일 생성 실패: {}", e))
}

// 텍스트 파일에 내용 쓰기
#[tauri::command]
async fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("파일 저장 실패: {}", e))
}

// 경로가 디렉토리인지 확인
#[tauri::command]
fn is_directory(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

// 글로벌 파일 검색 (하위 폴더 재귀 탐색)
// macOS: Spotlight 인덱스(mdfind) 활용으로 즉시 검색, 실패 시 walkdir 폴백
// Windows: Windows Search Index(ADODB) 활용, 실패 시 walkdir 폴백
#[tauri::command]
async fn search_files(root: String, query: String, max_results: usize) -> Result<Vec<FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<FileEntry>, String> {
        // macOS: mdfind (Spotlight 인덱스) 먼저 시도
        #[cfg(target_os = "macos")]
        {
            if let Ok(entries) = search_with_mdfind(&root, &query, max_results) {
                return Ok(entries);
            }
        }

        // Windows: Windows Search Index (ADODB) 먼저 시도
        #[cfg(target_os = "windows")]
        {
            if let Ok(entries) = search_with_windows_index(&root, &query, max_results) {
                if !entries.is_empty() {
                    return Ok(entries);
                }
            }
        }

        // 폴백: walkdir 기반 직접 탐색
        search_with_walkdir(&root, &query, max_results)
    })
    .await
    .map_err(|e| format!("파일 검색 태스크 실패: {}", e))?
}

// macOS Spotlight 인덱스(mdfind) 기반 즉시 검색
#[cfg(target_os = "macos")]
fn search_with_mdfind(root: &str, query: &str, max_results: usize) -> Result<Vec<FileEntry>, String> {
    use std::process::Command;

    let output = Command::new("mdfind")
        .args(["-onlyin", root, "-name", query])
        .output()
        .map_err(|e| format!("mdfind 실행 실패: {}", e))?;

    if !output.status.success() {
        return Err("mdfind 실행 실패".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut result = vec![];

    for line in stdout.lines() {
        if line.is_empty() { continue; }
        let path = std::path::Path::new(line);

        // 숨김 파일 제외 (경로의 어느 컴포넌트든 .으로 시작하면 제외)
        let has_hidden = path.components().any(|c| {
            c.as_os_str().to_string_lossy().starts_with('.')
        });
        if has_hidden { continue; }

        let meta = match std::fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let modified = meta.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let is_dir = meta.is_dir();
        let file_type = if is_dir { FileType::Directory } else { classify_file(&name) };

        result.push(FileEntry {
            path: line.to_string(),
            is_dir,
            size: if is_dir { 0 } else { meta.len() },
            modified,
            file_type,
            name,
        });

        if result.len() >= max_results { break; }
    }

    Ok(result)
}

// Windows Search Index (ADODB COM) 기반 즉시 검색
// Windows는 기본적으로 사용자 폴더를 인덱싱하므로 Spotlight과 유사한 속도
#[cfg(target_os = "windows")]
fn search_with_windows_index(root: &str, query: &str, max_results: usize) -> Result<Vec<FileEntry>, String> {
    use std::process::Command;

    // SQL 인젝션 방지: 작은따옴표 이스케이프
    let safe_query = query.replace('\'', "''");
    // Windows Search scope는 file:/// URL 형식 사용
    let scope_path = root.replace('\\', "/");
    let scope = if scope_path.starts_with("//") {
        format!("file:{}", scope_path)
    } else {
        format!("file:///{}", scope_path)
    };

    // PowerShell로 Windows Search Index 쿼리 (ADODB COM)
    let ps_script = format!(
        concat!(
            "$ErrorActionPreference='SilentlyContinue';",
            "$c=New-Object -Com ADODB.Connection;",
            "$c.Open('Provider=Search.CollatorDSO;Extended Properties=''Application=Windows'';');",
            "$r=$c.Execute(\"SELECT TOP {} System.ItemPathDisplay FROM SystemIndex ",
            "WHERE SCOPE='{}' AND System.FileName LIKE '%{}%'\");",
            "while(-not $r.EOF){{$r.Fields.Item('System.ItemPathDisplay').Value;$r.MoveNext()}};",
            "if($r){{$r.Close()}};$c.Close()"
        ),
        max_results, scope, safe_query
    );

    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NoLogo", "-Command", &ps_script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    if !output.status.success() {
        return Err("Windows Search Index 쿼리 실패".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut result = vec![];

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }

        let path = std::path::Path::new(line);
        let name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        // 숨김 파일 제외
        if name.starts_with('.') { continue; }

        let meta = match std::fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        // Windows 시스템/숨김 파일 제외
        {
            use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x6 != 0 { continue; }
        }

        let modified = meta.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let is_dir = meta.is_dir();
        let file_type = if is_dir { FileType::Directory } else { classify_file(&name) };

        result.push(FileEntry {
            path: line.to_string(),
            is_dir,
            size: if is_dir { 0 } else { meta.len() },
            modified,
            file_type,
            name,
        });

        if result.len() >= max_results { break; }
    }

    Ok(result)
}

// walkdir 기반 직접 재귀 탐색 (인덱스 검색 폴백)
fn search_with_walkdir(root: &str, query: &str, max_results: usize) -> Result<Vec<FileEntry>, String> {
    use walkdir::WalkDir;

    let query_lower = query.to_lowercase();
    let mut result = vec![];

    let walker = WalkDir::new(root)
        .max_depth(10)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy();
            // 숨김 파일/디렉토리 전체 서브트리 제외
            if name.starts_with('.') {
                return false;
            }
            // Windows 시스템 파일 제외
            #[cfg(target_os = "windows")]
            {
                if let Ok(meta) = entry.metadata() {
                    use std::os::windows::fs::MetadataExt;
                    if meta.file_attributes() & 0x6 != 0 {
                        return false;
                    }
                }
            }
            true
        });

    for entry in walker.flatten() {
        if entry.depth() == 0 { continue; }

        let name = entry.file_name().to_string_lossy().to_string();
        if !name.to_lowercase().contains(&query_lower) { continue; }

        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let modified = meta.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let is_dir = meta.is_dir();
        let file_type = if is_dir { FileType::Directory } else { classify_file(&name) };

        result.push(FileEntry {
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
            size: if is_dir { 0 } else { meta.len() },
            modified,
            file_type,
            name,
        });

        if result.len() >= max_results { break; }
    }

    Ok(result)
}

// 이름 바꾸기 (대상 경로에 동일 이름 파일 존재 시 에러)
#[tauri::command]
async fn rename_item(old_path: String, new_path: String) -> Result<(), String> {
    if old_path == new_path { return Ok(()); }
    if std::path::Path::new(&new_path).exists() {
        return Err("동일한 이름의 파일이 존재합니다.".to_string());
    }
    std::fs::rename(&old_path, &new_path)
        .map_err(|e| format!("이름 변경 실패: {}", e))
}

// macOS Quick Look 실행 (qlmanage -p <path>)
#[tauri::command]
async fn quick_look(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("qlmanage")
            .args(["-p", &path])
            .spawn()
            .map_err(|e| format!("Quick Look 실행 실패: {}", e))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Quick Look은 macOS 전용 기능
        drop(path);
    }
    Ok(())
}

// 텍스트 파일 읽기 (미리보기용, 최대 바이트 제한)
#[tauri::command]
fn read_text_file(path: String, max_bytes: usize) -> Result<String, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    let read_size = (meta.len() as usize).min(max_bytes);
    let mut buf = vec![0u8; read_size];
    file.read_exact(&mut buf).map_err(|e| e.to_string())?;
    // UTF-8 유효하지 않은 바이트는 대체 문자로 변환
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

// --- 동시성 제한 (이미지 처리 메모리 폭주 방지) ---
use std::sync::{OnceLock, Mutex, Condvar};
use std::collections::HashMap;

/// 동시 이미지/썸네일 처리 최대 개수
/// PSD 썸네일을 제거하여 메모리 부담이 감소했으므로 8개로 완화
const MAX_HEAVY_OPS: usize = 3;

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

// --- OS 네이티브 파일 아이콘 (확장자별 캐시) ---

fn icon_cache() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[tauri::command]
fn get_file_icon(path: String, size: u32) -> Result<Option<String>, String> {
    use base64::Engine;

    let p = std::path::Path::new(&path);
    let cache_key = if p.is_dir() {
        format!("__folder___{}", size)
    } else {
        let ext = p.extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        format!("{}_{}", ext, size)
    };

    // 캐시 히트
    {
        let cache = icon_cache().lock().map_err(|e| e.to_string())?;
        if let Some(b64) = cache.get(&cache_key) {
            return Ok(Some(b64.clone()));
        }
    }

    // 플랫폼별 아이콘 추출 (패닉 방지)
    // 아이콘은 확장자별 캐시로 재사용되어 실질적으로 한 번만 호출 → 세마포어 불필요
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| get_native_icon_bytes(&path, size))) {
        Ok(Some(bytes)) => {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let mut cache = icon_cache().lock().map_err(|e| e.to_string())?;
            cache.insert(cache_key, b64.clone());
            Ok(Some(b64))
        }
        _ => Ok(None),
    }
}

#[cfg(target_os = "macos")]
fn get_native_icon_bytes(path: &str, size: u32) -> Option<Vec<u8>> {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::CString;

    #[repr(C)]
    struct NSSize { width: f64, height: f64 }

    unsafe {
        let ws_class = Class::get("NSWorkspace")?;
        let workspace: *mut Object = msg_send![ws_class, sharedWorkspace];
        if workspace.is_null() { return None; }

        let str_class = Class::get("NSString")?;
        let c_path = CString::new(path).ok()?;
        let ns_path: *mut Object = msg_send![str_class, stringWithUTF8String: c_path.as_ptr()];
        if ns_path.is_null() { return None; }

        // iconForFile: → NSImage
        let icon: *mut Object = msg_send![workspace, iconForFile: ns_path];
        if icon.is_null() { return None; }

        let target_size = NSSize { width: size as f64, height: size as f64 };
        let _: () = msg_send![icon, setSize: target_size];

        // TIFF → NSBitmapImageRep → PNG
        let tiff_data: *mut Object = msg_send![icon, TIFFRepresentation];
        if tiff_data.is_null() { return None; }

        let rep_class = Class::get("NSBitmapImageRep")?;
        let bitmap_rep: *mut Object = msg_send![rep_class, imageRepWithData: tiff_data];
        if bitmap_rep.is_null() { return None; }

        let png_type: usize = 4; // NSBitmapImageFileTypePNG
        let null_dict: *const std::ffi::c_void = std::ptr::null();
        let png_data: *mut Object = msg_send![bitmap_rep, representationUsingType: png_type properties: null_dict];
        if png_data.is_null() { return None; }

        let length: usize = msg_send![png_data, length];
        let bytes_ptr: *const u8 = msg_send![png_data, bytes];
        if bytes_ptr.is_null() || length == 0 { return None; }

        Some(std::slice::from_raw_parts(bytes_ptr, length).to_vec())
    }
}

#[cfg(target_os = "windows")]
fn get_native_icon_bytes(path: &str, size: u32) -> Option<Vec<u8>> {
    // GDI 패닉 방지: catch_unwind로 감싸서 앱 크래시 방지
    std::panic::catch_unwind(|| get_native_icon_bytes_inner(path, size)).ok().flatten()
}

#[cfg(target_os = "windows")]
fn get_native_icon_bytes_inner(path: &str, size: u32) -> Option<Vec<u8>> {
    use std::mem;
    use winapi::um::shellapi::{SHGetFileInfoW, SHFILEINFOW, SHGFI_SYSICONINDEX};
    use winapi::um::winuser::{GetIconInfo, DestroyIcon, ICONINFO, GetDC, ReleaseDC};
    use winapi::um::wingdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, SelectObject,
        BITMAPINFOHEADER, BITMAP, BI_RGB, DIB_RGB_COLORS,
    };
    use winapi::um::objbase::CoInitialize;
    use winapi::shared::windef::HICON;
    use winapi::shared::winerror::S_OK;

    // SHGetImageList 이미지 리스트 크기 상수
    const SHIL_LARGE: i32 = 0;      // 32x32
    const SHIL_JUMBO: i32 = 4;      // 256x256
    const SHIL_EXTRALARGE: i32 = 2;  // 48x48

    // IImageList::GetIcon 메서드 인덱스 (vtable offset)
    // IImageList는 IUnknown(3개) + Add, ReplaceIcon, ... GetIcon은 인덱스 9
    const ILD_TRANSPARENT: i32 = 1;

    #[link(name = "shell32")]
    extern "system" {
        fn SHGetImageList(iImageList: i32, riid: *const winapi::shared::guiddef::GUID, ppvObj: *mut *mut std::ffi::c_void) -> i32;
    }

    // IID_IImageList = {46EB5926-582E-4017-9FDF-E8998DAA0950}
    let iid_iimagelist = winapi::shared::guiddef::GUID {
        Data1: 0x46EB5926,
        Data2: 0x582E,
        Data3: 0x4017,
        Data4: [0x9F, 0xDF, 0xE8, 0x99, 0x8D, 0xAA, 0x09, 0x50],
    };

    unsafe {
        // COM 초기화 (이미 초기화된 경우 무시)
        CoInitialize(std::ptr::null_mut());

        // 1. 파일의 시스템 아이콘 인덱스 가져오기
        let wide_path: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        let mut shfi: SHFILEINFOW = mem::zeroed();

        let result = SHGetFileInfoW(
            wide_path.as_ptr(),
            0,
            &mut shfi,
            mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_SYSICONINDEX,
        );

        if result == 0 {
            return None;
        }

        let icon_index = shfi.iIcon;

        // 2. 요청 크기에 맞는 이미지 리스트 가져오기
        // 256x256 시도 → 48x48 폴백 → 32x32 폴백
        let list_sizes = if size >= 64 {
            vec![SHIL_JUMBO, SHIL_EXTRALARGE, SHIL_LARGE]
        } else if size >= 40 {
            vec![SHIL_EXTRALARGE, SHIL_LARGE]
        } else {
            vec![SHIL_LARGE]
        };

        let mut h_icon: HICON = std::ptr::null_mut();

        for &shil in &list_sizes {
            let mut image_list: *mut std::ffi::c_void = std::ptr::null_mut();
            let hr = SHGetImageList(shil, &iid_iimagelist, &mut image_list);
            if hr != S_OK || image_list.is_null() {
                continue;
            }

            // IImageList vtable에서 GetIcon 호출 (vtable 인덱스 10)
            // IUnknown(0-2) + Add(3), ReplaceIcon(4), SetOverlayImage(5),
            // Replace(6), AddMasked(7), Draw(8), Remove(9), GetIcon(10)
            let vtable = *(image_list as *const *const usize);
            let get_icon_fn: extern "system" fn(*mut std::ffi::c_void, i32, i32, *mut HICON) -> i32 =
                mem::transmute(*vtable.add(10));
            let mut icon: HICON = std::ptr::null_mut();
            let hr2 = get_icon_fn(image_list, icon_index, ILD_TRANSPARENT, &mut icon);

            // IImageList Release (vtable 인덱스 2)
            let release_fn: extern "system" fn(*mut std::ffi::c_void) -> u32 =
                mem::transmute(*vtable.add(2));
            release_fn(image_list);

            if hr2 == S_OK && !icon.is_null() {
                h_icon = icon;
                break;
            }
        }

        if h_icon.is_null() {
            return None;
        }

        // 3. HICON → 비트맵 픽셀 데이터 추출
        let mut icon_info: ICONINFO = mem::zeroed();
        if GetIconInfo(h_icon, &mut icon_info) == 0 {
            DestroyIcon(h_icon);
            return None;
        }

        let hbm_color = icon_info.hbmColor;
        if hbm_color.is_null() {
            if !icon_info.hbmMask.is_null() { DeleteObject(icon_info.hbmMask as _); }
            DestroyIcon(h_icon);
            return None;
        }

        let mut bmp: BITMAP = mem::zeroed();
        GetObjectW(
            hbm_color as _,
            mem::size_of::<BITMAP>() as i32,
            &mut bmp as *mut _ as *mut _,
        );

        let width = bmp.bmWidth as u32;
        let height = bmp.bmHeight as u32;

        if width == 0 || height == 0 {
            DeleteObject(icon_info.hbmColor as _);
            if !icon_info.hbmMask.is_null() { DeleteObject(icon_info.hbmMask as _); }
            DestroyIcon(h_icon);
            return None;
        }

        // 4. BITMAPINFOHEADER 준비 (top-down DIB)
        let bmi_size = mem::size_of::<BITMAPINFOHEADER>();
        let mut bmi_buf = vec![0u8; bmi_size + 4 * 256];
        let bmi = &mut *(bmi_buf.as_mut_ptr() as *mut winapi::um::wingdi::BITMAPINFO);
        bmi.bmiHeader.biSize = bmi_size as u32;
        bmi.bmiHeader.biWidth = width as i32;
        bmi.bmiHeader.biHeight = -(height as i32);
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB;

        // 5. 픽셀 데이터 추출
        let hdc_screen = GetDC(std::ptr::null_mut());
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let old_bmp = SelectObject(hdc_mem, hbm_color as _);

        let mut pixels: Vec<u8> = vec![0u8; (width * height * 4) as usize];

        GetDIBits(
            hdc_mem,
            hbm_color,
            0,
            height,
            pixels.as_mut_ptr() as *mut _,
            bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old_bmp);

        // 6. BGRA → RGBA 변환
        for chunk in pixels.chunks_exact_mut(4) {
            chunk.swap(0, 2);
        }

        // 7. 알파 채널이 모두 0인 경우 불투명으로 설정 (구형 아이콘 호환)
        let has_alpha = pixels.chunks_exact(4).any(|c| c[3] != 0);
        if !has_alpha {
            for chunk in pixels.chunks_exact_mut(4) {
                chunk[3] = 255;
            }
        }

        // 8. GDI 리소스 정리
        DeleteDC(hdc_mem);
        ReleaseDC(std::ptr::null_mut(), hdc_screen);
        DeleteObject(icon_info.hbmColor as _);
        if !icon_info.hbmMask.is_null() { DeleteObject(icon_info.hbmMask as _); }
        DestroyIcon(h_icon);

        // 9. PNG 인코딩
        let img = image::RgbaImage::from_raw(width, height, pixels)?;
        let mut png_buf = std::io::Cursor::new(Vec::new());
        img.write_to(&mut png_buf, image::ImageFormat::Png).ok()?;

        Some(png_buf.into_inner())
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn get_native_icon_bytes(_path: &str, _size: u32) -> Option<Vec<u8>> {
    None
}

// --- 동영상 썸네일 (OS 네이티브 API, 디스크 캐시) ---
#[tauri::command]
async fn get_video_thumbnail(app: tauri::AppHandle, path: String, size: u32) -> Result<Option<String>, String> {
    use tauri::Manager;

    let cache_dir = app.path().app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("video_thumbnails");

    tauri::async_runtime::spawn_blocking(move || {
        cached_thumbnail(&cache_dir, &path, size, false, || {
            get_native_video_thumbnail(&path, size)
        })
    })
    .await
    .map_err(|e| format!("동영상 썸네일 생성 실패: {}", e))?
}

// macOS: AVFoundation AVAssetImageGenerator로 동영상 프레임 추출
#[cfg(target_os = "macos")]
fn get_native_video_thumbnail(path: &str, size: u32) -> Result<Option<Vec<u8>>, String> {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::c_void;

    unsafe {
        // NSURL fileURLWithPath:
        let nsurl_class = Class::get("NSURL").ok_or("NSURL not found")?;
        let path_nsstring: *mut Object = msg_send![
            Class::get("NSString").unwrap(),
            stringWithUTF8String: std::ffi::CString::new(path).map_err(|e| e.to_string())?.as_ptr()
        ];
        let url: *mut Object = msg_send![nsurl_class, fileURLWithPath: path_nsstring];
        if url.is_null() {
            return Ok(None);
        }

        // AVAsset assetWithURL:
        let avasset_class = Class::get("AVAsset").ok_or("AVAsset not found")?;
        let asset: *mut Object = msg_send![avasset_class, assetWithURL: url];
        if asset.is_null() {
            return Ok(None);
        }

        // AVAssetImageGenerator alloc/initWithAsset:
        let generator_class = Class::get("AVAssetImageGenerator")
            .ok_or("AVAssetImageGenerator not found")?;
        let generator: *mut Object = msg_send![generator_class, alloc];
        let generator: *mut Object = msg_send![generator, initWithAsset: asset];
        if generator.is_null() {
            return Ok(None);
        }

        // appliesPreferredTrackTransform = YES (회전 보정)
        let _: () = msg_send![generator, setAppliesPreferredTrackTransform: true];

        // maximumSize 설정
        #[repr(C)]
        struct CGSize { width: f64, height: f64 }
        let max_size = CGSize { width: size as f64, height: size as f64 };
        let _: () = msg_send![generator, setMaximumSize: max_size];

        // CMTime: 1초 지점
        #[repr(C)]
        #[derive(Copy, Clone)]
        struct CMTime {
            value: i64,
            timescale: i32,
            flags: u32,
            epoch: i64,
        }
        let time = CMTime { value: 1, timescale: 1, flags: 1, epoch: 0 };

        // copyCGImageAtTime:actualTime:error:
        let mut actual_time = time;
        let mut error: *mut Object = std::ptr::null_mut();
        let cg_image: *mut c_void = msg_send![
            generator,
            copyCGImageAtTime: time
            actualTime: &mut actual_time as *mut CMTime
            error: &mut error as *mut *mut Object
        ];

        if cg_image.is_null() || !error.is_null() {
            let _: () = msg_send![generator, release];
            return Ok(None);
        }

        // CGImage → NSBitmapImageRep → PNG 데이터
        let bitmap_class = Class::get("NSBitmapImageRep")
            .ok_or("NSBitmapImageRep not found")?;
        let bitmap: *mut Object = msg_send![bitmap_class, alloc];
        let bitmap: *mut Object = msg_send![bitmap, initWithCGImage: cg_image];

        // CGImageRelease
        extern "C" { fn CGImageRelease(image: *mut c_void); }
        CGImageRelease(cg_image);

        if bitmap.is_null() {
            let _: () = msg_send![generator, release];
            return Ok(None);
        }

        // representationUsingType:NSBitmapImageFileTypePNG properties:@{}
        let empty_dict: *mut Object = msg_send![Class::get("NSDictionary").unwrap(), dictionary];
        let png_data: *mut Object = msg_send![
            bitmap,
            representationUsingType: 4u64  // NSBitmapImageFileTypePNG = 4
            properties: empty_dict
        ];

        let result = if !png_data.is_null() {
            let length: usize = msg_send![png_data, length];
            let bytes: *const u8 = msg_send![png_data, bytes];
            Some(std::slice::from_raw_parts(bytes, length).to_vec())
        } else {
            None
        };

        let _: () = msg_send![bitmap, release];
        let _: () = msg_send![generator, release];

        Ok(result)
    }
}

// Windows: Shell COM 인터페이스로 동영상 썸네일 추출
#[cfg(target_os = "windows")]
fn get_native_video_thumbnail(path: &str, size: u32) -> Result<Option<Vec<u8>>, String> {
    use winapi::um::combaseapi::{CoInitializeEx, CoUninitialize};
    use winapi::um::objbase::COINIT_MULTITHREADED;
    use winapi::shared::windef::HBITMAP;
    use winapi::shared::minwindef::DWORD;
    use winapi::shared::guiddef::GUID;
    use winapi::shared::winerror::HRESULT;
    use winapi::um::wingdi::*;
    use winapi::um::unknwnbase::{IUnknown, IUnknownVtbl};
    use std::ptr;
    use std::ffi::c_void;

    // IShellItemImageFactory COM 인터페이스 수동 정의
    #[repr(C)]
    struct IShellItemImageFactoryVtbl {
        // IUnknown
        query_interface: unsafe extern "system" fn(*mut IShellItemImageFactoryRaw, *const GUID, *mut *mut c_void) -> HRESULT,
        add_ref: unsafe extern "system" fn(*mut IShellItemImageFactoryRaw) -> u32,
        release: unsafe extern "system" fn(*mut IShellItemImageFactoryRaw) -> u32,
        // IShellItemImageFactory
        get_image: unsafe extern "system" fn(*mut IShellItemImageFactoryRaw, winapi::shared::windef::SIZE, u32, *mut HBITMAP) -> HRESULT,
    }

    #[repr(C)]
    struct IShellItemImageFactoryRaw {
        vtbl: *const IShellItemImageFactoryVtbl,
    }

    extern "system" {
        fn SHCreateItemFromParsingName(
            pszPath: *const u16,
            pbc: *mut c_void,
            riid: *const GUID,
            ppv: *mut *mut c_void,
        ) -> HRESULT;
    }

    // IShellItemImageFactory GUID: {bcc18b79-ba16-442f-80c4-8a59c30c463b}
    let iid_image_factory = GUID {
        Data1: 0xbcc18b79,
        Data2: 0xba16,
        Data3: 0x442f,
        Data4: [0x80, 0xc4, 0x8a, 0x59, 0xc3, 0x0c, 0x46, 0x3b],
    };

    unsafe {
        CoInitializeEx(ptr::null_mut(), COINIT_MULTITHREADED);

        let wide_path: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();

        // SHCreateItemFromParsingName으로 IShellItemImageFactory 직접 취득
        let mut factory: *mut IShellItemImageFactoryRaw = ptr::null_mut();
        let hr = SHCreateItemFromParsingName(
            wide_path.as_ptr(),
            ptr::null_mut(),
            &iid_image_factory,
            &mut factory as *mut _ as *mut *mut c_void,
        );
        if hr != 0 || factory.is_null() {
            CoUninitialize();
            return Ok(None);
        }

        // GetImage로 HBITMAP 취득
        let sz = winapi::shared::windef::SIZE { cx: size as i32, cy: size as i32 };
        let mut hbitmap: HBITMAP = ptr::null_mut();
        let hr = ((*(*factory).vtbl).get_image)(factory, sz, 0x0, &mut hbitmap);
        ((*(*factory).vtbl).release)(factory);

        if hr != 0 || hbitmap.is_null() {
            CoUninitialize();
            return Ok(None);
        }

        // HBITMAP → 픽셀 데이터 추출
        let mut bmp_info = BITMAP {
            bmType: 0, bmWidth: 0, bmHeight: 0,
            bmWidthBytes: 0, bmPlanes: 0, bmBitsPixel: 0, bmBits: ptr::null_mut(),
        };
        GetObjectW(hbitmap as *mut _, std::mem::size_of::<BITMAP>() as i32, &mut bmp_info as *mut _ as *mut _);

        let width = bmp_info.bmWidth as u32;
        let height = bmp_info.bmHeight.unsigned_abs();
        if width == 0 || height == 0 {
            DeleteObject(hbitmap as *mut _);
            CoUninitialize();
            return Ok(None);
        }

        // GetDIBits로 BGRA 픽셀 추출
        let hdc = CreateCompatibleDC(ptr::null_mut());
        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as DWORD,
                biWidth: width as i32,
                biHeight: -(height as i32), // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD { rgbBlue: 0, rgbGreen: 0, rgbRed: 0, rgbReserved: 0 }],
        };
        let mut pixels = vec![0u8; (width * height * 4) as usize];
        GetDIBits(hdc, hbitmap, 0, height, pixels.as_mut_ptr() as *mut _, &mut bi, DIB_RGB_COLORS);
        DeleteDC(hdc);
        DeleteObject(hbitmap as *mut _);
        CoUninitialize();

        // BGRA → RGBA 변환
        for chunk in pixels.chunks_exact_mut(4) {
            chunk.swap(0, 2); // B ↔ R
        }

        // image crate로 PNG 인코딩
        let img_buf: image::ImageBuffer<image::Rgba<u8>, Vec<u8>> =
            image::ImageBuffer::from_raw(width, height, pixels)
                .ok_or("이미지 버퍼 생성 실패")?;

        let mut png_buf = std::io::Cursor::new(Vec::new());
        img_buf.write_to(&mut png_buf, image::ImageFormat::Png)
            .map_err(|e| format!("PNG 인코딩 실패: {}", e))?;

        Ok(Some(png_buf.into_inner()))
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn get_native_video_thumbnail(_path: &str, _size: u32) -> Result<Option<Vec<u8>>, String> {
    Ok(None)
}

// --- ZIP 압축 ---
#[tauri::command]
async fn compress_to_zip(paths: Vec<String>, dest: String) -> Result<String, String> {
    let file = std::fs::File::create(&dest).map_err(|e| format!("ZIP 파일 생성 실패: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for source in &paths {
        let src = std::path::Path::new(source);
        let base_name = src.file_name().unwrap_or_default().to_string_lossy().to_string();

        if src.is_dir() {
            add_directory_to_zip(&mut zip, src, &base_name, options)?;
        } else {
            zip.start_file(&base_name, options).map_err(|e| e.to_string())?;
            let content = std::fs::read(src).map_err(|e| e.to_string())?;
            std::io::Write::write_all(&mut zip, &content).map_err(|e| e.to_string())?;
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(dest)
}

// ffmpeg 바이너리 경로 탐색 (sidecar → 시스템 PATH)
fn find_ffmpeg_path() -> Option<std::path::PathBuf> {
    // 1. sidecar 경로 (실행 바이너리 옆)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let sidecar = dir.join("ffmpeg");
            // 0바이트 파일 방지: 크기 체크
            if sidecar.exists() && std::fs::metadata(&sidecar).map(|m| m.len() > 0).unwrap_or(false) {
                return Some(sidecar);
            }
        }
    }
    // 2. 시스템 PATH
    if let Ok(output) = std::process::Command::new("ffmpeg").arg("-version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
    {
        if output.success() {
            return Some(std::path::PathBuf::from("ffmpeg"));
        }
    }
    None
}

// --- ffmpeg 설치 확인 ---
#[tauri::command]
async fn check_ffmpeg() -> Result<bool, String> {
    Ok(find_ffmpeg_path().is_some())
}

// --- ffmpeg 자동 다운로드 (첫 실행 시) ---
#[tauri::command]
async fn download_ffmpeg() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        ffmpeg_sidecar::download::auto_download()
            .map_err(|e| format!("ffmpeg 다운로드 실패: {}", e))
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- 동영상 압축 (H.265, Channel 진행률 스트리밍) ---
#[derive(Clone, serde::Serialize)]
struct VideoProgress {
    percent: f32,
    speed: String,
    fps: f32,
}

#[tauri::command]
async fn compress_video(
    input: String,
    quality: String,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String, String> {
    // 출력 파일명: {이름}_comp.{확장자}, 충돌 시 _comp_2, _comp_3 ...
    let input_path = std::path::Path::new(&input);
    let stem = input_path.file_stem().unwrap_or_default().to_string_lossy();
    let ext = input_path.extension().unwrap_or_default().to_string_lossy();
    let parent = input_path.parent().unwrap_or(std::path::Path::new("."));

    let output_path = find_unique_path(parent, &stem, "_comp", &format!(".{}", ext));
    let output_str = output_path.to_string_lossy().to_string();

    // ffmpeg 경로 결정 (sidecar → 시스템 PATH 순)
    let ffmpeg_path = find_ffmpeg_path()
        .ok_or_else(|| "ffmpeg를 찾을 수 없습니다. 다운로드를 먼저 실행해주세요.".to_string())?;

    // 품질별 CRF 설정: low(보통)=높은CRF, medium(좋은)=중간CRF, high(최고)=낮은CRF
    // macOS: H.265(HEVC), Windows: H.264(AVC) — WebView2 HEVC 미지원
    let codec_args: Vec<String> = {
        #[cfg(target_os = "macos")]
        let (codec, tag_args, crf) = match quality.as_str() {
            "low"  => ("libx265", vec!["-tag:v", "hvc1"], "32"),
            "high" => ("libx265", vec!["-tag:v", "hvc1"], "22"),
            _      => ("libx265", vec!["-tag:v", "hvc1"], "28"), // medium (기본)
        };
        #[cfg(not(target_os = "macos"))]
        let (codec, tag_args, crf) = match quality.as_str() {
            "low"  => ("libx264", vec![] as Vec<&str>, "28"),
            "high" => ("libx264", vec![] as Vec<&str>, "18"),
            _      => ("libx264", vec![] as Vec<&str>, "23"), // medium (기본)
        };
        let mut args = vec![
            "-c:v".to_string(), codec.to_string(),
            "-crf".to_string(), crf.to_string(),
            "-preset".to_string(), "medium".to_string(),
            "-c:a".to_string(), "aac".to_string(),
            "-b:a".to_string(), "128k".to_string(),
        ];
        for t in tag_args {
            args.push(t.to_string());
        }
        args
    };

    let mut cmd = std::process::Command::new(&ffmpeg_path);
    cmd.args(&["-y", "-i", &input]);
    cmd.args(&codec_args);
    cmd.args(&["-progress", "pipe:1"]);
    cmd.arg(&output_str);

    // Windows: 콘솔 창 숨기기 (CREATE_NO_WINDOW)
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("ffmpeg 실행 실패: {}", e))?;

    // stdout에서 -progress 출력 파싱 (별도 스레드)
    let stdout = child.stdout.take();
    let on_progress_clone = on_progress.clone();
    let progress_thread = std::thread::spawn(move || {
        if let Some(stdout) = stdout {
            use std::io::BufRead;
            let reader = std::io::BufReader::new(stdout);
            for line in reader.lines().flatten() {
                // -progress 출력: "out_time_ms=12345678" 형식
                if let Some(val) = line.strip_prefix("out_time_ms=") {
                    if let Ok(us) = val.parse::<i64>() {
                        let secs = us as f32 / 1_000_000.0;
                        let _ = on_progress_clone.send(VideoProgress {
                            percent: secs,
                            speed: String::new(),
                            fps: 0.0,
                        });
                    }
                } else if let Some(val) = line.strip_prefix("speed=") {
                    let speed_str = val.trim().to_string();
                    let _ = on_progress_clone.send(VideoProgress {
                        percent: -2.0, // 스피드만 업데이트 신호
                        speed: speed_str,
                        fps: 0.0,
                    });
                }
            }
        }
    });

    // stderr 캡처 (에러 메시지용)
    let stderr = child.stderr.take();
    let stderr_thread = std::thread::spawn(move || {
        let mut output = String::new();
        if let Some(mut stderr) = stderr {
            use std::io::Read;
            let _ = stderr.read_to_string(&mut output);
        }
        output
    });

    let status = child.wait().map_err(|e| format!("ffmpeg 대기 실패: {}", e))?;
    let _ = progress_thread.join();
    let stderr_output = stderr_thread.join().unwrap_or_default();

    if !status.success() {
        let _ = std::fs::remove_file(&output_path);
        // stderr에서 의미있는 에러 추출
        let err_msg = stderr_output.lines()
            .filter(|l| l.contains("Error") || l.contains("error") || l.contains("Unknown") || l.contains("not found"))
            .last()
            .unwrap_or("ffmpeg 인코딩 실패")
            .to_string();
        return Err(err_msg);
    }

    if !output_path.exists() {
        return Err(format!("ffmpeg가 출력 파일을 생성하지 않았습니다. stderr: {}",
            stderr_output.lines().last().unwrap_or("(없음)")));
    }

    Ok(output_str)
}

// ffmpeg 시간 문자열 "HH:MM:SS.xx" → 초(f32) 파싱
fn parse_ffmpeg_time(time: &str) -> f32 {
    let parts: Vec<&str> = time.split(':').collect();
    if parts.len() == 3 {
        let h: f32 = parts[0].parse().unwrap_or(0.0);
        let m: f32 = parts[1].parse().unwrap_or(0.0);
        let s: f32 = parts[2].parse().unwrap_or(0.0);
        h * 3600.0 + m * 60.0 + s
    } else {
        0.0
    }
}

fn add_directory_to_zip<W: std::io::Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    dir: &std::path::Path,
    prefix: &str,
    options: zip::write::SimpleFileOptions,
) -> Result<(), String> {
    zip.add_directory(format!("{}/", prefix), options).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let entry_name = entry.file_name().to_string_lossy().to_string();
        let full_name = format!("{}/{}", prefix, entry_name);
        if entry.path().is_dir() {
            add_directory_to_zip(zip, &entry.path(), &full_name, options)?;
        } else {
            zip.start_file(&full_name, options).map_err(|e| e.to_string())?;
            let content = std::fs::read(entry.path()).map_err(|e| e.to_string())?;
            std::io::Write::write_all(zip, &content).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// --- 썸네일 캐시 무효화 ---
#[tauri::command]
fn invalidate_thumbnail_cache(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;
    use tauri::Manager;

    let sizes: [u32; 10] = [40, 60, 80, 100, 120, 160, 200, 240, 280, 320];
    let cache_dir_names = ["img_thumbnails", "psd_thumbnails", "video_thumbnails"];
    let app_cache = app.path().app_cache_dir().map_err(|e: tauri::Error| e.to_string())?;

    for path in &paths {
        let modified = std::fs::metadata(path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis())
            .unwrap_or(0);

        for &size in &sizes {
            let mut hasher = DefaultHasher::new();
            path.hash(&mut hasher);
            modified.hash(&mut hasher);
            size.hash(&mut hasher);
            let cache_key = format!("{:x}", hasher.finish());

            for dir_name in &cache_dir_names {
                let cache_file = app_cache.join(dir_name).join(format!("{}.png", cache_key));
                if cache_file.exists() {
                    std::fs::remove_file(&cache_file).ok();
                }
            }
        }
    }
    Ok(())
}

// --- 최근 변경 파일 조회 ---
// 지정된 루트 디렉토리들에서 최근 N일 이내 변경된 파일을 조회
// spawn_blocking으로 네트워크 파일시스템 차단 방지
#[tauri::command]
async fn get_recent_files(roots: Vec<String>, days: u32) -> Result<Vec<FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<FileEntry>, String> {
        let now = std::time::SystemTime::now();
        let cutoff = std::time::Duration::from_secs(days as u64 * 24 * 60 * 60);
        let mut results: Vec<FileEntry> = Vec::new();

        for root in &roots {
            let root_path = std::path::Path::new(root);
            if !root_path.is_dir() {
                continue;
            }
            // 1단계 깊이만 스캔 (재귀 X → 성능 보장)
            let entries = match std::fs::read_dir(root_path) {
                Ok(e) => e,
                Err(_) => continue,
            };
            for entry in entries.flatten() {
                let meta = match entry.metadata() {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                // 디렉토리 제외 (파일만)
                if meta.is_dir() {
                    continue;
                }
                // Windows: 숨김(HIDDEN) 또는 시스템(SYSTEM) 속성 파일 제외
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::fs::MetadataExt;
                    if meta.file_attributes() & 0x6 != 0 {
                        continue;
                    }
                }
                let name = entry.file_name().to_string_lossy().to_string();
                // 숨김 파일 제외
                if name.starts_with('.') {
                    continue;
                }
                // 시스템/임시 파일 제외
                let name_lower = name.to_lowercase();
                if name_lower == "desktop.ini"
                    || name_lower == "thumbs.db"
                    || name_lower == "ntuser.dat"
                    || name_lower.ends_with(".sys")
                    || name_lower.ends_with(".log.tmp")
                    || name_lower.starts_with("~$")
                    || name_lower.starts_with("photoshop temp")
                {
                    continue;
                }
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);

                // 최근 N일 이내 변경된 파일만
                let file_age = now
                    .duration_since(meta.modified().unwrap_or(now))
                    .unwrap_or(cutoff);
                if file_age > cutoff {
                    continue;
                }

                let file_type = classify_file(&name);
                results.push(FileEntry {
                    path: entry.path().to_string_lossy().to_string(),
                    is_dir: false,
                    size: meta.len(),
                    modified,
                    file_type,
                    name,
                });
            }
        }

        // 최신순 정렬
        results.sort_by(|a, b| b.modified.cmp(&a.modified));
        // 최대 100개 제한
        results.truncate(100);
        Ok(results)
    })
    .await
    .map_err(|e| format!("최근 파일 조회 실패: {}", e))?
}

// --- 다른 앱으로 열기 ---
#[tauri::command]
async fn open_with_app(path: String, app: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-a", &app, &path])
            .spawn()
            .map_err(|e| format!("앱 실행 실패: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &app, &path])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("앱 실행 실패: {}", e))?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (&path, &app);
    }
    Ok(())
}

// --- Photoshop에서 열기 ---
#[tauri::command]
async fn open_in_photoshop(paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        // /Applications/에서 "Adobe Photoshop*" 앱 중 최신 버전 찾기
        let ps_app = std::fs::read_dir("/Applications")
            .ok()
            .and_then(|entries| {
                entries
                    .flatten()
                    .filter_map(|e| {
                        let name = e.file_name().to_string_lossy().to_string();
                        if name.starts_with("Adobe Photoshop") && name.ends_with(".app") {
                            Some(name)
                        } else if name.starts_with("Adobe Photoshop") && e.path().is_dir() {
                            Some(name)
                        } else {
                            None
                        }
                    })
                    .max() // 알파벳 순 최대 = 최신 버전
            })
            .ok_or_else(|| "Photoshop을 찾을 수 없습니다. 설치되어 있는지 확인해주세요.".to_string())?;

        let mut cmd = std::process::Command::new("open");
        cmd.arg("-a").arg(&ps_app);
        for p in &paths {
            cmd.arg(p);
        }
        cmd.spawn().map_err(|e| format!("Photoshop 실행 실패: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        // 레지스트리에서 Photoshop 경로 탐색
        fn find_photoshop_path() -> Option<String> {
            use winapi::um::winreg::{RegOpenKeyExW, RegCloseKey, RegEnumKeyExW, RegQueryValueExW, HKEY_LOCAL_MACHINE};
            use winapi::um::winnt::{KEY_READ, REG_SZ};
            use std::ptr;

            unsafe {
                let subkey: Vec<u16> = "SOFTWARE\\Adobe\\Photoshop\0".encode_utf16().collect();
                let mut hkey = ptr::null_mut();
                if RegOpenKeyExW(HKEY_LOCAL_MACHINE, subkey.as_ptr(), 0, KEY_READ, &mut hkey) != 0 {
                    return None;
                }

                // 최신 버전 키 찾기 (예: "160.0", "170.0" 등)
                let mut latest_version = String::new();
                let mut index = 0u32;
                loop {
                    let mut name_buf = vec![0u16; 256];
                    let mut name_len = 256u32;
                    let result = RegEnumKeyExW(
                        hkey, index, name_buf.as_mut_ptr(), &mut name_len,
                        ptr::null_mut(), ptr::null_mut(), ptr::null_mut(), ptr::null_mut()
                    );
                    if result != 0 { break; }
                    let name = String::from_utf16_lossy(&name_buf[..name_len as usize]);
                    if name > latest_version {
                        latest_version = name;
                    }
                    index += 1;
                }
                RegCloseKey(hkey);

                if latest_version.is_empty() {
                    return None;
                }

                // ApplicationPath 값 읽기
                let full_key = format!("SOFTWARE\\Adobe\\Photoshop\\{}\0", latest_version);
                let full_key_w: Vec<u16> = full_key.encode_utf16().collect();
                let mut hkey2 = ptr::null_mut();
                if RegOpenKeyExW(HKEY_LOCAL_MACHINE, full_key_w.as_ptr(), 0, KEY_READ, &mut hkey2) != 0 {
                    return None;
                }

                let value_name: Vec<u16> = "ApplicationPath\0".encode_utf16().collect();
                let mut data_type = 0u32;
                let mut data_size = 0u32;
                if RegQueryValueExW(hkey2, value_name.as_ptr(), ptr::null_mut(), &mut data_type, ptr::null_mut(), &mut data_size) != 0 {
                    RegCloseKey(hkey2);
                    return None;
                }
                if data_type != REG_SZ {
                    RegCloseKey(hkey2);
                    return None;
                }

                let mut data = vec![0u8; data_size as usize];
                if RegQueryValueExW(hkey2, value_name.as_ptr(), ptr::null_mut(), &mut data_type, data.as_mut_ptr(), &mut data_size) != 0 {
                    RegCloseKey(hkey2);
                    return None;
                }
                RegCloseKey(hkey2);

                let path_slice: &[u16] = std::slice::from_raw_parts(data.as_ptr() as *const u16, data_size as usize / 2);
                let app_dir = String::from_utf16_lossy(path_slice).trim_end_matches('\0').to_string();
                // 경로 구분자 보정
                let sep = if app_dir.ends_with('\\') { "" } else { "\\" };
                let exe_path = format!("{}{}Photoshop.exe", app_dir, sep);
                if std::path::Path::new(&exe_path).exists() {
                    return Some(exe_path);
                }
                None
            }
        }

        // Program Files에서 직접 탐색 (레지스트리 폴백)
        fn find_photoshop_in_program_files() -> Option<String> {
            for base in &["C:\\Program Files\\Adobe", "C:\\Program Files (x86)\\Adobe"] {
                if let Ok(entries) = std::fs::read_dir(base) {
                    let mut candidates: Vec<String> = entries
                        .flatten()
                        .filter_map(|e| {
                            let name = e.file_name().to_string_lossy().to_string();
                            if name.starts_with("Adobe Photoshop") {
                                let exe = format!("{}\\{}\\Photoshop.exe", base, name);
                                if std::path::Path::new(&exe).exists() {
                                    return Some(exe);
                                }
                            }
                            None
                        })
                        .collect();
                    candidates.sort();
                    if let Some(last) = candidates.pop() {
                        return Some(last);
                    }
                }
            }
            None
        }

        let ps_path = find_photoshop_path()
            .or_else(find_photoshop_in_program_files)
            .ok_or_else(|| "Photoshop을 찾을 수 없습니다. 설치되어 있는지 확인해주세요.".to_string())?;

        let mut cmd = std::process::Command::new(&ps_path);
        for p in &paths {
            cmd.arg(p);
        }
        // GUI 앱 직접 실행 시 CREATE_NO_WINDOW 불필요
        cmd.spawn()
            .map_err(|e| format!("Photoshop 실행 실패: {}", e))?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = &paths;
        return Err("이 플랫폼에서는 Photoshop 열기가 지원되지 않습니다".into());
    }

    Ok(())
}

// 폴더 선택 결과 구조체
#[derive(serde::Serialize)]
struct FolderSelection {
    path: String,
    name: String,
}

// 폴더 열기 명령
#[tauri::command]
async fn open_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    app.opener()
        .open_path(&path, None::<&str>)
        .map_err(|e| format!("폴더 열기 실패: {}", e))?;

    Ok(())
}

// 경로 복사 명령
#[tauri::command]
async fn copy_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;

    app.clipboard()
        .write_text(path)
        .map_err(|e| format!("경로 복사 실패: {}", e))?;

    Ok(())
}

// 폴더 선택 다이얼로그 명령
#[tauri::command]
async fn select_folder(app: tauri::AppHandle) -> Result<Option<FolderSelection>, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder_path = app.dialog()
        .file()
        .blocking_pick_folder();

    if let Some(path) = folder_path {
        // FilePath에서 경로 문자열 가져오기
        let path_str = path.to_string();

        // 경로에서 폴더 이름 추출
        let name = path_str
            .split(['/', '\\'])
            .last()
            .unwrap_or("Unknown")
            .to_string();

        Ok(Some(FolderSelection {
            path: path_str,
            name,
        }))
    } else {
        Ok(None)
    }
}

// --- OS 파일 클립보드 (파일 경로를 시스템 클립보드에 등록/읽기) ---
#[tauri::command]
fn write_files_to_clipboard(paths: Vec<String>) -> Result<(), String> {
    write_files_to_clipboard_native(&paths)
}

#[tauri::command]
fn read_files_from_clipboard() -> Result<Vec<String>, String> {
    read_files_from_clipboard_native()
}

#[cfg(target_os = "macos")]
fn write_files_to_clipboard_native(paths: &[String]) -> Result<(), String> {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::CString;

    unsafe {
        let pb_class = Class::get("NSPasteboard").ok_or("NSPasteboard not found")?;
        let pb: *mut Object = msg_send![pb_class, generalPasteboard];
        if pb.is_null() { return Err("generalPasteboard is null".into()); }

        let _: i64 = msg_send![pb, clearContents];

        let arr_class = Class::get("NSMutableArray").ok_or("NSMutableArray not found")?;
        let arr: *mut Object = msg_send![arr_class, arrayWithCapacity: paths.len()];
        if arr.is_null() { return Err("Failed to create array".into()); }

        let url_class = Class::get("NSURL").ok_or("NSURL not found")?;
        let str_class = Class::get("NSString").ok_or("NSString not found")?;

        for p in paths {
            let c_path = CString::new(p.as_str()).map_err(|e| e.to_string())?;
            let ns_path: *mut Object = msg_send![str_class, stringWithUTF8String: c_path.as_ptr()];
            if ns_path.is_null() { continue; }
            let url: *mut Object = msg_send![url_class, fileURLWithPath: ns_path];
            if url.is_null() { continue; }
            let _: () = msg_send![arr, addObject: url];
        }

        let ok: i8 = msg_send![pb, writeObjects: arr];
        if ok == 0 {
            return Err("writeObjects failed".into());
        }
        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn read_files_from_clipboard_native() -> Result<Vec<String>, String> {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};

    unsafe {
        let pb_class = Class::get("NSPasteboard").ok_or("NSPasteboard not found")?;
        let pb: *mut Object = msg_send![pb_class, generalPasteboard];
        if pb.is_null() { return Err("generalPasteboard is null".into()); }

        let url_class = Class::get("NSURL").ok_or("NSURL not found")?;
        let arr_class = Class::get("NSArray").ok_or("NSArray not found")?;
        let dict_class = Class::get("NSDictionary").ok_or("NSDictionary not found")?;
        let nsnum_class = Class::get("NSNumber").ok_or("NSNumber not found")?;
        let nsstr_class = Class::get("NSString").ok_or("NSString not found")?;

        let classes: *mut Object = msg_send![arr_class, arrayWithObject: url_class];

        // NSPasteboardURLReadingFileURLsOnlyKey 옵션으로 파일 URL만 필터링
        let key_str = std::ffi::CString::new("NSPasteboardURLReadingFileURLsOnlyKey").unwrap();
        let key: *mut Object = msg_send![nsstr_class, stringWithUTF8String: key_str.as_ptr()];
        let yes_val: *mut Object = msg_send![nsnum_class, numberWithBool: true];
        let options: *mut Object = msg_send![dict_class, dictionaryWithObject: yes_val forKey: key];

        let urls: *mut Object = msg_send![pb, readObjectsForClasses: classes options: options];
        if !urls.is_null() {
            let count: usize = msg_send![urls, count];
            let mut result = Vec::with_capacity(count);

            for i in 0..count {
                let url: *mut Object = msg_send![urls, objectAtIndex: i];
                if url.is_null() { continue; }

                let is_file: i8 = msg_send![url, isFileURL];
                if is_file == 0 { continue; }

                let path: *mut Object = msg_send![url, path];
                if path.is_null() { continue; }

                let utf8: *const std::os::raw::c_char = msg_send![path, UTF8String];
                if utf8.is_null() { continue; }

                let path_str = std::ffi::CStr::from_ptr(utf8).to_string_lossy().to_string();
                result.push(path_str);
            }

            if !result.is_empty() { return Ok(result); }
        }

        // 폴백: NSFilenamesPboardType으로 Finder 복사 파일 읽기
        let ptype_str = std::ffi::CString::new("NSFilenamesPboardType").unwrap();
        let ptype: *mut Object = msg_send![nsstr_class, stringWithUTF8String: ptype_str.as_ptr()];
        let plist: *mut Object = msg_send![pb, propertyListForType: ptype];
        if !plist.is_null() {
            let pcount: usize = msg_send![plist, count];
            let mut result = Vec::with_capacity(pcount);
            for i in 0..pcount {
                let item: *mut Object = msg_send![plist, objectAtIndex: i];
                if item.is_null() { continue; }
                let utf8: *const std::os::raw::c_char = msg_send![item, UTF8String];
                if utf8.is_null() { continue; }
                let s = std::ffi::CStr::from_ptr(utf8).to_string_lossy().to_string();
                result.push(s);
            }
            if !result.is_empty() { return Ok(result); }
        }

        Ok(vec![])
    }
}

#[cfg(target_os = "windows")]
fn write_files_to_clipboard_native(paths: &[String]) -> Result<(), String> {
    std::panic::catch_unwind(|| write_files_to_clipboard_inner(paths))
        .map_err(|_| "clipboard write panic".to_string())?
}

#[cfg(target_os = "windows")]
fn write_files_to_clipboard_inner(paths: &[String]) -> Result<(), String> {
    use winapi::um::winuser::{OpenClipboard, CloseClipboard, EmptyClipboard, SetClipboardData, CF_HDROP};
    use winapi::um::winbase::{GlobalAlloc, GlobalLock, GlobalUnlock, GlobalFree, GMEM_MOVEABLE, GMEM_ZEROINIT};
    use std::mem;
    use std::ptr;

    // winapi 크레이트에 DROPFILES가 없어서 직접 정의
    #[repr(C)]
    struct DROPFILES {
        pFiles: u32,
        pt_x: i32,
        pt_y: i32,
        fNC: i32,
        fWide: i32,
    }

    // 경로를 UTF-16 null 종료 문자열로 변환
    let wide_paths: Vec<Vec<u16>> = paths.iter()
        .map(|p| p.encode_utf16().chain(std::iter::once(0)).collect())
        .collect();

    // DROPFILES 헤더 + 모든 경로 + 끝 null 종료자
    let mut total_size = mem::size_of::<DROPFILES>();
    for wp in &wide_paths {
        total_size += wp.len() * 2;
    }
    total_size += 2; // 끝 null 종료자

    unsafe {
        if OpenClipboard(ptr::null_mut()) == 0 {
            return Err("OpenClipboard failed".into());
        }

        if EmptyClipboard() == 0 {
            CloseClipboard();
            return Err("EmptyClipboard failed".into());
        }

        let h_global = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, total_size);
        if h_global.is_null() {
            CloseClipboard();
            return Err("GlobalAlloc failed".into());
        }

        let data = GlobalLock(h_global) as *mut u8;
        if data.is_null() {
            GlobalFree(h_global);
            CloseClipboard();
            return Err("GlobalLock failed".into());
        }

        // DROPFILES 헤더 채우기
        let drop_files = data as *mut DROPFILES;
        (*drop_files).pFiles = mem::size_of::<DROPFILES>() as u32;
        (*drop_files).fWide = 1; // 유니코드 경로

        // 헤더 뒤에 경로 복사
        let mut offset = mem::size_of::<DROPFILES>();
        for wp in &wide_paths {
            let bytes = std::slice::from_raw_parts(wp.as_ptr() as *const u8, wp.len() * 2);
            ptr::copy_nonoverlapping(bytes.as_ptr(), data.add(offset), bytes.len());
            offset += bytes.len();
        }
        // 끝 null 종료자는 GMEM_ZEROINIT으로 이미 0

        GlobalUnlock(h_global);

        if SetClipboardData(CF_HDROP, h_global).is_null() {
            GlobalFree(h_global);
            CloseClipboard();
            return Err("SetClipboardData failed".into());
        }

        // SetClipboardData 성공 시 시스템이 메모리 소유 (GlobalFree 호출 금지)
        CloseClipboard();
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn read_files_from_clipboard_native() -> Result<Vec<String>, String> {
    std::panic::catch_unwind(|| {
        // 첫 시도 실패 시 50ms 후 1회 재시도 (다른 프로세스가 클립보드를 잠근 경우)
        match read_files_from_clipboard_inner() {
            Ok(v) => Ok(v),
            Err(e) => {
                log::warn!("클립보드 읽기 첫 시도 실패 ({}), 50ms 후 재시도", e);
                std::thread::sleep(std::time::Duration::from_millis(50));
                read_files_from_clipboard_inner()
            }
        }
    })
    .map_err(|_| "clipboard read panic".to_string())?
}

#[cfg(target_os = "windows")]
fn read_files_from_clipboard_inner() -> Result<Vec<String>, String> {
    use winapi::um::winuser::{OpenClipboard, CloseClipboard, GetClipboardData, CF_HDROP, IsClipboardFormatAvailable};
    use winapi::um::shellapi::{DragQueryFileW, HDROP};
    use std::ptr;

    unsafe {
        if IsClipboardFormatAvailable(CF_HDROP) == 0 {
            return Ok(vec![]);
        }

        if OpenClipboard(ptr::null_mut()) == 0 {
            return Err("OpenClipboard failed".into());
        }

        let h_data = GetClipboardData(CF_HDROP);
        if h_data.is_null() {
            CloseClipboard();
            return Ok(vec![]);
        }

        let h_drop = h_data as HDROP;
        let count = DragQueryFileW(h_drop, 0xFFFFFFFF, ptr::null_mut(), 0);
        let mut result = Vec::with_capacity(count as usize);

        for i in 0..count {
            let len = DragQueryFileW(h_drop, i, ptr::null_mut(), 0);
            let mut buf = vec![0u16; (len + 1) as usize];
            DragQueryFileW(h_drop, i, buf.as_mut_ptr(), len + 1);
            let path = String::from_utf16_lossy(&buf[..len as usize]);
            result.push(path);
        }

        CloseClipboard();
        Ok(result)
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn write_files_to_clipboard_native(_paths: &[String]) -> Result<(), String> {
    Err("이 플랫폼에서는 파일 클립보드가 지원되지 않습니다".into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn read_files_from_clipboard_native() -> Result<Vec<String>, String> {
    Ok(vec![])
}

// 클립보드 이미지 데이터를 PNG 파일로 저장
#[tauri::command]
fn paste_image_from_clipboard(dest_dir: String) -> Result<Option<String>, String> {
    use arboard::Clipboard;

    let mut clip = Clipboard::new().map_err(|e| format!("클립보드 접근 실패: {}", e))?;
    let img = match clip.get_image() {
        Ok(img) => img,
        Err(_) => return Ok(None), // 이미지 데이터 없음
    };

    // 고유 파일명 생성
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let sep = if dest_dir.contains('\\') { "\\" } else { "/" };
    let mut file_path = format!("{}{}clipboard_{}.png", dest_dir, sep, timestamp);

    // 동일 파일명 존재 시 번호 추가
    let mut counter = 1;
    while std::path::Path::new(&file_path).exists() {
        file_path = format!("{}{}clipboard_{}_{}.png", dest_dir, sep, timestamp, counter);
        counter += 1;
    }

    // RGBA → PNG 저장
    let width = img.width as u32;
    let height = img.height as u32;
    let rgba_data: Vec<u8> = img.bytes.into_owned();
    let img_buf: image::ImageBuffer<image::Rgba<u8>, Vec<u8>> =
        image::ImageBuffer::from_raw(width, height, rgba_data)
            .ok_or("이미지 버퍼 생성 실패")?;
    img_buf.save(&file_path).map_err(|e| format!("이미지 저장 실패: {}", e))?;

    Ok(Some(file_path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_drag::init())
    .invoke_handler(tauri::generate_handler![
        open_folder,
        copy_path,
        select_folder,
        list_directory,
        get_image_dimensions,
        get_file_thumbnail,
        get_psd_thumbnail,
        get_file_icon,
        check_duplicate_items,
        copy_items,
        duplicate_items,
        move_items,
        delete_items,
        restore_trash_items,
        create_directory,
        create_text_file,
        write_text_file,
        rename_item,
        quick_look,
        is_directory,
        get_video_thumbnail,
        compress_to_zip,
        open_with_app,
        open_in_photoshop,
        read_text_file,
        write_files_to_clipboard,
        read_files_from_clipboard,
        paste_image_from_clipboard,
        invalidate_thumbnail_cache,
        get_recent_files,
        search_files,
        check_ffmpeg,
        download_ffmpeg,
        compress_video,
        pixelate_preview,
        pixelate_image,
        sprite_sheet_preview,
        save_sprite_sheet,
        split_sprite_sheet,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
