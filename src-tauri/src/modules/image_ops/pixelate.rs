//! 이미지 픽셀화 모듈

use crate::helpers::find_unique_path;
use crate::modules::error::{AppError, Result};

fn apply_pixelate(
    img: &image::DynamicImage,
    pixel_size: u32,
    output_size: u32,
    max_colors: u32,
) -> image::DynamicImage {
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
        pixelated.resize(
            output_size,
            output_size,
            image::imageops::FilterType::Nearest,
        )
    } else {
        pixelated
    }
}

// Median-cut 컬러 양자화: 이미지 색상을 max_colors개로 축소
fn quantize_colors(img: &mut image::RgbaImage, max_colors: usize) {
    // 불투명 픽셀의 RGB 수집
    let pixels: Vec<[u8; 3]> = img
        .pixels()
        .filter(|p| p.0[3] > 0)
        .map(|p| [p.0[0], p.0[1], p.0[2]])
        .collect();
    if pixels.is_empty() {
        return;
    }

    // Median-cut으로 팔레트 생성
    let palette = median_cut(pixels, max_colors);

    // 각 픽셀을 가장 가까운 팔레트 색상으로 매핑
    for pixel in img.pixels_mut() {
        if pixel.0[3] == 0 {
            continue;
        }
        let rgb = [pixel.0[0], pixel.0[1], pixel.0[2]];
        let nearest = palette
            .iter()
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
        let idx = buckets
            .iter()
            .enumerate()
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
        let split_ch = if ranges[0] >= ranges[1] && ranges[0] >= ranges[2] {
            0
        } else if ranges[1] >= ranges[2] {
            1
        } else {
            2
        };

        let mut sorted = bucket;
        sorted.sort_by_key(|p| p[split_ch]);

        let mid = sorted.len() / 2;
        let right = sorted.split_off(mid);
        buckets.push(sorted);
        buckets.push(right);
    }

    // 각 버킷의 평균색을 팔레트로 반환
    buckets
        .iter()
        .map(|bucket| {
            let len = bucket.len() as u32;
            let r = bucket.iter().map(|p| p[0] as u32).sum::<u32>() / len;
            let g = bucket.iter().map(|p| p[1] as u32).sum::<u32>() / len;
            let b = bucket.iter().map(|p| p[2] as u32).sum::<u32>() / len;
            [r as u8, g as u8, b as u8]
        })
        .collect()
}

// 픽셀레이트 미리보기: 빠른 응답을 위해 300px 제한 후 픽셀화, base64 PNG 반환
#[tauri::command]
pub async fn pixelate_preview(
    input: String,
    pixel_size: u32,
    scale: u32,
    max_colors: u32,
) -> Result<String> {
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
        pixelated.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;

        use base64::Engine;
        Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
    })
    .await
    .map_err(|e| AppError::Internal(format!("픽셀레이트 미리보기 실패: {}", e)))?
}

// 픽셀레이트 저장: 원본 해상도로 픽셀화 후 {stem}_pixel.png 파일로 저장, 경로 반환
#[tauri::command]
pub async fn pixelate_image(
    input: String,
    pixel_size: u32,
    scale: u32,
    max_colors: u32,
) -> Result<String> {
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
