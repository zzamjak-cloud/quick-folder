//! AI 배경 제거 전·후처리
//!
//! 모델은 정사각 1024px 확률 마스크만 준다. 이를 원본 해상도의 알파로 옮기는 과정에서
//! 품질이 갈린다.
//!
//! 1. 경계 정밀화 — Fast Guided Filter(He & Sun 2015). 원본 밝기를 가이드로 마스크를
//!    필터링하면, 확대로 뭉개진 경계가 실제 이미지 윤곽에 다시 달라붙는다.
//!    계수(A, B)는 작업 해상도(긴 변 ≤ 2048)에서 구하고 원본 해상도에서 `A·I + B` 로
//!    합성해 메모리를 원본 크기와 무관하게 묶어 둔다.
//! 2. 알파 보정 — 잔여 반투명(헤일로) 컷오프와 경계 선명도(대비) 조절.
//! 3. 색 번짐 제거 — 반투명 경계 픽셀에 섞인 배경색을 뺀다. 배경색을 단색으로 가정할 수
//!    없으므로, 주변의 배경(1-α 가중)과 전경(α 가중) 평균색을 추정해
//!    `F = (I − (1−α)·B) / α` 로 복원한다.

use image::{imageops::FilterType, RgbaImage};

use super::models::AiBgModel;
use super::AiBgOptions;

/// 계수 계산을 수행할 작업 해상도 상한 (긴 변)
const WORK_MAX_SIDE: u32 = 2048;
/// guided filter 정규화 항 — 작을수록 가이드 윤곽을 더 강하게 따른다.
/// 1e-3 은 털·피부처럼 배경과 밝기 차가 작은 경계에서 사실상 블러가 되어 1e-4 로 둔다(실측).
const GUIDED_EPS: f32 = 1e-4;
/// 이 값 이상 불투명하면 완전 불투명으로 올린다. 필터·확대가 균일한 전경 내부를
/// 0.98 언저리로 살짝 깎아 결과가 미세하게 비쳐 보이는 것을 막는다.
const OPAQUE_SNAP: f32 = 0.98;

/// 1채널 f32 평면 (행 우선)
#[derive(Clone, Debug)]
pub struct Plane {
    pub w: usize,
    pub h: usize,
    pub data: Vec<f32>,
}

impl Plane {
    fn new(w: usize, h: usize) -> Self {
        Self {
            w,
            h,
            data: vec![0.0; w * h],
        }
    }

    /// 픽셀 중심 기준 양선형 샘플링 (경계는 가장자리 값으로 고정)
    #[inline]
    fn sample(&self, x: f32, y: f32) -> f32 {
        let x = x.clamp(0.0, (self.w - 1) as f32);
        let y = y.clamp(0.0, (self.h - 1) as f32);
        let x0 = x.floor() as usize;
        let y0 = y.floor() as usize;
        let x1 = (x0 + 1).min(self.w - 1);
        let y1 = (y0 + 1).min(self.h - 1);
        let fx = x - x0 as f32;
        let fy = y - y0 as f32;
        let row0 = y0 * self.w;
        let row1 = y1 * self.w;
        let top = self.data[row0 + x0] * (1.0 - fx) + self.data[row0 + x1] * fx;
        let bottom = self.data[row1 + x0] * (1.0 - fx) + self.data[row1 + x1] * fx;
        top * (1.0 - fy) + bottom * fy
    }

    /// `(tw, th)` 해상도로 다시 샘플링한다
    fn resampled(&self, tw: usize, th: usize) -> Plane {
        let sx = self.w as f32 / tw as f32;
        let sy = self.h as f32 / th as f32;
        let mut out = Plane::new(tw, th);
        for y in 0..th {
            let src_y = (y as f32 + 0.5) * sy - 0.5;
            for x in 0..tw {
                out.data[y * tw + x] = self.sample((x as f32 + 0.5) * sx - 0.5, src_y);
            }
        }
        out
    }

