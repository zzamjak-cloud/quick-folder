//! 이미지 연산 골든 테스트
//!
//! 코어 분리 리팩토링(quickfolder-core 추출) 중 이미지 처리 결과가 미세하게
//! 달라지는 것을 잡기 위한 회귀 그물. 인코딩된 파일 바이트 대신 디코딩한
//! RGBA 픽셀 버퍼를 해싱하므로, 인코더 버전 차이에는 둔감하고 알고리즘
//! 변경에는 민감하다.
//!
//! 골든 값 갱신: `UPDATE_GOLDEN=1 cargo test --test image_golden`
//! (알고리즘을 의도적으로 바꿨을 때만 실행할 것)

use app_lib::{
    compress_image, convert_to_ico, crop_image, pixelate_image, remove_white_bg_save, resize_image,
};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const GOLDEN_FILE: &str = "tests/golden/image_ops.txt";

// ───────────────────────── 테스트 디렉토리 ─────────────────────────

struct TestDir {
    path: PathBuf,
}

impl TestDir {
    fn new(name: &str) -> Self {
        let path = std::env::temp_dir().join(format!(
            "quickfolder_image_golden_{}_{}_{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("시스템 시간 오류")
                .as_nanos()
        ));
        fs::create_dir_all(&path).expect("테스트 디렉토리 생성 실패");
        Self { path }
    }

