//! 이미지 픽셀화 모듈

use crate::helpers::find_unique_path;
use crate::error::{AppError, Result};

// ───────────────────────── 튜닝 상수 ─────────────────────────

/// 셀 대표색을 뽑을 때 쓰는 중앙 영역 비율.
/// 셀 가장자리는 인접 블록과 섞인 안티앨리어싱 픽셀이라 제외한다.
const CORE_RATIO: f32 = 0.6;
/// 알파 이진화 임계값 — 이 값 미만은 투명으로 본다.
const ALPHA_THRESHOLD: u8 = 128;
/// 최빈색 버킷 키의 채널당 비트 절삭량 (5bit RGB로 묶어 미세한 계조 차이를 같은 색으로 취급).
const MODE_BUCKET_SHIFT: u8 = 3;
/// 격자 위상을 인정할 최소 enrichment. 이 미만이면 격자 없음으로 보고 위상 0을 쓴다.
const MIN_PHASE_ENRICHMENT: f32 = 1.35;
/// k-means 반복 횟수 (결정론적이며 이 정도면 수렴한다).
const KMEANS_ITERATIONS: usize = 12;

/// 격자 정보 — 축별 셀 경계 목록 `[start, end)`
struct Grid {
    xs: Vec<(u32, u32)>,
    ys: Vec<(u32, u32)>,
}

impl Grid {
    fn cols(&self) -> u32 {
        self.xs.len() as u32
    }
    fn rows(&self) -> u32 {
        self.ys.len() as u32
    }
}

fn apply_pixelate(
    img: &image::DynamicImage,
    pixel_size: u32,
    output_size: u32,
    max_colors: u32,
) -> image::DynamicImage {
    let src = img.to_rgba8();
    let cell = resolve_cell(&src, pixel_size);
    // output_size == 0 은 "원본 크기 유지" — 결과가 원본 캔버스를 빈틈없이 덮어야 하므로
    // 격자 위상 앞에 남는 자투리 영역도 셀 하나로 포함한다.
    let keep_original = output_size == 0;
    let (logical, grid) = build_logical(&src, cell, keep_original);
    finish_pixelate(&logical, &grid, src.width(), src.height(), output_size, max_colors)
}

/// 셀 크기는 이미지 밖으로 나갈 수 없다
fn resolve_cell(src: &image::RgbaImage, pixel_size: u32) -> u32 {
    pixel_size.clamp(1, src.width().max(src.height()).max(1))
}

/// 1단계 — 격자를 잡고 셀 대표색만 모은 **논리 이미지**를 만든다.
///
/// 여기가 전체 비용의 대부분이고(위상 감지 + 전체 픽셀 주사), 컬러 수와는 무관하다.
/// 그래서 미리보기는 이 결과를 셀 크기별로 캐시해 두고 재사용한다.
fn build_logical(
    src: &image::RgbaImage,
    cell: u32,
    keep_original: bool,
) -> (image::RgbaImage, Grid) {
    let grid = resolve_grid(src, cell, keep_original);
    let logical = downsample_to_logical(src, &grid);
    (logical, grid)
}

/// 2단계 — 논리 이미지에 팔레트를 적용하고 출력 규격으로 편다.
fn finish_pixelate(
    logical: &image::RgbaImage,
    grid: &Grid,
    width: u32,
    height: u32,
    output_size: u32,
    max_colors: u32,
) -> image::DynamicImage {
    let mut logical = logical.clone();
    if max_colors > 0 && max_colors < 256 {
        quantize_colors(&mut logical, max_colors as usize);
    }

    if output_size == 0 {
        // 논리 픽셀을 원래 셀 영역에 그대로 되칠해 크기를 정확히 보존한다.
        return image::DynamicImage::ImageRgba8(expand_to_grid(&logical, grid, width, height));
    }

    // 정수배 확대만 사용한다. 소수 배율은 블록 폭이 들쭉날쭉해져 픽셀이 다시 뭉개진다.
    let logical_max = logical.width().max(logical.height()).max(1);
    let factor = (output_size / logical_max).max(1);
    image::DynamicImage::ImageRgba8(upscale_nearest(&logical, factor))
}

// ───────────────────────── 격자 ─────────────────────────

/// 셀 크기에서 격자를 만든다. 위상은 원본의 경계와 가장 잘 맞는 값을 찾아 쓴다.
fn resolve_grid(img: &image::RgbaImage, cell: u32, include_leading: bool) -> Grid {
    let (offset_x, offset_y) = detect_phase(img, cell);
    Grid {
        xs: cell_bounds(img.width(), cell, offset_x, include_leading),
        ys: cell_bounds(img.height(), cell, offset_y, include_leading),
    }
}