    fn zip_map(&self, other: &Plane, f: impl Fn(f32, f32) -> f32) -> Plane {
        Plane {
            w: self.w,
            h: self.h,
            data: self.data.iter().zip(&other.data).map(|(&a, &b)| f(a, b)).collect(),
        }
    }
}

// ─── 전처리 ────────────────────────────────────────────────────────────────

/// 이미지를 모델 입력 텐서(NCHW, f32)로 만든다. rembg 의 `normalize` 와 같은 규칙:
/// 정사각 리사이즈 → 전체 최댓값으로 나눠 [0,1] → 채널별 (x − mean) / std.
pub fn preprocess(img: &RgbaImage, model: &AiBgModel) -> Vec<f32> {
    let size = model.input_size;
    let resized = image::imageops::resize(img, size, size, FilterType::CatmullRom);
    let max = resized
        .pixels()
        .flat_map(|p| [p[0], p[1], p[2]])
        .max()
        .unwrap_or(255)
        .max(1) as f32;

    let plane = (size * size) as usize;
    let mut out = vec![0.0f32; plane * 3];
    for (i, p) in resized.pixels().enumerate() {
        for c in 0..3 {
            out[c * plane + i] = (p[c] as f32 / max - model.mean[c]) / model.std[c];
        }
    }
    out
}

/// 모델 출력을 [0,1] 마스크로 정규화한다 (rembg 와 같이 sigmoid 후 min-max)
pub fn normalize_mask(mut raw: Vec<f32>, model: &AiBgModel) -> Plane {
    if model.sigmoid {
        for v in raw.iter_mut() {
            *v = 1.0 / (1.0 + (-*v).exp());
        }
    }
    let (mi, ma) = raw
        .iter()
        .fold((f32::MAX, f32::MIN), |(lo, hi), &v| (lo.min(v), hi.max(v)));
    if ma > mi {
        let range = ma - mi;
        for v in raw.iter_mut() {
            *v = (*v - mi) / range;
        }
    }
    let size = model.input_size as usize;
    Plane {
        w: size,
        h: size,
        data: raw,
    }
}

// ─── 필터 ─────────────────────────────────────────────────────────────────

/// 반경 r 박스 평균 (가장자리는 창 안의 실제 픽셀 수로 나눈다). 가로·세로 분리, O(N).
fn box_mean(p: &Plane, r: usize) -> Plane {
    let (w, h) = (p.w, p.h);
    let mut tmp = Plane::new(w, h);
    let mut prefix = vec![0.0f64; w.max(h) + 1];

    for y in 0..h {
        let row = &p.data[y * w..(y + 1) * w];
        for x in 0..w {
            prefix[x + 1] = prefix[x] + row[x] as f64;
        }
        for x in 0..w {
            let lo = x.saturating_sub(r);
            let hi = (x + r).min(w - 1);
            tmp.data[y * w + x] = ((prefix[hi + 1] - prefix[lo]) / (hi - lo + 1) as f64) as f32;
        }
    }

    let mut out = Plane::new(w, h);
    for x in 0..w {
        for y in 0..h {
            prefix[y + 1] = prefix[y] + tmp.data[y * w + x] as f64;
        }
        for y in 0..h {
            let lo = y.saturating_sub(r);
            let hi = (y + r).min(h - 1);
            out.data[y * w + x] = ((prefix[hi + 1] - prefix[lo]) / (hi - lo + 1) as f64) as f32;
        }
    }
    out
}

/// guided filter 계수 (A, B) — 결과는 `q = A·I + B`
fn guided_coeffs(guide: &Plane, p: &Plane, r: usize, eps: f32) -> (Plane, Plane) {
    let mean_i = box_mean(guide, r);
    let mean_p = box_mean(p, r);
    let corr_ii = box_mean(&guide.zip_map(guide, |a, b| a * b), r);
    let corr_ip = box_mean(&guide.zip_map(p, |a, b| a * b), r);

    let mut a = Plane::new(guide.w, guide.h);
    let mut b = Plane::new(guide.w, guide.h);
    for i in 0..a.data.len() {
        let var = corr_ii.data[i] - mean_i.data[i] * mean_i.data[i];
        let cov = corr_ip.data[i] - mean_i.data[i] * mean_p.data[i];
        a.data[i] = cov / (var + eps);
        b.data[i] = mean_p.data[i] - a.data[i] * mean_i.data[i];
    }
    (box_mean(&a, r), box_mean(&b, r))
}

