//! 공통 헬퍼 함수 모듈
//!
//! lib.rs와 여러 모듈에서 반복되는 유틸리티 로직을 추출한 모듈.
//!
//! # 주요 기능
//!
//! - 경로 중복 회피 (`find_unique_path`, `get_copy_destination`)
//! - 이미지 처리 (`create_sprite_canvas`)
//! - 파일 시스템 유틸리티 (`create_file_entry`, `is_hidden_file`, `is_system_file`)

use std::path::{Path, PathBuf};
use image::{imageops, RgbaImage};

// modules::types import (FileEntry, FileType, classify_file)
use crate::modules::types::{FileEntry, FileType, classify_file};
use crate::modules::error::{AppError, Result};

/// 출력 경로 중복 회피: 이미 존재하면 suffix + 번호 추가
///
/// 파일 생성 시 기존 파일과 이름이 겹치지 않도록 자동으로 번호를 추가합니다.
/// 예: `test_pixel.png` → `test_pixel_2.png` → `test_pixel_3.png`
///
/// # 인자
///
/// - `parent` - 부모 디렉토리
/// - `stem` - 파일명 (확장자 제외, 예: "test")
/// - `suffix` - 접미사 (예: "_pixel", "_sheet")
/// - `ext` - 확장자 (점 포함, 예: ".png")
///
/// # 예제
///
/// ```rust
/// use std::path::Path;
/// use crate::helpers::find_unique_path;
///
/// let parent = Path::new("/tmp");
/// let path = find_unique_path(parent, "output", "_compressed", ".mp4");
/// // /tmp/output_compressed.mp4 (없으면)
/// // /tmp/output_compressed_2.mp4 (있으면)
/// ```
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
///
/// 파일/디렉토리 복제 시 충돌을 피하기 위해 자동으로 번호를 추가합니다.
/// Finder/탐색기의 복사 동작과 동일한 네이밍 규칙을 따릅니다.
///
/// # 인자
///
/// - `parent` - 대상 디렉토리
/// - `stem` - 파일명 (확장자 제외, 예: "document")
/// - `ext` - 확장자 (점 포함, 예: ".txt") — 디렉토리면 빈 문자열
/// - `is_dir` - 디렉토리 여부
///
/// # 예제
///
/// ```rust
/// use std::path::Path;
/// use crate::helpers::get_copy_destination;
///
/// let parent = Path::new("/tmp");
///
/// // 파일 복사
/// let path = get_copy_destination(parent, "file", ".txt", false);
/// // /tmp/file (복사).txt (없으면)
/// // /tmp/file (복사 2).txt (있으면)
///
/// // 디렉토리 복사
/// let path = get_copy_destination(parent, "folder", "", true);
/// // /tmp/folder (복사) (없으면)
/// // /tmp/folder (복사 2) (있으면)
/// ```
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
///
/// 여러 이미지를 하나의 그리드 캔버스로 합칩니다.
/// 게임 스프라이트 시트, 아이콘 팩 등을 생성할 때 사용합니다.
///
/// # 인자
///
/// - `images` - 이미지 파일 경로 목록
/// - `cell_width` / `cell_height` - 각 셀 크기 (픽셀, 리사이즈 대상)
/// - `cols` / `rows` - 그리드 열/행 수
///
/// # 에러
///
/// - 이미지 파일을 열 수 없는 경우 `AppError::ImageProcessing` 반환
///
/// # 예제
///
/// ```rust
/// use crate::helpers::create_sprite_canvas;
///
/// let images = vec![
///     "icon1.png".to_string(),
///     "icon2.png".to_string(),
///     "icon3.png".to_string(),
/// ];
///
/// // 3x1 그리드, 각 셀 64x64 픽셀
/// let canvas = create_sprite_canvas(&images, 64, 64, 3, 1)?;
/// // 결과: 192x64 픽셀 캔버스
/// ```
pub fn create_sprite_canvas(
    images: &[String],
    cell_width: u32,
    cell_height: u32,
    cols: u32,
    rows: u32,
) -> Result<RgbaImage> {
    let canvas_w = cols * cell_width;
    let canvas_h = rows * cell_height;
    let mut canvas = RgbaImage::new(canvas_w, canvas_h);

    for (i, path) in images.iter().enumerate() {
        let idx = i as u32;
        if idx >= cols * rows {
            break;
        }

        let img = image::open(path)
            .map_err(|e| AppError::ImageProcessing(format!("이미지 열기 실패 ({}): {}", path, e)))?;
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

// ===== 파일 시스템 유틸리티 =====

/// FileEntry 생성 헬퍼
///
/// 파일/디렉토리의 메타데이터를 읽어서 `FileEntry` 구조체로 변환합니다.
/// `list_directory` 등에서 중복 코드를 제거하기 위해 추출한 함수입니다.
///
/// # 에러
///
/// - 메타데이터를 읽을 수 없는 경우 io::Error → AppError 변환
///
/// # 예제
///
/// ```rust
/// use std::path::Path;
/// use crate::helpers::create_file_entry;
///
/// let path = Path::new("/tmp/test.txt");
/// let entry = create_file_entry(path)?;
/// println!("파일명: {}, 크기: {}", entry.name, entry.size);
/// ```
pub fn create_file_entry(path: &Path) -> Result<FileEntry> {
    let meta = std::fs::metadata(path)?;

    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let is_dir = meta.is_dir();
    let file_type = if is_dir {
        FileType::Directory
    } else {
        classify_file(&name)
    };

    Ok(FileEntry {
        path: path.to_string_lossy().to_string(),
        is_dir,
        size: if is_dir { 0 } else { meta.len() },
        modified,
        file_type,
        name,
    })
}

/// 경로 정규화 (심볼릭 링크 해석)
///
/// 심볼릭 링크를 실제 경로로 변환합니다.
/// canonicalize 실패 시 원본 경로를 그대로 반환합니다.
pub fn normalize_path(path: &str) -> PathBuf {
    PathBuf::from(path)
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(path))
}

/// 숨김 파일 여부 확인
///
/// Unix/macOS: 이름이 `.`으로 시작하는 파일 (예: `.DS_Store`, `.gitignore`)
///
/// # 예제
///
/// ```rust
/// use crate::helpers::is_hidden_file;
///
/// assert_eq!(is_hidden_file(".DS_Store"), true);
/// assert_eq!(is_hidden_file("normal.txt"), false);
/// ```
pub fn is_hidden_file(name: &str) -> bool {
    name.starts_with('.')
}

/// Windows 시스템 파일 여부 확인 (HIDDEN | SYSTEM 속성)
///
/// Windows에서 파일 속성에 `HIDDEN` 또는 `SYSTEM` 플래그가 있는지 확인합니다.
#[cfg(target_os = "windows")]
pub fn is_system_file(meta: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_HIDDEN_SYSTEM: u32 = 0x6; // HIDDEN (0x2) | SYSTEM (0x4)
    meta.file_attributes() & FILE_ATTRIBUTE_HIDDEN_SYSTEM != 0
}

/// 시스템 파일 여부 확인 (플랫폼 독립적 폴백)
///
/// Windows 이외의 플랫폼에서는 항상 `false`를 반환합니다.
#[cfg(not(target_os = "windows"))]
pub fn is_system_file(_meta: &std::fs::Metadata) -> bool {
    false
}

/// 시스템/임시 파일명 패턴 확인
///
/// Windows 시스템 파일 및 임시 파일 이름 패턴을 감지합니다:
/// - `desktop.ini`, `thumbs.db`, `ntuser.dat`
/// - `.sys` 확장자
/// - `~$` 접두사 (Office 임시 파일)
/// - `photoshop temp` 접두사
///
/// # 예제
///
/// ```rust
/// use crate::helpers::is_system_filename;
///
/// assert_eq!(is_system_filename("desktop.ini"), true);
/// assert_eq!(is_system_filename("~$document.docx"), true);
/// assert_eq!(is_system_filename("normal.txt"), false);
/// ```
pub fn is_system_filename(name: &str) -> bool {
    let name_lower = name.to_lowercase();
    name_lower == "desktop.ini"
        || name_lower == "thumbs.db"
        || name_lower == "ntuser.dat"
        || name_lower.ends_with(".sys")
        || name_lower.ends_with(".log.tmp")
        || name_lower.starts_with("~$")
        || name_lower.starts_with("photoshop temp")
}

// ===== 테스트 =====

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_hidden_file() {
        assert_eq!(is_hidden_file(".hidden"), true);
        assert_eq!(is_hidden_file(".DS_Store"), true);
        assert_eq!(is_hidden_file("visible.txt"), false);
        assert_eq!(is_hidden_file("normal_file"), false);
    }

    #[test]
    fn test_is_system_filename() {
        assert_eq!(is_system_filename("desktop.ini"), true);
        assert_eq!(is_system_filename("THUMBS.DB"), true);
        assert_eq!(is_system_filename("ntuser.dat"), true);
        assert_eq!(is_system_filename("file.sys"), true);
        assert_eq!(is_system_filename("~$document.docx"), true);
        assert_eq!(is_system_filename("photoshop temp123"), true);
        assert_eq!(is_system_filename("normal_file.txt"), false);
    }

    #[test]
    fn test_find_unique_path() {
        use std::fs;
        use std::path::PathBuf;

        let temp = std::env::temp_dir();
        let test_base = temp.join("test_find_unique_path");

        // 테스트 디렉토리 생성
        let _ = fs::create_dir_all(&test_base);

        // 첫 번째 경로 (충돌 없음)
        let path1 = find_unique_path(&test_base, "test", "_suffix", ".txt");
        assert!(path1.to_str().unwrap().contains("test_suffix.txt"));

        // 파일 생성
        let _ = fs::write(&path1, "test");

        // 두 번째 경로 (충돌 있음, 카운터 추가)
        let path2 = find_unique_path(&test_base, "test", "_suffix", ".txt");
        assert!(path2.to_str().unwrap().contains("test_suffix_2.txt"));

        // 정리
        let _ = fs::remove_dir_all(&test_base);
    }

    #[test]
    fn test_get_copy_destination_file() {
        use std::fs;

        let temp = std::env::temp_dir();
        let test_base = temp.join("test_copy_dest");
        let _ = fs::create_dir_all(&test_base);

        // 첫 번째 복사 (충돌 없음)
        let dest1 = get_copy_destination(&test_base, "file", ".txt", false);
        assert!(dest1.to_str().unwrap().contains("file (복사).txt"));

        // 파일 생성
        let _ = fs::write(&dest1, "test");

        // 두 번째 복사 (충돌 있음)
        let dest2 = get_copy_destination(&test_base, "file", ".txt", false);
        assert!(dest2.to_str().unwrap().contains("file (복사 2).txt"));

        // 정리
        let _ = fs::remove_dir_all(&test_base);
    }

    #[test]
    fn test_get_copy_destination_dir() {
        use std::fs;

        let temp = std::env::temp_dir();
        let test_base = temp.join("test_copy_dest_dir");
        let _ = fs::create_dir_all(&test_base);

        // 첫 번째 복사
        let dest1 = get_copy_destination(&test_base, "folder", "", true);
        assert!(dest1.to_str().unwrap().contains("folder (복사)"));

        // 디렉토리 생성
        let _ = fs::create_dir(&dest1);

        // 두 번째 복사
        let dest2 = get_copy_destination(&test_base, "folder", "", true);
        assert!(dest2.to_str().unwrap().contains("folder (복사 2)"));

        // 정리
        let _ = fs::remove_dir_all(&test_base);
    }
}