/// 한 축의 셀 경계 목록.
///
/// `include_leading` 이면 위상 앞의 자투리(`0..offset`)도 셀로 넣는다.
/// 축소 출력에서는 그 자투리가 블록 하나를 통째로 차지해 비율을 망치므로 버리고,
/// 원본 크기 유지에서는 캔버스에 구멍이 생기지 않도록 살린다.
fn cell_bounds(len: u32, cell: u32, offset: u32, include_leading: bool) -> Vec<(u32, u32)> {
    let mut out = Vec::new();
    if len == 0 {
        return vec![(0, 1)];
    }
    if include_leading && offset > 0 {
        out.push((0, offset.min(len)));
    }
    let mut start = offset;
    while start < len {
        let end = (start + cell).min(len);
        out.push((start, end));
        start = end;
    }
    if out.is_empty() {
        out.push((0, len));
    }
    out
}

/// 격자 위상 감지.
///
/// 원본에 이미 픽셀 격자가 있는 이미지(AI가 그린 픽셀아트 등)는 블록 경계가
/// 0에서 시작하지 않을 수 있다. 어긋난 채로 자르면 한 블록이 두 색에 걸쳐
/// 경계가 흐려진다. 셀 경계 후보마다 "그 선 위에 실제 색 변화가 얼마나 몰려 있는지"를
/// 재서 가장 잘 맞는 위상을 고른다.
///
/// 격자가 없는 일반 사진은 어느 위상이든 점수가 비슷해 enrichment가 1 근처에 머문다.
/// 그때는 위상 0(기존 동작)으로 폴백한다.
fn detect_phase(img: &image::RgbaImage, cell: u32) -> (u32, u32) {
    if cell < 2 {
        return (0, 0);
    }
    let col_edges = column_edge_strength(img);
    let row_edges = row_edge_strength(img);
    (
        best_offset(&col_edges, cell),
        best_offset(&row_edges, cell),
    )
}

/// x 위치별 세로 경계 강도 (좌우 픽셀 차이의 합)
///
/// 원시 버퍼를 행 우선으로 훑는다. `get_pixel` 로 열을 따라 내려가면 매 접근이 한 행씩
/// 건너뛰어 캐시를 계속 놓친다. 누적 순서(x 별로 y 오름차순)는 그대로라 결과는 같다.
fn column_edge_strength(img: &image::RgbaImage) -> Vec<f32> {
    let (w, h) = (img.width() as usize, img.height() as usize);
    let raw = img.as_raw();
    let mut out = vec![0.0f32; w];
    if w < 2 {
        return out;
    }
    for y in 0..h {
        let row = &raw[y * w * 4..(y + 1) * w * 4];
        // 이웃 픽셀 쌍을 반복자로 짝지어 경계 검사를 없앤다
        let pairs = row.chunks_exact(4).zip(row[4..].chunks_exact(4));
        for (slot, (a, b)) in out[1..].iter_mut().zip(pairs) {
            *slot += pixel_distance(a, b);
        }
    }
    out
}

/// y 위치별 가로 경계 강도
fn row_edge_strength(img: &image::RgbaImage) -> Vec<f32> {
    let (w, h) = (img.width() as usize, img.height() as usize);
    let raw = img.as_raw();
    let mut out = vec![0.0f32; h];
    if h < 2 {
        return out;
    }
    let rows = raw.chunks_exact(w * 4).zip(raw[w * 4..].chunks_exact(w * 4));
    for (slot, (prev, cur)) in out[1..].iter_mut().zip(rows) {
        *slot = prev
            .chunks_exact(4)
            .zip(cur.chunks_exact(4))
            .map(|(a, b)| pixel_distance(a, b))
            .sum();
    }
    out
}

/// 색 + 알파 차이. 외곽선은 알파로 표현되는 경우가 많아 알파도 함께 본다.
fn pixel_distance(a: &[u8], b: &[u8]) -> f32 {
    let dr = a[0] as f32 - b[0] as f32;
    let dg = a[1] as f32 - b[1] as f32;
    let db = a[2] as f32 - b[2] as f32;
    let da = a[3] as f32 - b[3] as f32;
    (dr.abs() + dg.abs() + db.abs() + da.abs()) / 4.0
}

/// 경계 강도 배열에서 가장 잘 맞는 격자 위상을 고른다.
fn best_offset(edges: &[f32], cell: u32) -> u32 {
    let total: f32 = edges.iter().sum();
    if total <= f32::EPSILON || edges.len() < cell as usize * 2 {
        return 0;
    }
    let mean = total / edges.len() as f32;
    if mean <= f32::EPSILON {
        return 0;
    }

    let mut best = (0u32, 0.0f32);
    for offset in 0..cell {
        let mut sum = 0.0f32;
        let mut count = 0usize;
        let mut pos = offset as usize;
        while pos < edges.len() {
            sum += edges[pos];
            count += 1;
            pos += cell as usize;
        }
        if count == 0 {
            continue;
        }
        let enrichment = (sum / count as f32) / mean;
        if enrichment > best.1 {
            best = (offset, enrichment);
        }
    }

    if best.1 >= MIN_PHASE_ENRICHMENT {
        best.0
    } else {
        0
    }
}

// ───────────────────────── 다운샘플 ─────────────────────────