/// 가중 평균색 (가중치 합이 거의 0이면 NaN 대신 -1 로 표시)
fn weighted_color_mean(rgb: &[Plane; 3], weight: &Plane, r: usize) -> [Plane; 3] {
    let den = box_mean(weight, r);
    let channel = |c: usize| {
        let num = box_mean(&rgb[c].zip_map(weight, |v, wgt| v * wgt), r);
        num.zip_map(&den, |n, d| if d > 1e-4 { n / d } else { -1.0 })
    };
    [channel(0), channel(1), channel(2)]
}

#[inline]
fn luminance(p: &image::Rgba<u8>) -> f32 {
    (0.299 * p[0] as f32 + 0.587 * p[1] as f32 + 0.114 * p[2] as f32) / 255.0
}

#[inline]
fn smoothstep(lo: f32, hi: f32, x: f32) -> f32 {
    let t = ((x - lo) / (hi - lo)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// 컷오프·선명도 보정 ([cutoff, OPAQUE_SNAP] 구간을 [0, 1] 로 늘린 뒤 대비 적용)
#[inline]
fn adjust_alpha(a: f32, cutoff: f32, contrast: f32) -> f32 {
    let a = if a <= cutoff {
        0.0
    } else {
        ((a - cutoff) / (OPAQUE_SNAP - cutoff)).min(1.0)
    };
    (0.5 + (a - 0.5) * contrast).clamp(0.0, 1.0)
}

// ─── 합성 ─────────────────────────────────────────────────────────────────

/// 마스크를 원본 해상도 알파로 옮기고 후처리해 RGBA 결과를 만든다.
pub fn compose(img: &RgbaImage, mask: &Plane, opts: &AiBgOptions) -> RgbaImage {
    let (w, h) = img.dimensions();
    let (wu, hu) = (w as usize, h as usize);

    // 슬라이더 값 → 보정 계수
    let cutoff = opts.cutoff.min(100) as f32 / 100.0 * 0.5;
    let contrast = 1.0 + opts.sharpness.min(100) as f32 / 100.0 * 15.0;

    // 작업 해상도
    let long = w.max(h);
    let (ww, wh) = if long > WORK_MAX_SIDE {
        let s = WORK_MAX_SIDE as f32 / long as f32;
        (((w as f32 * s).round() as u32).max(1), ((h as f32 * s).round() as u32).max(1))
    } else {
        (w, h)
    };
    let work_img;
    let work: &RgbaImage = if (ww, wh) == (w, h) {
        img
    } else {
        work_img = image::imageops::resize(img, ww, wh, FilterType::Triangle);
        &work_img
    };
    let (wwu, whu) = (ww as usize, wh as usize);

    let mut guide = Plane::new(wwu, whu);
    for (i, p) in work.pixels().enumerate() {
        guide.data[i] = luminance(p);
    }
    let alpha_work = mask.resampled(wwu, whu);

    // 1. 경계 정밀화: 반경은 마스크 확대 배율에 비례 (확대가 클수록 경계가 더 뭉개져 있다).
    //    마스크보다 작은 이미지는 축소만 일어나 경계가 이미 선명하고, 필터가 오히려 흐리게
    //    만들므로 건너뛴다.
    let upscale = wwu.max(whu) as f32 / mask.w.max(mask.h) as f32;
    let coeffs = (opts.refine_edges && upscale > 1.0).then(|| {
        let r = ((upscale * 2.0).round() as usize).max(2);
        guided_coeffs(&guide, &alpha_work, r, GUIDED_EPS)
    });

    // 3. 색 번짐 제거용 배경·전경 평균색 (작업 해상도)
    let colors = opts.decontaminate.then(|| {
        let alpha_final = match &coeffs {
            Some((a, b)) => {
                let mut q = Plane::new(wwu, whu);
                for i in 0..q.data.len() {
                    q.data[i] = adjust_alpha(a.data[i] * guide.data[i] + b.data[i], cutoff, contrast);
                }
                q
            }
            None => Plane {
                w: wwu,
                h: whu,
                data: alpha_work
                    .data
                    .iter()
                    .map(|&a| adjust_alpha(a, cutoff, contrast))
                    .collect(),
            },
        };
        let mut rgb = [Plane::new(wwu, whu), Plane::new(wwu, whu), Plane::new(wwu, whu)];
        for (i, p) in work.pixels().enumerate() {
            for c in 0..3 {
                rgb[c].data[i] = p[c] as f32;
            }
        }
        let r = (wwu.max(whu) / 96).max(3);
        let inv = Plane {
            w: wwu,
            h: whu,
            data: alpha_final.data.iter().map(|a| 1.0 - a).collect(),
        };
        let bg = weighted_color_mean(&rgb, &inv, r);
        let fg = weighted_color_mean(&rgb, &alpha_final, r);
        (bg, fg)
    });

    // 원본 해상도에서 합성
    let to_work_x = ww as f32 / w as f32;
    let to_work_y = wh as f32 / h as f32;
    let to_mask_x = mask.w as f32 / w as f32;
    let to_mask_y = mask.h as f32 / h as f32;
    let mut out = RgbaImage::new(w, h);

    for y in 0..hu {
        let wy = (y as f32 + 0.5) * to_work_y - 0.5;
        let my = (y as f32 + 0.5) * to_mask_y - 0.5;
        for x in 0..wu {
            let px = img.get_pixel(x as u32, y as u32);
            let wx = (x as f32 + 0.5) * to_work_x - 0.5;

            let raw = match &coeffs {
                Some((a, b)) => a.sample(wx, wy) * luminance(px) + b.sample(wx, wy),
                None => mask.sample((x as f32 + 0.5) * to_mask_x - 0.5, my),
            };
            let alpha = adjust_alpha(raw, cutoff, contrast) * (px[3] as f32 / 255.0);
            if alpha <= 1.0 / 255.0 {
                continue; // RgbaImage::new 가 이미 완전 투명
            }

            let mut rgb = [px[0] as f32, px[1] as f32, px[2] as f32];
            if let Some((bg, fg)) = &colors {
                if alpha < 0.99 {
                    for c in 0..3 {
                        let b = bg[c].sample(wx, wy);
                        let f = fg[c].sample(wx, wy);
                        // 추정값이 없는 영역(가중치 0)은 원래 색 유지
                        let blurred = if f >= 0.0 { f } else { rgb[c] };
                        let estimated = if b >= 0.0 {
                            (rgb[c] - (1.0 - alpha) * b) / alpha.max(0.05)
                        } else {
                            rgb[c]
                        };
                        // α 가 낮을수록 나눗셈이 잡음을 키우므로 주변 전경색 쪽으로 기운다
                        let t = smoothstep(0.05, 0.35, alpha);
                        rgb[c] = (estimated * t + blurred * (1.0 - t)).clamp(0.0, 255.0);
                    }
                }
            }

            out.put_pixel(
                x as u32,
                y as u32,
                image::Rgba([
                    rgb[0].round() as u8,
                    rgb[1].round() as u8,
                    rgb[2].round() as u8,
                    (alpha * 255.0).round() as u8,
                ]),
            );
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(refine: bool, decontaminate: bool) -> AiBgOptions {
        AiBgOptions {
            cutoff: 0,
            sharpness: 0,
            refine_edges: refine,
            decontaminate,
        }
    }

    #[test]
    fn box_mean_of_constant_plane_is_constant() {
        let p = Plane {
            w: 7,
            h: 5,
            data: vec![0.25; 35],
        };
        let m = box_mean(&p, 3);
        assert!(m.data.iter().all(|v| (v - 0.25).abs() < 1e-6));
    }

    #[test]
    fn adjust_alpha_cutoff_and_contrast() {
        assert_eq!(adjust_alpha(0.1, 0.2, 1.0), 0.0);
        assert!((adjust_alpha(0.59, 0.2, 1.0) - 0.5).abs() < 1e-6);
        assert_eq!(adjust_alpha(0.985, 0.0, 1.0), 1.0);
        // 대비를 크게 올리면 이진에 가까워진다
        assert_eq!(adjust_alpha(0.8, 0.0, 16.0), 1.0);
        assert_eq!(adjust_alpha(0.2, 0.0, 16.0), 0.0);
    }

    /// 마스크가 가리키는 영역만 남고, 바깥은 완전 투명해야 한다
    #[test]
    fn compose_keeps_masked_region_only() {
        // 흰 배경 위 빨간 정사각형 (64x64 중 가운데 32x32)
        let img = RgbaImage::from_fn(64, 64, |x, y| {
            if (16..48).contains(&x) && (16..48).contains(&y) {
                image::Rgba([220, 30, 30, 255])
            } else {
                image::Rgba([255, 255, 255, 255])
            }
        });
        // 저해상도(16x16) 마스크: 가운데 8x8 이 전경
        let mut mask = Plane::new(16, 16);
        for y in 4..12 {
            for x in 4..12 {
                mask.data[y * 16 + x] = 1.0;
            }
        }

        for (refine, decon) in [(false, false), (true, false), (true, true)] {
            let out = compose(&img, &mask, &opts(refine, decon));
            assert_eq!(out.get_pixel(0, 0)[3], 0, "refine={refine}");
            assert_eq!(out.get_pixel(63, 63)[3], 0, "refine={refine}");
            let center = out.get_pixel(32, 32);
            assert_eq!(center[3], 255, "refine={refine}");
            assert_eq!(&center.0[..3], &[220, 30, 30], "refine={refine}");
        }
    }

    /// 경계 정밀화는 확대로 번진 마스크를 실제 이미지 윤곽에 다시 맞춘다
    #[test]
    fn refine_edges_snaps_alpha_to_image_edges() {
        let img = RgbaImage::from_fn(64, 64, |x, y| {
            if (16..48).contains(&x) && (16..48).contains(&y) {
                image::Rgba([20, 20, 20, 255])
            } else {
                image::Rgba([240, 240, 240, 255])
            }
        });
        let mut mask = Plane::new(16, 16);
        for y in 4..12 {
            for x in 4..12 {
                mask.data[y * 16 + x] = 1.0;
            }
        }
        // 윤곽 바로 바깥 픽셀(15, 32): 양선형 확대만 하면 반투명이 남는다
        let plain = compose(&img, &mask, &opts(false, false));
        let refined = compose(&img, &mask, &opts(true, false));
        assert!(plain.get_pixel(15, 32)[3] > 0);
        assert!(refined.get_pixel(15, 32)[3] < plain.get_pixel(15, 32)[3]);
        // 윤곽 바로 안쪽(16, 32)은 정밀화 후 더 불투명해야 한다
        assert!(refined.get_pixel(16, 32)[3] > plain.get_pixel(16, 32)[3]);
    }

    /// 원본이 이미 투명한 픽셀은 마스크와 상관없이 투명하게 남는다
    #[test]
    fn compose_respects_source_alpha() {
        let img = RgbaImage::from_pixel(8, 8, image::Rgba([10, 200, 10, 0]));
        let mask = Plane {
            w: 4,
            h: 4,
            data: vec![1.0; 16],
        };
        let out = compose(&img, &mask, &opts(true, true));
        assert!(out.pixels().all(|p| p[3] == 0));
    }
}
