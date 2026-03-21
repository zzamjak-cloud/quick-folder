// 공통 헬퍼 함수 모듈
// lib.rs에서 반복되는 유틸리티 로직을 추출

use std::path::{Path, PathBuf};
use image::{imageops, RgbaImage};

/// 출력 경로 중복 회피: 이미 존재하면 suffix + 번호 추가
/// parent: 부모 디렉토리
/// stem: 파일명 (확장자 제외)
/// suffix: 접미사 (예: "_pixel", "_sheet")
/// ext: 확장자 (예: ".png") — 점(.) 포함
pub fn find_unique_path(parent: &Path, stem: &str, suffix: &str, ext: &str) -> PathBuf {
    let base = format!("{}{}{}", stem, suffix, ext);
    let mut path = parent.join(&base);
    let mut counter = 2u32;
    while path.exists() {
        path = parent.join(format!("{}{}_{}{}", stem, suffix, counter, ext));
        counter += 1;
    }
    path
}

/// 복사 대상 경로 결정: 충돌 시 "(복사)", "(복사 2)" 접미사 추가
/// parent: 대상 디렉토리
/// stem: 파일명 (확장자 제외)
/// ext: 확장자 (점 포함, 예: ".txt") — 디렉토리면 빈 문자열
/// is_dir: 디렉토리 여부
pub fn get_copy_destination(parent: &Path, stem: &str, ext: &str, is_dir: bool) -> PathBuf {
    let stem = stem.to_string();
    let ext = ext.to_string();
    let (first, pattern): (String, Box<dyn Fn(u32) -> String>) = if is_dir {
        let s = stem.clone();
        let s2 = stem.clone();
        (
            format!("{} (복사)", s),
            Box::new(move |n| format!("{} (복사 {})", s2, n)),
        )
    } else {
        let s = stem.clone();
        let e = ext.clone();
        let s2 = stem.clone();
        let e2 = ext.clone();
        (
            format!("{} (복사){}", s, e),
            Box::new(move |n| format!("{} (복사 {}){}", s2, n, e2)),
        )
    };
    let mut dest = parent.join(&first);
    let mut counter = 2u32;
    while dest.exists() {
        dest = parent.join(pattern(counter));
        counter += 1;
    }
    dest
}

/// 이미지 목록을 그리드로 배치한 스프라이트 시트 캔버스 생성
/// images: 이미지 파일 경로 목록
/// cell_width/cell_height: 각 셀 크기 (리사이즈 대상)
/// cols/rows: 그리드 열/행 수
pub fn create_sprite_canvas(
    images: &[String],
    cell_width: u32,
    cell_height: u32,
    cols: u32,
    rows: u32,
) -> Result<RgbaImage, String> {
    let canvas_w = cols * cell_width;
    let canvas_h = rows * cell_height;
    let mut canvas = RgbaImage::new(canvas_w, canvas_h);

    for (i, path) in images.iter().enumerate() {
        let idx = i as u32;
        if idx >= cols * rows {
            break;
        }

        let img = image::open(path)
            .map_err(|e| format!("이미지 열기 실패 ({}): {}", path, e))?;
        let resized = image::imageops::resize(
            &img,
            cell_width,
            cell_height,
            imageops::FilterType::Lanczos3,
        );

        let x = (idx % cols) * cell_width;
        let y = (idx / cols) * cell_height;
        imageops::overlay(&mut canvas, &resized, x as i64, y as i64);
    }

    Ok(canvas)
}