/// 격자대로 잘라 논리 해상도 이미지를 만든다.
fn downsample_to_logical(img: &image::RgbaImage, grid: &Grid) -> image::RgbaImage {
    let mut out = image::RgbaImage::new(grid.cols(), grid.rows());
    let mut scratch = ModeScratch::new();

    for (ry, &(start_y, end_y)) in grid.ys.iter().enumerate() {
        for (rx, &(start_x, end_x)) in grid.xs.iter().enumerate() {
            let color =
                cell_representative_color(img, start_x, start_y, end_x, end_y, &mut scratch);
            out.put_pixel(rx as u32, ry as u32, color);
        }
    }
    out
}

/// 논리 픽셀을 원래 셀 영역에 되칠해 원본 해상도 결과를 만든다.
///
/// 픽셀 단위 `put_pixel` 대신 **한 행을 채우고 나머지 행은 통째로 복사**한다. 같은 색이
/// 가로로 `cell` 개, 세로로 `cell` 줄 반복되므로 행 복사가 그대로 들어맞는다.
fn expand_to_grid(
    logical: &image::RgbaImage,
    grid: &Grid,
    width: u32,
    height: u32,
) -> image::RgbaImage {
    let mut out = image::RgbaImage::new(width, height);
    let stride = width as usize * 4;
    let buf: &mut [u8] = &mut out;

    for (ry, &(y0, y1)) in grid.ys.iter().enumerate() {
        if y0 >= height {
            break;
        }
        let y1 = y1.min(height);
        let row_start = y0 as usize * stride;
        for (rx, &(x0, x1)) in grid.xs.iter().enumerate() {
            let color = logical.get_pixel(rx as u32, ry as u32).0;
            for x in x0..x1.min(width) {
                let i = row_start + x as usize * 4;
                buf[i..i + 4].copy_from_slice(&color);
            }
        }
        for y in (y0 + 1)..y1 {
            let (done, rest) = buf.split_at_mut(y as usize * stride);
            rest[..stride].copy_from_slice(&done[row_start..row_start + stride]);
        }
    }
    out
}

/// 최빈색 집계용 재사용 버퍼.
///
/// 셀마다 `HashMap` 을 새로 만들면 해싱과 할당이 픽셀화 시간의 절반을 먹는다. 버킷 키가
/// 15비트뿐이라 배열 하나로 충분하다. 이미지당 한 번 잡아 두고, 셀마다 **건드린 키만**
/// 되돌린다(전체를 지우면 셀 수 x 32768 이 되어 오히려 느리다).
struct ModeScratch {
    /// 버킷별 (개수, r 합, g 합, b 합)
    buckets: Vec<(u32, u32, u32, u32)>,
    /// 이번 셀에서 값이 들어간 버킷 키 (오름차순은 아니므로 정렬해 쓴다)
    touched: Vec<u16>,
}

const MODE_BUCKET_COUNT: usize = 1 << 15;

impl ModeScratch {
    fn new() -> Self {
        Self {
            buckets: vec![(0, 0, 0, 0); MODE_BUCKET_COUNT],
            touched: Vec::with_capacity(64),
        }
    }

    fn clear(&mut self) {
        for &key in &self.touched {
            self.buckets[key as usize] = (0, 0, 0, 0);
        }
        self.touched.clear();
    }
}

/// 셀 하나의 대표색.
///
/// 평균도 단일 샘플도 쓰지 않는다. 평균은 흐린 경계를 섞어 원본에 없던 중간색을 만들고,
/// 단일 샘플(Nearest)은 하필 경계 픽셀이 뽑히면 그 색이 블록 전체를 대표해 버린다.
/// 셀 중앙 코어의 **최빈색**을 쓰고, 알파는 코어 과반 기준으로 0/255로 이진화한다.
/// 알파를 이진화하지 않으면 반투명 외곽 블록이 그대로 남아 외곽선이 뿌옇게 보인다.
fn cell_representative_color(
    img: &image::RgbaImage,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    scratch: &mut ModeScratch,
) -> image::Rgba<u8> {
    let cell_w = end_x - start_x;
    let cell_h = end_y - start_y;
    let inset_x = ((cell_w as f32 * (1.0 - CORE_RATIO)) / 2.0).floor() as u32;
    let inset_y = ((cell_h as f32 * (1.0 - CORE_RATIO)) / 2.0).floor() as u32;
    let (core_x0, core_x1) = if cell_w > 2 {
        (start_x + inset_x, (end_x - inset_x).max(start_x + inset_x + 1))
    } else {
        (start_x, end_x)
    };
    let (core_y0, core_y1) = if cell_h > 2 {
        (start_y + inset_y, (end_y - inset_y).max(start_y + inset_y + 1))
    } else {
        (start_y, end_y)
    };

    // 5bit RGB 버킷별 집계 — 미세한 계조 차이를 같은 색으로 묶는다
    scratch.clear();
    let mut opaque = 0u32;
    let mut total = 0u32;

    let w = img.width() as usize;
    let raw = img.as_raw();
    for y in core_y0..core_y1.min(img.height()) {
        let row = &raw[y as usize * w * 4..(y as usize + 1) * w * 4];
        for x in core_x0..core_x1.min(img.width()) {
            total += 1;
            let p = &row[x as usize * 4..x as usize * 4 + 4];
            if p[3] < ALPHA_THRESHOLD {
                continue;
            }
            opaque += 1;
            let key = (((p[0] >> MODE_BUCKET_SHIFT) as u16) << 10)
                | (((p[1] >> MODE_BUCKET_SHIFT) as u16) << 5)
                | ((p[2] >> MODE_BUCKET_SHIFT) as u16);
            let e = &mut scratch.buckets[key as usize];
            if e.0 == 0 {
                scratch.touched.push(key);
            }
            e.0 += 1;
            e.1 += p[0] as u32;
            e.2 += p[1] as u32;
            e.3 += p[2] as u32;
        }
    }

    // 코어 과반이 투명하면 투명으로 확정 (알파 이진화)
    if total == 0 || opaque * 2 < total {
        return image::Rgba([0, 0, 0, 0]);
    }

    // 동률일 때 결과가 흔들리지 않도록 버킷 키를 tie-breaker로 쓴다 (개수가 같으면 작은 키)
    let mut best: Option<(u32, u16)> = None;
    for &key in &scratch.touched {
        let count = scratch.buckets[key as usize].0;
        let better = match best {
            None => true,
            Some((bc, bk)) => count > bc || (count == bc && key < bk),
        };
        if better {
            best = Some((count, key));
        }
    }
    match best {
        Some((count, key)) if count > 0 => {
            let v = scratch.buckets[key as usize];
            image::Rgba([
                (v.1 / count) as u8,
                (v.2 / count) as u8,
                (v.3 / count) as u8,
                255,
            ])
        }
        _ => image::Rgba([0, 0, 0, 0]),
    }
}

