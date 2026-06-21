//! 스프라이트 시트 처리 모듈

use crate::helpers::{create_sprite_canvas, find_unique_path};
use crate::modules::error::{AppError, Result};

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
        image::DynamicImage::ImageRgba8(preview).write_to(&mut buf, image::ImageFormat::Png)?;

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
                    .map_err(|e| {
                        AppError::ImageProcessing(format!("파일 저장 실패 ({}): {}", file_name, e))
                    })?;

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
