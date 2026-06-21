//! 이미지 크롭/드로잉/압축/리사이즈 모듈

use crate::helpers::find_unique_path;
use crate::modules::error::{AppError, Result};
use image::ImageEncoder;

#[derive(serde::Serialize)]
pub struct ImageCompressPreview {
    pub data_url: String,
    pub size: u64,
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

fn encode_compressed_image(
    path: &str,
    quality: &str,
) -> Result<(Vec<u8>, &'static str, &'static str)> {
    use image::codecs::jpeg::JpegEncoder;
    use image::codecs::png::{CompressionType, FilterType, PngEncoder};

    let img = image::open(path)?;
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let out_ext = if ext == "jpg" || ext == "jpeg" {
        "jpg"
    } else {
        "png"
    };
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
        let stem = input_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("image");
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
            return Err(AppError::InvalidInput(
                "너비/높이는 1px 이상이어야 합니다.".to_string(),
            ));
        }
        let img = image::open(&path)?;
        let resized = img.resize_exact(width, height, image::imageops::FilterType::Lanczos3);

        let input_path = std::path::Path::new(&path);
        let parent = input_path.parent().unwrap_or(std::path::Path::new("."));
        let stem = input_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("image");
        let ext = input_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("png")
            .to_lowercase();
        let out_ext = if ext == "jpg" || ext == "jpeg" {
            "jpg"
        } else {
            &ext
        };
        let output_path = find_unique_path(
            parent,
            stem,
            &format!("_{}x{}", width, height),
            &format!(".{}", out_ext),
        );
        resized.save(&output_path)?;

        output_path
            .to_str()
            .map(|s| s.to_string())
            .ok_or_else(|| AppError::Internal("출력 경로 변환 실패".to_string()))
    })
    .await
    .map_err(|e| AppError::Internal(format!("이미지 크기조정 실패: {}", e)))?
}