/// 정수배 최근접 확대 — 한 행을 만들고 나머지 행은 복사한다
fn upscale_nearest(img: &image::RgbaImage, factor: u32) -> image::RgbaImage {
    if factor <= 1 {
        return img.clone();
    }
    let (lw, lh) = (img.width(), img.height());
    let mut out = image::RgbaImage::new(lw * factor, lh * factor);
    let stride = (lw * factor) as usize * 4;
    let buf: &mut [u8] = &mut out;

    for ly in 0..lh {
        let row_start = (ly * factor) as usize * stride;
        for lx in 0..lw {
            let color = img.get_pixel(lx, ly).0;
            for k in 0..factor {
                let i = row_start + (lx * factor + k) as usize * 4;
                buf[i..i + 4].copy_from_slice(&color);
            }
        }
        for k in 1..factor {
            let (done, rest) = buf.split_at_mut((ly * factor + k) as usize * stride);
            rest[..stride].copy_from_slice(&done[row_start..row_start + stride]);
        }
    }
    out
}

// ───────────────────────── 팔레트 양자화 ─────────────────────────

/// 팔레트를 만들어 각 픽셀을 최근접 색으로 스냅한다.
fn quantize_colors(img: &mut image::RgbaImage, max_colors: usize) {
    let mut histogram: std::collections::HashMap<[u8; 3], u32> = std::collections::HashMap::new();
    for p in img.pixels() {
        if p.0[3] < ALPHA_THRESHOLD {
            continue;
        }
        *histogram.entry([p.0[0], p.0[1], p.0[2]]).or_insert(0) += 1;
    }
    if histogram.is_empty() {
        return;
    }
    // 고유색이 목표 이하면 손댈 이유가 없다
    if histogram.len() <= max_colors {
        return;
    }

    let mut colors: Vec<([u8; 3], u32)> = histogram.into_iter().collect();
    // 해시맵 순서에 결과가 좌우되지 않도록 정렬해 결정론성을 보장한다
    colors.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));

    let palette = build_palette(&colors, max_colors);

    for pixel in img.pixels_mut() {
        if pixel.0[3] < ALPHA_THRESHOLD {
            continue;
        }
        let rgb = [pixel.0[0], pixel.0[1], pixel.0[2]];
        let nearest = &palette[nearest_color_index(&palette, rgb)];
        pixel.0[0] = nearest[0];
        pixel.0[1] = nearest[1];
        pixel.0[2] = nearest[2];
    }
}

