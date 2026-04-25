//! Laigter 스타일 맵 생성: 노멀, 파랄락스(높이), 스펙큘러, 오클루전
//! 미리보기/보내기 공통 파이프라인 (Laigter README·fshader.glsl 흐름에 맞춤)

use base64::Engine;
use image::{ImageFormat, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

use crate::helpers::find_unique_path;
use crate::modules::error::{AppError, Result};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaigterParams {
    /// 높이맵에서 노멀 범프 강도
    pub bump_strength: f32,
    /// 높이맵 가우시안 블러 (0에 가깝면 스킵)
    pub blur_sigma: f32,
    pub height_invert: bool,
    /// 텍스처 공간 Y 아래 방향 기준 노멀 Y 뒤집기 (DirectX 스타일 등)
    pub normal_y_flip: bool,
    pub specular_exponent: f32,
    /// 0=원본 명도 위주, 1=높이 기울기 위주
    pub specular_gradient_mix: f32,
    pub specular_gain: f32,
    pub occlusion_strength: f32,
}

impl Default for LaigterParams {
    fn default() -> Self {
        Self {
            bump_strength: 2.5,
            blur_sigma: 1.2,
            height_invert: false,
            normal_y_flip: true,
            specular_exponent: 8.0,
            specular_gradient_mix: 0.45,
            specular_gain: 1.0,
            occlusion_strength: 0.85,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaigterExportOptions {
    pub save_normal: bool,
    pub save_parallax: bool,
    pub save_specular: bool,
    pub save_occlusion: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaigterMapsPreviewResponse {
    pub diffuse: String,
    pub normal: String,
    pub parallax: String,
    pub specular: String,
    pub occlusion: String,
    pub width: u32,
    pub height: u32,
}

fn luminance_rgba(p: &Rgba<u8>) -> f32 {
    (0.299_f32 * p[0] as f32 + 0.587 * p[1] as f32 + 0.114 * p[2] as f32) / 255.0
}

fn rgba_to_height(img: &RgbaImage, invert: bool) -> Vec<f32> {
    let w = img.width() as usize;
    let h = img.height() as usize;
    let mut v = vec![0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let mut t = luminance_rgba(img.get_pixel(x as u32, y as u32));
            if invert {
                t = 1.0 - t;
            }
            v[y * w + x] = t.clamp(0.0, 1.0);
        }
    }
    v
}

fn gaussian_kernel_1d(sigma: f32) -> Vec<f32> {
    if sigma < 0.05 {
        return vec![1.0];
    }
    let radius = ((sigma * 3.0).ceil() as i32).clamp(1, 8);
    let two_sigma2 = 2.0 * sigma * sigma;
    let mut k = Vec::new();
    let mut sum = 0f32;
    for i in -radius..=radius {
        let x = i as f32;
        let v = (-(x * x) / two_sigma2).exp();
        k.push(v);
        sum += v;
    }
    for x in k.iter_mut() {
        *x /= sum;
    }
    k
}

fn blur_separable(buf: &[f32], width: usize, height: usize, kernel: &[f32]) -> Vec<f32> {
    if kernel.len() <= 1 {
        return buf.to_vec();
    }
    let r = kernel.len() / 2;
    let mut tmp = vec![0f32; width * height];
    let mut out = vec![0f32; width * height];

    for y in 0..height {
        for x in 0..width {
            let mut s = 0f32;
            for (ki, &kv) in kernel.iter().enumerate() {
                let ox = x as isize + ki as isize - r as isize;
                let cx = ox.clamp(0, width as isize - 1) as usize;
                s += kv * buf[y * width + cx];
            }
            tmp[y * width + x] = s;
        }
    }

    for y in 0..height {
        for x in 0..width {
            let mut s = 0f32;
            for (ki, &kv) in kernel.iter().enumerate() {
                let oy = y as isize + ki as isize - r as isize;
                let cy = oy.clamp(0, height as isize - 1) as usize;
                s += kv * tmp[cy * width + x];
            }
            out[y * width + x] = s;
        }
    }
    out
}

fn sobel_gradients(h: &[f32], width: usize, height: usize) -> (Vec<f32>, Vec<f32>) {
    let mut gx = vec![0f32; width * height];
    let mut gy = vec![0f32; width * height];
    for y in 0..height {
        for x in 0..width {
            let idx = y * width + x;
            if x == 0 || x + 1 == width || y == 0 || y + 1 == height {
                continue;
            }
            let hm1 = |dx: isize, dy: isize| -> f32 {
                let nx = (x as isize + dx).clamp(0, width as isize - 1) as usize;
                let ny = (y as isize + dy).clamp(0, height as isize - 1) as usize;
                h[ny * width + nx]
            };
            gx[idx] = -hm1(-1, -1) + hm1(1, -1) - 2.0 * hm1(-1, 0) + 2.0 * hm1(1, 0) - hm1(-1, 1)
                + hm1(1, 1);
            gy[idx] = -hm1(-1, -1) - 2.0 * hm1(0, -1) - hm1(1, -1) + hm1(-1, 1) + 2.0 * hm1(0, 1)
                + hm1(1, 1);
        }
    }
    (gx, gy)
}

fn encode_png_b64(img: &RgbaImage) -> Result<String> {
    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
        .map_err(|e| AppError::ImageProcessing(e.to_string()))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
}

/// (normal, parallax height RGB, specular RGB, occlusion RGB)
fn generate_maps_from_rgba(img: &RgbaImage, params: &LaigterParams) -> Result<(RgbaImage, RgbaImage, RgbaImage, RgbaImage)> {
    let width = img.width() as usize;
    let height = img.height() as usize;
    if width < 2 || height < 2 {
        return Err(AppError::InvalidInput("이미지가 너무 작습니다".to_string()));
    }

    let mut h = rgba_to_height(img, params.height_invert);
    let kernel = gaussian_kernel_1d(params.blur_sigma.max(0.0));
    h = blur_separable(&h, width, height, &kernel);

    let (gx, gy) = sobel_gradients(&h, width, height);

    let bump = params.bump_strength.max(0.01);
    let y_sign = if params.normal_y_flip { -1.0_f32 } else { 1.0_f32 };

    let mut normal_img = RgbaImage::new(width as u32, height as u32);
    let mut parallax_img = RgbaImage::new(width as u32, height as u32);
    let mut spec_img = RgbaImage::new(width as u32, height as u32);
    let mut occ_img = RgbaImage::new(width as u32, height as u32);

    let mix = params.specular_gradient_mix.clamp(0.0, 1.0);
    let exp = params.specular_exponent.max(0.1).min(128.0);
    let sgain = params.specular_gain.max(0.0).min(4.0);
    let occ_s = params.occlusion_strength.max(0.0).min(2.5);

    for y in 0..height {
        for x in 0..width {
            let idx = y * width + x;
            let p = *img.get_pixel(x as u32, y as u32);
            let lum = luminance_rgba(&p);

            let (nx, ny, nz) = if x == 0 || x + 1 == width || y == 0 || y + 1 == height {
                (0.0_f32, 0.0_f32, 1.0_f32)
            } else {
                let sx = gx[idx] * bump;
                let sy = gy[idx] * bump * y_sign;
                let mut nx = -sx;
                let mut ny = -sy;
                let mut nz = 1.0_f32;
                let len = (nx * nx + ny * ny + nz * nz).sqrt().max(1e-6);
                nx /= len;
                ny /= len;
                nz /= len;
                (nx, ny, nz)
            };

            let r = ((nx * 0.5 + 0.5).clamp(0.0, 1.0) * 255.0) as u8;
            let g = ((ny * 0.5 + 0.5).clamp(0.0, 1.0) * 255.0) as u8;
            let b = ((nz * 0.5 + 0.5).clamp(0.0, 1.0) * 255.0) as u8;
            normal_img.put_pixel(x as u32, y as u32, Rgba([r, g, b, 255]));

            let hv = (h[idx].clamp(0.0, 1.0) * 255.0) as u8;
            parallax_img.put_pixel(x as u32, y as u32, Rgba([hv, hv, hv, 255]));

            let gmag = ((gx[idx] * gx[idx] + gy[idx] * gy[idx]).sqrt() * 2.0).min(1.0);
            let mut s = lum * (1.0 - mix) + gmag * mix;
            s = s.clamp(0.0, 1.0).powf(exp / 16.0) * sgain;
            s = s.clamp(0.0, 1.0);
            let sv = (s * 255.0) as u8;
            spec_img.put_pixel(x as u32, y as u32, Rgba([sv, sv, sv, 255]));

            let mut occ_acc = 0f32;
            let hc = h[idx];
            for dy in -1..=1i32 {
                for dx in -1..=1i32 {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    let nx = (x as i32 + dx).clamp(0, width as i32 - 1) as usize;
                    let ny = (y as i32 + dy).clamp(0, height as i32 - 1) as usize;
                    let hn = h[ny * width + nx];
                    occ_acc += (hn - hc).max(0.0);
                }
            }
            occ_acc /= 8.0;
            let ao = (1.0 - occ_s * occ_acc * 2.0).clamp(0.0, 1.0);
            let ov = (ao * 255.0) as u8;
            occ_img.put_pixel(x as u32, y as u32, Rgba([ov, ov, ov, 255]));
        }
    }

    Ok((normal_img, parallax_img, spec_img, occ_img))
}

fn resize_max_side(img: &image::DynamicImage, max_side: u32) -> RgbaImage {
    let (w, h) = (img.width(), img.height());
    let m = w.max(h);
    if m <= max_side {
        return img.to_rgba8();
    }
    let scale = max_side as f32 / m as f32;
    let nw = ((w as f32 * scale).round() as u32).max(1);
    let nh = ((h as f32 * scale).round() as u32).max(1);
    img.resize(nw, nh, image::imageops::FilterType::Lanczos3)
        .to_rgba8()
}

/// Laigter 스타일 맵 미리보기 (base64 PNG들)
#[tauri::command]
pub async fn laigter_maps_preview(
    input: String,
    params: LaigterParams,
    max_side: Option<u32>,
) -> Result<LaigterMapsPreviewResponse> {
    let max_side = max_side.unwrap_or(512).clamp(64, 1024);
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&input)?;
        let rgba = resize_max_side(&img, max_side);
        let (normal, parallax, specular, occlusion) = generate_maps_from_rgba(&rgba, &params)?;

        Ok(LaigterMapsPreviewResponse {
            diffuse: encode_png_b64(&rgba)?,
            normal: encode_png_b64(&normal)?,
            parallax: encode_png_b64(&parallax)?,
            specular: encode_png_b64(&specular)?,
            occlusion: encode_png_b64(&occlusion)?,
            width: rgba.width(),
            height: rgba.height(),
        })
    })
    .await
    .map_err(|e| AppError::Internal(format!("맵 미리보기 작업 실패: {}", e)))?
}

/// 선택한 맵만 PNG로 저장 (파일 경로 목록 반환)
#[tauri::command]
pub async fn laigter_maps_export(
    input: String,
    params: LaigterParams,
    options: LaigterExportOptions,
) -> Result<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&input)?;
        let rgba = img.to_rgba8();
        let (normal, parallax, specular, occlusion) = generate_maps_from_rgba(&rgba, &params)?;

        let input_path = std::path::Path::new(&input);
        let parent = input_path.parent().unwrap_or(std::path::Path::new("."));
        let stem = input_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("texture");

        let mut outputs = Vec::new();

        if options.save_normal {
            let path = find_unique_path(parent, stem, "_normal", ".png");
            normal.save_with_format(&path, ImageFormat::Png)?;
            outputs.push(
                path.to_str()
                    .ok_or_else(|| AppError::Internal("경로 변환 실패".to_string()))?
                    .to_string(),
            );
        }
        if options.save_parallax {
            let path = find_unique_path(parent, stem, "_parallax", ".png");
            parallax.save_with_format(&path, ImageFormat::Png)?;
            outputs.push(
                path.to_str()
                    .ok_or_else(|| AppError::Internal("경로 변환 실패".to_string()))?
                    .to_string(),
            );
        }
        if options.save_specular {
            let path = find_unique_path(parent, stem, "_specular", ".png");
            specular.save_with_format(&path, ImageFormat::Png)?;
            outputs.push(
                path.to_str()
                    .ok_or_else(|| AppError::Internal("경로 변환 실패".to_string()))?
                    .to_string(),
            );
        }
        if options.save_occlusion {
            let path = find_unique_path(parent, stem, "_occlusion", ".png");
            occlusion.save_with_format(&path, ImageFormat::Png)?;
            outputs.push(
                path.to_str()
                    .ok_or_else(|| AppError::Internal("경로 변환 실패".to_string()))?
                    .to_string(),
            );
        }

        if outputs.is_empty() {
            return Err(AppError::InvalidInput(
                "저장할 맵 종류를 하나 이상 선택하세요".to_string(),
            ));
        }

        Ok(outputs)
    })
    .await
    .map_err(|e| AppError::Internal(format!("맵보내기 실패: {}", e)))?
}
