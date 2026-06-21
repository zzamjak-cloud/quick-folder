//! 이미지 아이콘 포맷 변환 모듈

use crate::modules::error::{AppError, Result};

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
            icon_dir.add_entry(
                ico::IconDirEntry::encode(&icon_image)
                    .map_err(|e| AppError::ImageProcessing(format!("ICO 인코딩 실패: {}", e)))?,
            );
        }
        icon_dir
            .write(file)
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
        let icns_img_256 =
            icns::Image::from_data(icns::PixelFormat::RGBA, 256, 256, rgba_256.into_raw())
                .map_err(|e| AppError::ImageProcessing(format!("ICNS 이미지 생성 실패: {}", e)))?;
        icon_family
            .add_icon_with_type(&icns_img_256, icns::IconType::RGBA32_256x256)
            .map_err(|e| AppError::ImageProcessing(format!("ICNS 아이콘 추가 실패: {}", e)))?;
        // 512x512
        let resized_512 = img.resize_exact(512, 512, image::imageops::FilterType::Lanczos3);
        let rgba_512 = resized_512.to_rgba8();
        let icns_img_512 =
            icns::Image::from_data(icns::PixelFormat::RGBA, 512, 512, rgba_512.into_raw())
                .map_err(|e| AppError::ImageProcessing(format!("ICNS 이미지 생성 실패: {}", e)))?;
        icon_family
            .add_icon_with_type(&icns_img_512, icns::IconType::RGBA32_512x512)
            .map_err(|e| AppError::ImageProcessing(format!("ICNS 아이콘 추가 실패: {}", e)))?;
        icon_family
            .write(file)
            .map_err(|e| AppError::ImageProcessing(format!("ICNS 저장 실패: {}", e)))?;
        Ok(out_path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| AppError::Internal(format!("ICNS 변환 실패: {}", e)))?
}