/// 빈도 가중 최원점(maximin) 초기화 + k-means.
///
/// median-cut을 쓰지 않는 이유: 균등 인구 분할은 색 클러스터 경계를 존중하지 않아
/// 인접한 두 색을 하나로 합치고 다른 색을 둘로 쪼개는 초기값을 만든다.
/// k-means는 그 지역해에서 빠져나오지 못한다.
/// 최원점 초기화는 난수 없이 결정론적이면서 클러스터마다 하나씩 잡아준다.
fn build_palette(colors: &[([u8; 3], u32)], max_colors: usize) -> Vec<[u8; 3]> {
    let k = max_colors.min(colors.len()).max(1);
    let mut centers: Vec<[u8; 3]> = Vec::with_capacity(k);
    // 가장 흔한 색에서 시작 (정렬돼 있으므로 첫 항목)
    centers.push(colors[0].0);

    // 각 색의 "가장 가까운 센터까지의 거리제곱". 센터를 추가할 때마다 새 센터와의 거리로
    // min 갱신만 하면 된다 — 매번 전체 센터를 다시 훑으면 O(k^2 x 색수)가 된다.
    let mut nearest: Vec<u32> = colors
        .iter()
        .map(|(color, _)| color_distance_sq(*color, centers[0]))
        .collect();

    while centers.len() < k {
        let mut best: Option<([u8; 3], u64)> = None;
        for ((color, count), near) in colors.iter().zip(nearest.iter()) {
            // 점수 = 빈도 x 최근접거리제곱 — 드문 노이즈 색이 팔레트를 차지하지 않게 한다
            let score = *near as u64 * *count as u64;
            if best.map_or(true, |(_, b)| score > b) {
                best = Some((*color, score));
            }
        }
        match best {
            Some((color, score)) if score > 0 => {
                centers.push(color);
                for ((c, _), near) in colors.iter().zip(nearest.iter_mut()) {
                    *near = (*near).min(color_distance_sq(*c, color));
                }
            }
            _ => break,
        }
    }

    // k-means: 빈도를 가중치로 쓴다
    for _ in 0..KMEANS_ITERATIONS {
        let mut sums = vec![(0u64, 0u64, 0u64, 0u64); centers.len()];
        for (color, count) in colors {
            let idx = nearest_color_index(&centers, *color);
            let w = *count as u64;
            sums[idx].0 += color[0] as u64 * w;
            sums[idx].1 += color[1] as u64 * w;
            sums[idx].2 += color[2] as u64 * w;
            sums[idx].3 += w;
        }
        let mut moved = false;
        for (i, s) in sums.iter().enumerate() {
            if s.3 == 0 {
                continue;
            }
            let next = [
                (s.0 / s.3) as u8,
                (s.1 / s.3) as u8,
                (s.2 / s.3) as u8,
            ];
            if next != centers[i] {
                centers[i] = next;
                moved = true;
            }
        }
        if !moved {
            break;
        }
    }

    centers
}

fn color_distance_sq(a: [u8; 3], b: [u8; 3]) -> u32 {
    let dr = a[0] as i32 - b[0] as i32;
    let dg = a[1] as i32 - b[1] as i32;
    let db = a[2] as i32 - b[2] as i32;
    (dr * dr + dg * dg + db * db) as u32
}

fn nearest_color_index(palette: &[[u8; 3]], color: [u8; 3]) -> usize {
    let mut best = (0usize, u32::MAX);
    for (i, c) in palette.iter().enumerate() {
        let d = color_distance_sq(color, *c);
        if d < best.1 {
            best = (i, d);
        }
    }
    best.0
}

// ───────────────────────── 미리보기 캐시 ─────────────────────────

/// 셀 크기별 논리 이미지를 몇 개까지 들고 있을지. 논리 이미지는 원본의 1/셀² 크기라
/// 가벼우므로, 슬라이더를 오가며 같은 픽셀 크기로 돌아오는 경우를 넉넉히 받아 준다.
const PREVIEW_LOGICAL_CACHE: usize = 8;
/// 이보다 큰 이미지는 원본을 들고 있지 않는다 (40MP RGBA ≈ 160MB).
const PREVIEW_CACHE_MAX_PIXELS: u64 = 40_000_000;

/// 양자화 전 논리 이미지와 그것을 만든 격자
type LogicalEntry = std::sync::Arc<(image::RgbaImage, Grid)>;

/// 픽셀화 팝업이 열려 있는 동안만 사는 캐시.
///
/// 팝업에서는 옵션을 조금씩 바꿔 가며 몇십 번씩 다시 그린다. 파일 디코딩과 논리 이미지
/// 생성(위상 감지 + 전체 픽셀 주사)이 비용의 대부분인데, 둘 다 컬러 수와는 무관하다.
/// 한 파일분만 들고 있다가 팝업이 닫힐 때 `clear_pixelate_preview_cache` 로 즉시 버린다.
struct PreviewCache {
    path: String,
    /// 파일이 바뀌었는지 보는 표식 (크기, 수정 시각)
    stamp: (u64, Option<std::time::SystemTime>),
    source: std::sync::Arc<image::RgbaImage>,
    /// (셀 크기, 원본 크기 유지) → 양자화 전 논리 이미지와 격자
    logical: Vec<((u32, bool), LogicalEntry)>,
}

static PREVIEW_CACHE: std::sync::Mutex<Option<PreviewCache>> = std::sync::Mutex::new(None);

/// 파일 변경 감지용 표식. 읽기에 실패하면 캐시가 안 맞는 쪽으로 판정되게 둔다.
fn file_stamp(path: &str) -> (u64, Option<std::time::SystemTime>) {
    match std::fs::metadata(path) {
        Ok(m) => (m.len(), m.modified().ok()),
        Err(_) => (0, None),
    }
}

/// 픽셀화 미리보기 캐시를 비운다. 팝업을 닫을 때 호출한다.
pub fn clear_pixelate_preview_cache() {
    if let Ok(mut guard) = PREVIEW_CACHE.lock() {
        *guard = None;
    }
}