    fn join(&self, child: &str) -> PathBuf {
        self.path.join(child)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

// ───────────────────────── 입력 이미지 생성 ─────────────────────────

/// 결정적 테스트 이미지: 색상 변화가 충분해 양자화·리샘플링 차이가 드러난다.
fn make_base_image() -> image::RgbaImage {
    image::RgbaImage::from_fn(64, 64, |x, y| {
        image::Rgba([
            (x * 4) as u8,
            (y * 4) as u8,
            ((x ^ y) * 4) as u8,
            255,
        ])
    })
}

/// 흰 배경 + 중앙 컬러 블록: 배경 제거 연산용.
fn make_white_bg_image() -> image::RgbaImage {
    image::RgbaImage::from_fn(64, 64, |x, y| {
        if (16..48).contains(&x) && (16..48).contains(&y) {
            image::Rgba([(x * 3) as u8, 64, 200, 255])
        } else {
            image::Rgba([255, 255, 255, 255])
        }
    })
}

fn write_png(dir: &TestDir, name: &str, img: &image::RgbaImage) -> String {
    let path = dir.join(name);
    img.save_with_format(&path, image::ImageFormat::Png)
        .expect("PNG 저장 실패");
    path_string(&path)
}

fn write_jpg(dir: &TestDir, name: &str, img: &image::RgbaImage) -> String {
    let path = dir.join(name);
    image::DynamicImage::ImageRgba8(img.clone())
        .to_rgb8()
        .save_with_format(&path, image::ImageFormat::Jpeg)
        .expect("JPEG 저장 실패");
    path_string(&path)
}

fn path_string(path: &Path) -> String {
    path.to_str().expect("경로 문자열 변환 실패").to_string()
}

// ───────────────────────── 해시 ─────────────────────────

/// FNV-1a 64bit — 외부 의존성 없이 결정적 해시를 얻기 위한 최소 구현.
fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// 결과 파일의 원시 바이트 지문. `image` 크레이트가 디코딩하지 못하는
/// 컨테이너 포맷(ICO 등)에만 사용한다. 인코더 버전 변경에 민감하다.
fn fingerprint_raw(path: &str) -> String {
    let bytes = fs::read(path).unwrap_or_else(|e| panic!("결과 파일 읽기 실패 ({}): {}", path, e));
    format!("raw{}:{:016x}", bytes.len(), fnv1a64(&bytes))
}

/// 결과 이미지의 지문: `{너비}x{높이}:{픽셀해시}`
fn fingerprint(path: &str) -> String {
    let img = image::open(path)
        .unwrap_or_else(|e| panic!("결과 이미지 열기 실패 ({}): {}", path, e))
        .to_rgba8();
    format!(
        "{}x{}:{:016x}",
        img.width(),
        img.height(),
        fnv1a64(img.as_raw())
    )
}

// ───────────────────────── 골든 파일 입출력 ─────────────────────────

fn golden_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(GOLDEN_FILE)
}

fn load_golden() -> BTreeMap<String, String> {
    let path = golden_path();
    let Ok(text) = fs::read_to_string(&path) else {
        return BTreeMap::new();
    };
    text.lines()
        .filter(|line| !line.trim().is_empty() && !line.starts_with('#'))
        .filter_map(|line| {
            let (k, v) = line.split_once('=')?;
            Some((k.trim().to_string(), v.trim().to_string()))
        })
        .collect()
}

fn save_golden(map: &BTreeMap<String, String>) {
    let mut out =
        String::from("# 이미지 연산 골든 지문 — UPDATE_GOLDEN=1 로 재생성\n# 형식: 연산=너비x높이:픽셀FNV1a64\n");
    for (k, v) in map {
        out.push_str(&format!("{}={}\n", k, v));
    }
    let path = golden_path();
    fs::create_dir_all(path.parent().expect("골든 디렉토리 없음")).expect("골든 디렉토리 생성 실패");
    fs::write(&path, out).expect("골든 파일 쓰기 실패");
}

fn updating() -> bool {
    std::env::var("UPDATE_GOLDEN").is_ok_and(|v| v == "1")
}

// ───────────────────────── 실제 지문 수집 ─────────────────────────

/// 모든 대상 연산을 실행해 지문 맵을 만든다.
fn collect_fingerprints() -> BTreeMap<String, String> {
    let dir = TestDir::new("collect");
    let base = make_base_image();
    let mut map = BTreeMap::new();

    tauri::async_runtime::block_on(async {
        // 픽셀화 — 양자화 포함/미포함 두 경로
        let src = write_png(&dir, "base_pixelate.png", &base);
        let out = pixelate_image(src.clone(), 8, 0, 0)
            .await
            .expect("pixelate_image 실패");
        map.insert("pixelate_basic".to_string(), fingerprint(&out));

        let out = pixelate_image(src, 4, 32, 16)
            .await
            .expect("pixelate_image(양자화) 실패");
        map.insert("pixelate_quantized".to_string(), fingerprint(&out));

        // 리사이즈 — Lanczos3 경로
        let src = write_png(&dir, "base_resize.png", &base);
        let out = resize_image(src, 40, 24).await.expect("resize_image 실패");
        map.insert("resize_lanczos".to_string(), fingerprint(&out));

        // 크롭
        let src = write_png(&dir, "base_crop.png", &base);
        let out = crop_image(src, 8, 12, 32, 20)
            .await
            .expect("crop_image 실패");
        map.insert("crop".to_string(), fingerprint(&out));

        // 압축 — PNG(무손실) / JPEG(손실) 각각
        let src = write_png(&dir, "base_compress.png", &base);
        let out = compress_image(src, "high".to_string())
            .await
            .expect("compress_image(png) 실패");
        map.insert("compress_png_high".to_string(), fingerprint(&out));

        let src = write_jpg(&dir, "base_compress.jpg", &base);
        let out = compress_image(src, "medium".to_string())
            .await
            .expect("compress_image(jpg) 실패");
        map.insert("compress_jpg_medium".to_string(), fingerprint(&out));

        // ICO 변환
        let src = write_png(&dir, "base_ico.png", &base);
        // ICO는 image 크레이트가 되읽지 못하는 경우가 있어 원시 바이트로 비교한다.
        let out = convert_to_ico(src).await.expect("convert_to_ico 실패");
        map.insert("convert_ico".to_string(), fingerprint_raw(&out));

        // 흰 배경 제거
        let src = write_png(&dir, "base_whitebg.png", &make_white_bg_image());
        let outs = remove_white_bg_save(vec![src], 240, 0, vec![], false)
            .await
            .expect("remove_white_bg_save 실패");
        let out = outs.first().expect("배경 제거 결과 없음");
        map.insert("remove_white_bg".to_string(), fingerprint(out));
    });

    map
}

// ───────────────────────── 테스트 ─────────────────────────

#[test]
fn image_operations_match_golden_fingerprints() {
    let actual = collect_fingerprints();

    if updating() {
        save_golden(&actual);
        eprintln!("골든 지문 {}개 갱신: {}", actual.len(), golden_path().display());
        return;
    }

    let expected = load_golden();
    assert!(
        !expected.is_empty(),
        "골든 파일이 비어 있다. 최초 1회 `UPDATE_GOLDEN=1 cargo test --test image_golden` 로 생성할 것: {}",
        golden_path().display()
    );

    let mut diffs = Vec::new();
    for (name, want) in &expected {
        match actual.get(name) {
            Some(got) if got == want => {}
            Some(got) => diffs.push(format!("  {}: 기대 {} / 실제 {}", name, want, got)),
            None => diffs.push(format!("  {}: 연산이 실행되지 않음", name)),
        }
    }
    for name in actual.keys() {
        if !expected.contains_key(name) {
            diffs.push(format!("  {}: 골든에 없는 신규 연산", name));
        }
    }

    assert!(
        diffs.is_empty(),
        "이미지 연산 결과가 골든과 다르다 (리팩토링이 출력을 바꿨는지 확인):\n{}",
        diffs.join("\n")
    );
}
