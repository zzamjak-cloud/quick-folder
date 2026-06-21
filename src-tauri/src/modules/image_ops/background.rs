//! 이미지 배경 제거 모듈

use crate::helpers::find_unique_path;
use crate::modules::error::{AppError, Result};

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
fn remove_bg(
    img: &image::DynamicImage,
    threshold: u8,
    feather: u8,
    seeds: &[[u32; 2]],
    bg_color: [u8; 3],
) -> image::RgbaImage {
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
            if x > 0 {
                queue.push_back((x - 1, y));
            }
            if x + 1 < w {
                queue.push_back((x + 1, y));
            }
            if y > 0 {
                queue.push_back((x, y - 1));
            }
            if y + 1 < h {
                queue.push_back((x, y + 1));
            }
            continue;
        }

        let dist = color_dist(r, g, b, bg_r, bg_g, bg_b);

        if dist <= t_dist {
            mask[idx] = 1;
            if x > 0 {
                queue.push_back((x - 1, y));
            }
            if x + 1 < w {
                queue.push_back((x + 1, y));
            }
            if y > 0 {
                queue.push_back((x, y - 1));
            }
            if y + 1 < h {
                queue.push_back((x, y + 1));
            }
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

                let t = if f_dist > 0.0 {
                    (dist - t_dist) / f_dist
                } else {
                    1.0
                };
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
                    out.put_pixel(
                        x,
                        y,
                        image::Rgba([
                            decontam(r, bg_r),
                            decontam(g, bg_g),
                            decontam(b, bg_b),
                            new_alpha,
                        ]),
                    );
                }
            }
        }
    }
    out
}

// 배경 제거 미리보기
#[tauri::command]
pub async fn remove_white_bg_preview(
    input: String,
    threshold: u8,
    feather: u8,
    seeds: Vec<[u32; 2]>,
) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&input)?;

        // 미리보기용: 긴 변이 600px 초과 시 축소
        let (preview_img, scale) = {
            let max_side = img.width().max(img.height());
            if max_side > 600 {
                let s = 600.0 / max_side as f64;
                (
                    img.resize(600, 600, image::imageops::FilterType::Lanczos3),
                    s,
                )
            } else {
                (img, 1.0)
            }
        };

        let scaled_seeds: Vec<[u32; 2]> = seeds
            .iter()
            .map(|s| [(s[0] as f64 * scale) as u32, (s[1] as f64 * scale) as u32])
            .collect();

        let result = remove_bg(
            &preview_img,
            threshold,
            feather,
            &scaled_seeds,
            [255, 255, 255],
        );

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
pub async fn remove_white_bg_save(
    inputs: Vec<String>,
    threshold: u8,
    feather: u8,
    seeds: Vec<[u32; 2]>,
    trim: bool,
) -> Result<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut outputs = Vec::new();
        for input in &inputs {
            let img = image::open(input).map_err(|e| {
                AppError::ImageProcessing(format!("이미지 열기 실패 ({}): {}", input, e))
            })?;
            let result = remove_bg(&img, threshold, feather, &seeds, [255, 255, 255]);

            let input_path = std::path::Path::new(input);
            let parent = input_path.parent().unwrap_or(std::path::Path::new("."));
            let stem = input_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("image");
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
                    let cropped = image::imageops::crop_imm(
                        &result,
                        min_x,
                        min_y,
                        max_x - min_x + 1,
                        max_y - min_y + 1,
                    );
                    image::DynamicImage::ImageRgba8(cropped.to_image())
                } else {
                    image::DynamicImage::ImageRgba8(result)
                }
            } else {
                image::DynamicImage::ImageRgba8(result)
            };

            final_img.save_with_format(&output_path, image::ImageFormat::Png)?;

            outputs.push(
                output_path
                    .to_str()
                    .map(|s| s.to_string())
                    .ok_or_else(|| AppError::Internal("출력 경로 변환 실패".to_string()))?,
            );
        }
        Ok(outputs)
    })
    .await
    .map_err(|e| AppError::Internal(format!("배경 제거 저장 실패: {}", e)))?
}