/// 디코딩된 원본을 캐시에서 얻는다. 없으면 열어서 넣는다.
fn cached_source(path: &str) -> Result<std::sync::Arc<image::RgbaImage>> {
    let stamp = file_stamp(path);
    if let Ok(guard) = PREVIEW_CACHE.lock() {
        if let Some(cache) = guard.as_ref() {
            if cache.path == path && cache.stamp == stamp {
                return Ok(cache.source.clone());
            }
        }
    }

    // RGBA로 한 번만 변환해 둔다 — 호출마다 변환하면 큰 이미지에서 그것만으로 수십 ms다
    let img = std::sync::Arc::new(image::open(path)?.to_rgba8());
    let pixels = img.width() as u64 * img.height() as u64;
    if pixels <= PREVIEW_CACHE_MAX_PIXELS {
        if let Ok(mut guard) = PREVIEW_CACHE.lock() {
            // 다른 파일을 보기 시작했으면 이전 항목은 통째로 버린다 (한 파일분만 유지)
            *guard = Some(PreviewCache {
                path: path.to_string(),
                stamp,
                source: img.clone(),
                logical: Vec::new(),
            });
        }
    }
    Ok(img)
}

/// 논리 이미지를 캐시에서 얻는다. 없으면 만들어서 넣는다.
fn cached_logical(
    path: &str,
    source: &image::RgbaImage,
    cell: u32,
    keep_original: bool,
) -> LogicalEntry {
    let key = (cell, keep_original);
    if let Ok(guard) = PREVIEW_CACHE.lock() {
        if let Some(cache) = guard.as_ref() {
            if cache.path == path {
                if let Some((_, entry)) = cache.logical.iter().find(|(k, _)| *k == key) {
                    return entry.clone();
                }
            }
        }
    }

    let entry = std::sync::Arc::new(build_logical(source, cell, keep_original));
    if let Ok(mut guard) = PREVIEW_CACHE.lock() {
        if let Some(cache) = guard.as_mut() {
            if cache.path == path {
                cache.logical.push((key, entry.clone()));
                if cache.logical.len() > PREVIEW_LOGICAL_CACHE {
                    cache.logical.remove(0);
                }
            }
        }
    }
    entry
}

// 픽셀레이트 미리보기: 저장될 결과와 **완전히 같은 이미지**를 base64 PNG로 돌려준다.
//
// 예전에는 속도를 위해 300px로 줄인 뒤 픽셀화했는데, 축소본에 셀을 다시 잡는 것은 사실상
// 다른 계산이라(Lanczos 평균 vs 셀 코어 최빈색) 미리보기와 저장 결과의 색이 달랐다.
// 지금은 같은 경로를 그대로 돌리고, 대신 비싼 단계(디코딩·논리 이미지)를 캐시해 만회한다.
// 캐시는 `clear_pixelate_preview_cache` 로 해제한다.
pub async fn pixelate_preview(
    input: String,
    pixel_size: u32,
    scale: u32,
    max_colors: u32,
) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        // 디코딩본 (캐시 적중 시 파일을 다시 읽지 않는다)
        let source = cached_source(&input)?;
        let cell = resolve_cell(&source, pixel_size);
        let keep_original = scale == 0;

        // 논리 이미지 (캐시 적중 시 위상 감지와 전체 주사를 건너뛴다)
        let entry = cached_logical(&input, &source, cell, keep_original);
        let pixelated = finish_pixelate(
            &entry.0,
            &entry.1,
            source.width(),
            source.height(),
            scale,
            max_colors,
        );

        // PNG로 인코딩 후 base64 문자열 반환 (data:image 접두사 없음)
        let mut buf = vec![];
        pixelated.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;

        use base64::Engine;
        Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
    })
    .await
    .map_err(|e| AppError::Internal(format!("픽셀레이트 미리보기 실패: {}", e)))?
}

