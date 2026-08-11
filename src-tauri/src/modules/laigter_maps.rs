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
    /// 타일링 텍스처 여부 — 켜면 경계를 wrap(주기) 샘플링해 이음새 없는 맵 생성
    #[serde(default = "default_tile")]
    pub tile: bool,
}

/// 구버전 설정에 tile 필드가 없을 때 기본값 (타일링 켜짐)
fn default_tile() -> bool {
    true
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
            tile: true,
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

/// 경계 밖 좌표 처리 — 타일링이면 wrap(주기 반복), 아니면 가장자리 clamp
#[inline]
fn edge_index(pos: isize, len: usize, tile: bool) -> usize {
    if tile {
        pos.rem_euclid(len as isize) as usize
    } else {
        pos.clamp(0, len as isize - 1) as usize
    }
}

fn blur_separable(
    buf: &[f32],
    width: usize,
    height: usize,
    kernel: &[f32],
    tile: bool,
) -> Vec<f32> {
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
                let cx = edge_index(ox, width, tile);
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
                let cy = edge_index(oy, height, tile);
                s += kv * tmp[cy * width + x];
            }
            out[y * width + x] = s;
        }
    }
    out
}

fn sobel_gradients(h: &[f32], width: usize, height: usize, tile: bool) -> (Vec<f32>, Vec<f32>) {
    let mut gx = vec![0f32; width * height];
    let mut gy = vec![0f32; width * height];
    for y in 0..height {
        for x in 0..width {
            let idx = y * width + x;
            // 가장자리도 건너뛰지 않고 wrap/clamp 샘플링으로 기울기 계산 (외곽 단색·타일링 이음새 방지)
            let hm1 = |dx: isize, dy: isize| -> f32 {
                let nx = edge_index(x as isize + dx, width, tile);
                let ny = edge_index(y as isize + dy, height, tile);
                h[ny * width + nx]
            };
            gx[idx] = -hm1(-1, -1) + hm1(1, -1) - 2.0 * hm1(-1, 0) + 2.0 * hm1(1, 0) - hm1(-1, 1)
                + hm1(1, 1);
            gy[idx] = -hm1(-1, -1) - 2.0 * hm1(0, -1) - hm1(1, -1)
                + hm1(-1, 1)
                + 2.0 * hm1(0, 1)
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
fn generate_maps_from_rgba(
    img: &RgbaImage,
    params: &LaigterParams,
) -> Result<(RgbaImage, RgbaImage, RgbaImage, RgbaImage)> {
    let width = img.width() as usize;
    let height = img.height() as usize;
    if width < 2 || height < 2 {
        return Err(AppError::InvalidInput("이미지가 너무 작습니다".to_string()));
    }

    let mut h = rgba_to_height(img, params.height_invert);
    let kernel = gaussian_kernel_1d(params.blur_sigma.max(0.0));
    h = blur_separable(&h, width, height, &kernel, params.tile);

    let (gx, gy) = sobel_gradients(&h, width, height, params.tile);

    let bump = params.bump_strength.max(0.01);
    let y_sign = if params.normal_y_flip {
        -1.0_f32
    } else {
        1.0_f32
    };

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

            // 가장자리 평면 노멀 강제 제거 — 모든 픽셀에서 기울기로 노멀 계산
            let sx = gx[idx] * bump;
            let sy = gy[idx] * bump * y_sign;
            let mut nx = -sx;
            let mut ny = -sy;
            let mut nz = 1.0_f32;
            let len = (nx * nx + ny * ny + nz * nz).sqrt().max(1e-6);
            nx /= len;
            ny /= len;
            nz /= len;

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
                    let nx = edge_index(x as isize + dx as isize, width, params.tile);
                    let ny = edge_index(y as isize + dy as isize, height, params.tile);
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

#[cfg(test)]
mod tests {
    use super::*;

    /// 가로·세로 모두 정확히 한 주기인 사인 패턴 이미지 생성 (완전 타일링 가능)
    fn periodic_image(w: u32, h: u32) -> RgbaImage {
        let mut img = RgbaImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                let fx = x as f32 / w as f32 * std::f32::consts::TAU;
                let fy = y as f32 / h as f32 * std::f32::consts::TAU;
                let v = ((fx.sin() * 0.5 + 0.5) * 0.6 + (fy.cos() * 0.5 + 0.5) * 0.4) * 255.0;
                let v = v.round().clamp(0.0, 255.0) as u8;
                img.put_pixel(x, y, Rgba([v, v, v, 255]));
            }
        }
        img
    }

    /// 이미지를 (dx, dy)만큼 순환 이동 (타일링 등가 이미지 생성)
    fn rolled(img: &RgbaImage, dx: u32, dy: u32) -> RgbaImage {
        let (w, h) = (img.width(), img.height());
        let mut out = RgbaImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                out.put_pixel((x + dx) % w, (y + dy) % h, *img.get_pixel(x, y));
            }
        }
        out
    }

    /// 두 이미지의 채널별 최대 오차 허용 비교
    fn assert_images_close(a: &RgbaImage, b: &RgbaImage, tol: u8, label: &str) {
        assert_eq!(a.dimensions(), b.dimensions());
        for (pa, pb) in a.pixels().zip(b.pixels()) {
            for c in 0..3 {
                let d = (pa[c] as i16 - pb[c] as i16).unsigned_abs();
                assert!(
                    d <= tol as u16,
                    "{}: 채널 오차 {} > 허용치 {}",
                    label,
                    d,
                    tol
                );
            }
        }
    }

    /// 타일링 텍스처는 순환 이동해도 같은 노멀맵이 나와야 함 (경계 이음새 없음)
    #[test]
    fn normal_map_is_seamless_for_tiling_texture() {
        let img = periodic_image(16, 16);
        let params = LaigterParams::default();

        let (n1, _, _, _) = generate_maps_from_rgba(&img, &params).unwrap();
        let (n2, _, _, _) = generate_maps_from_rgba(&rolled(&img, 5, 3), &params).unwrap();

        // 원본 노멀맵을 같은 양만큼 이동시킨 결과와 일치해야 함
        assert_images_close(&rolled(&n1, 5, 3), &n2, 1, "노멀맵 이동 불변성");
    }

    /// x=0 열의 (R,G) 종류 수 — 1이면 가장자리 전체가 단색(평면 노멀 강제) 상태
    fn border_color_variety(normal: &RgbaImage) -> usize {
        let mut colors = std::collections::HashSet::new();
        for y in 0..normal.height() {
            let p = normal.get_pixel(0, y);
            colors.insert((p[0], p[1]));
        }
        colors.len()
    }

    /// 가장자리 픽셀이 평면 노멀 단색으로 강제되지 않아야 함
    #[test]
    fn border_normals_are_not_forced_flat() {
        let img = periodic_image(16, 16);
        let params = LaigterParams::default();
        let (normal, _, _, _) = generate_maps_from_rgba(&img, &params).unwrap();

        // 주기 패턴이므로 x=0 열에도 y에 따라 변하는 기울기가 존재해야 함
        assert!(
            border_color_variety(&normal) > 1,
            "x=0 열 전체가 단색으로 처리됨 (외곽 단색 버그)"
        );
    }

    /// 타일링 꺼짐(clamp 샘플링)에서도 가장자리가 평면 단색으로 강제되지 않아야 함
    #[test]
    fn border_normals_not_flat_without_tiling() {
        let img = periodic_image(16, 16);
        let params = LaigterParams {
            tile: false,
            ..LaigterParams::default()
        };
        let (normal, _, _, _) = generate_maps_from_rgba(&img, &params).unwrap();

        assert!(
            border_color_variety(&normal) > 1,
            "tile=false에서도 외곽이 단색으로 처리됨"
        );
    }
}