// 픽셀레이트 저장: 픽셀화 후 {stem}_pixel.png 파일로 저장, 경로 반환.
// scale 0 = 원본 크기 그대로 유지, 그 외 = 긴 변이 scale 이하가 되도록 정수배 확대.
pub async fn pixelate_image(
    input: String,
    pixel_size: u32,
    scale: u32,
    max_colors: u32,
) -> Result<String> {
    tokio::task::spawn_blocking(move || {
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

#[cfg(test)]
mod tests {
    use super::*;

    /// 안티앨리어싱된 외곽선을 가진 원 — 반투명 경계가 생기는 전형적 입력
    fn antialiased_disc(size: u32, radius: f32) -> image::DynamicImage {
        let center = size as f32 / 2.0;
        let img = image::RgbaImage::from_fn(size, size, |x, y| {
            let dx = x as f32 + 0.5 - center;
            let dy = y as f32 + 0.5 - center;
            let d = (dx * dx + dy * dy).sqrt();
            // 경계 1px 구간을 부드럽게 — 여기서 반투명 픽셀이 만들어진다
            let alpha = ((radius - d + 0.5).clamp(0.0, 1.0) * 255.0) as u8;
            image::Rgba([200, 80, 60, alpha])
        });
        image::DynamicImage::ImageRgba8(img)
    }

    #[test]
    fn output_has_no_semi_transparent_pixels() {
        let src = antialiased_disc(64, 24.0);
        // 입력에는 반투명 픽셀이 실제로 존재해야 테스트가 의미를 가진다
        let src_semi = src
            .to_rgba8()
            .pixels()
            .filter(|p| p.0[3] > 0 && p.0[3] < 255)
            .count();
        assert!(src_semi > 0, "입력에 반투명 픽셀이 없으면 검증이 무의미하다");

        let out = apply_pixelate(&src, 4, 0, 0).to_rgba8();
        let out_semi = out.pixels().filter(|p| p.0[3] > 0 && p.0[3] < 255).count();
        assert_eq!(out_semi, 0, "알파가 이진화돼 반투명 외곽이 남으면 안 된다");
    }

    #[test]
    fn upscale_factor_is_an_exact_integer_multiple() {
        let src = antialiased_disc(64, 24.0);
        // 논리 16x16 → 목표 100 이면 배율 6 → 96. 소수 배율로 100을 만들지 않는다.
        let out = apply_pixelate(&src, 4, 100, 0);
        assert_eq!(out.width(), 96);
        assert_eq!(out.height(), 96);
    }

    #[test]
    fn blocks_are_uniform_after_upscale() {
        let src = antialiased_disc(64, 24.0);
        let out = apply_pixelate(&src, 4, 64, 0).to_rgba8();
        let factor = 4; // 논리 16 → 64
        for by in (0..out.height()).step_by(factor) {
            for bx in (0..out.width()).step_by(factor) {
                let first = *out.get_pixel(bx, by);
                for dy in 0..factor as u32 {
                    for dx in 0..factor as u32 {
                        assert_eq!(
                            *out.get_pixel(bx + dx, by + dy),
                            first,
                            "블록 내부가 균일해야 한다 ({},{})",
                            bx,
                            by
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn palette_size_is_respected() {
        // 계조가 많은 그라데이션에서 색 수를 6개로 줄인다
        let img = image::RgbaImage::from_fn(48, 48, |x, y| {
            image::Rgba([(x * 5) as u8, (y * 5) as u8, 128, 255])
        });
        let out = apply_pixelate(&image::DynamicImage::ImageRgba8(img), 4, 0, 6).to_rgba8();
        let colors: std::collections::HashSet<[u8; 3]> = out
            .pixels()
            .filter(|p| p.0[3] > 0)
            .map(|p| [p.0[0], p.0[1], p.0[2]])
            .collect();
        assert!(colors.len() <= 6, "팔레트 색 수 초과: {}", colors.len());
    }

    #[test]
    fn detects_grid_phase_when_blocks_are_offset() {
        // 3px 밀린 8px 격자 — 위상을 못 잡으면 블록이 두 색에 걸친다
        let offset = 3u32;
        let cell = 8u32;
        let img = image::RgbaImage::from_fn(64, 64, |x, y| {
            let bx = (x + cell - offset) / cell;
            let by = (y + cell - offset) / cell;
            let v = if (bx + by) % 2 == 0 { 30u8 } else { 220u8 };
            image::Rgba([v, v, v, 255])
        });
        let (ox, oy) = detect_phase(&img, cell);
        assert_eq!(ox, offset, "가로 위상 감지 실패");
        assert_eq!(oy, offset, "세로 위상 감지 실패");
    }

    #[test]
    fn falls_back_to_zero_phase_without_a_grid() {
        // 격자가 없는 부드러운 그라데이션 — 억지로 위상을 잡으면 안 된다
        let img = image::RgbaImage::from_fn(64, 64, |x, y| {
            image::Rgba([(x * 3) as u8, (y * 3) as u8, 100, 255])
        });
        let (ox, oy) = detect_phase(&img, 8);
        assert_eq!((ox, oy), (0, 0), "격자가 없으면 위상 0으로 폴백해야 한다");
    }

    #[test]
    fn cell_color_ignores_blurred_border_pixels() {
        // 중앙 코어는 순수 빨강, 가장자리 1px만 다른 색 — 최빈색은 빨강이어야 한다
        let img = image::RgbaImage::from_fn(8, 8, |x, y| {
            if x == 0 || y == 0 || x == 7 || y == 7 {
                image::Rgba([0, 0, 255, 255])
            } else {
                image::Rgba([255, 0, 0, 255])
            }
        });
        let c = cell_representative_color(&img, 0, 0, 8, 8, &mut ModeScratch::new());
        assert_eq!(c.0[0], 255, "코어의 최빈색(빨강)이 나와야 한다");
        assert_eq!(c.0[2], 0, "가장자리 파랑이 섞이면 안 된다");
    }

    #[test]
    fn mostly_transparent_cell_becomes_fully_transparent() {
        let img = image::RgbaImage::from_fn(8, 8, |x, _| {
            if x < 6 {
                image::Rgba([0, 0, 0, 0])
            } else {
                image::Rgba([255, 0, 0, 255])
            }
        });
        let c = cell_representative_color(&img, 0, 0, 8, 8, &mut ModeScratch::new());
        assert_eq!(c.0[3], 0, "코어 과반이 투명하면 투명으로 확정돼야 한다");
    }
    #[test]
    fn keeps_original_dimensions_when_output_size_is_zero() {
        // 셀 크기로 나누어떨어지지 않는 크기 — 자투리 셀까지 덮어야 한다
        let src = antialiased_disc(70, 26.0);
        let out = apply_pixelate(&src, 6, 0, 0);
        assert_eq!((out.width(), out.height()), (70, 70));
    }

    #[test]
    fn original_size_output_covers_the_whole_canvas() {
        // 위상이 밀린 격자여도 좌·상단 자투리가 빈 채로 남으면 안 된다
        let offset = 3u32;
        let cell = 8u32;
        let img = image::RgbaImage::from_fn(64, 64, |x, y| {
            let bx = (x + cell - offset) / cell;
            let by = (y + cell - offset) / cell;
            let v = if (bx + by) % 2 == 0 { 30u8 } else { 220u8 };
            image::Rgba([v, v, v, 255])
        });
        let out = apply_pixelate(&image::DynamicImage::ImageRgba8(img), cell, 0, 0).to_rgba8();
        assert_eq!((out.width(), out.height()), (64, 64));
        // 원본이 전부 불투명했으므로 결과에도 투명 픽셀이 없어야 한다(= 칠해지지 않은 영역 없음)
        assert_eq!(
            out.pixels().filter(|p| p.0[3] == 0).count(),
            0,
            "자투리 영역이 칠해지지 않았다"
        );
    }

    #[test]
    fn original_size_output_is_still_blocky() {
        // 크기를 유지해도 셀 안은 단색이어야 한다 — 그게 "픽셀 정리"의 핵심
        let src = antialiased_disc(64, 24.0);
        let cell = 8u32;
        let out = apply_pixelate(&src, cell, 0, 0).to_rgba8();
        for by in (0..out.height()).step_by(cell as usize) {
            for bx in (0..out.width()).step_by(cell as usize) {
                let first = *out.get_pixel(bx, by);
                for dy in 0..cell {
                    for dx in 0..cell {
                        assert_eq!(
                            *out.get_pixel(bx + dx, by + dy),
                            first,
                            "셀 내부가 균일해야 한다 ({},{})",
                            bx,
                            by
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn output_size_one_yields_logical_resolution() {
        // scale 1 = 확대 없이 논리 해상도 그대로 (64 / 8 = 8)
        let src = antialiased_disc(64, 24.0);
        let out = apply_pixelate(&src, 8, 1, 0);
        assert_eq!((out.width(), out.height()), (8, 8));
    }

    /// 미리보기와 저장 결과는 **같은 이미지**여야 한다.
    /// 예전처럼 미리보기만 축소본으로 계산하면 색이 달라져 미리보기를 믿을 수 없게 된다.
    #[test]
    fn preview_matches_the_saved_output() {
        let dir = std::env::temp_dir().join(format!("qf_pixelate_same_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        // 미리보기 축소(300px)가 걸릴 만큼 큰 입력이어야 검증이 의미를 가진다
        let file = dir.join("src.png");
        antialiased_disc(800, 320.0).save(&file).unwrap();
        let path = file.to_string_lossy().to_string();

        for (scale, colors) in [(0u32, 0u32), (0, 16), (1, 8)] {
            clear_pixelate_preview_cache();
            let (preview, saved) = crate::runtime::block_on(async {
                let preview = pixelate_preview(path.clone(), 6, scale, colors)
                    .await
                    .expect("미리보기");
                let out = pixelate_image(path.clone(), 6, scale, colors)
                    .await
                    .expect("저장");
                let saved = image::open(&out).expect("저장 결과 열기").to_rgba8();
                let _ = std::fs::remove_file(&out);
                (preview, saved)
            });

            use base64::Engine;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(&preview)
                .expect("base64 디코딩");
            let preview_img = image::load_from_memory(&bytes).expect("미리보기 디코딩").to_rgba8();

            assert_eq!(
                (preview_img.width(), preview_img.height()),
                (saved.width(), saved.height()),
                "scale={} colors={} 규격이 달라졌다",
                scale,
                colors
            );
            assert!(
                preview_img.as_raw() == saved.as_raw(),
                "scale={} colors={} 픽셀이 달라졌다",
                scale,
                colors
            );
        }

        clear_pixelate_preview_cache();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn preview_cache_is_dropped_on_clear() {
        let dir = std::env::temp_dir().join(format!("qf_pixelate_cache_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("src.png");
        antialiased_disc(64, 24.0).save(&file).unwrap();
        let path = file.to_string_lossy().to_string();

        clear_pixelate_preview_cache();
        let first = cached_source(&path).expect("첫 디코딩");
        let second = cached_source(&path).expect("캐시 적중");
        assert!(
            std::sync::Arc::ptr_eq(&first, &second),
            "두 번째 호출은 같은 디코딩본을 돌려줘야 한다"
        );

        clear_pixelate_preview_cache();
        let third = cached_source(&path).expect("해제 후 재디코딩");
        assert!(
            !std::sync::Arc::ptr_eq(&first, &third),
            "캐시를 비웠으면 새로 디코딩해야 한다"
        );

        clear_pixelate_preview_cache();
        let _ = std::fs::remove_dir_all(&dir);
    }

}
