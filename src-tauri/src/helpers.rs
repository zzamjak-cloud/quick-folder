//! 공통 헬퍼 함수 모듈
//!
//! lib.rs와 여러 모듈에서 반복되는 유틸리티 로직을 추출한 모듈.
//!
//! # 주요 기능
//!
//! - 경로 중복 회피 (`find_unique_path`, `get_copy_destination`)
//! - 이미지 처리 (`create_sprite_canvas`)
//! - 파일 시스템 유틸리티 (`is_hidden_file`, `is_system_filename`)

use image::{imageops, RgbaImage};
use std::path::{Path, PathBuf};

use crate::modules::error::{AppError, Result};

/// 클라우드 스토리지 경로 감지 (구글드라이브 / iCloud / OneDrive / Dropbox)
/// 바이트 직접 읽기가 느린(온디맨드 hydration) 경로 → OS 네이티브 썸네일을 우선 사용.
/// utils/pathUtils.ts 의 isCloudPath()와 동일한 판정 규칙.
pub fn is_cloud_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    if lower.contains("/library/cloudstorage/") {
        return true;
    } // macOS 구글드라이브/Dropbox 등
    if lower.contains("/library/mobile documents/") {
        return true;
    } // macOS iCloud
    if lower.contains("google drive") || lower.contains("googledrive") {
        return true;
    }
    let norm = lower.replace('\\', "/");
    if norm.contains("/onedrive") {
        return true;
    }
    if norm.contains("/dropbox") {
        return true;
    }
    false
}

/// 릴리스가 바뀌어도 유지되어야 하는 디스크 캐시 키용 안정 해시.
pub fn stable_cache_key(parts: &[&[u8]]) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for part in parts {
        for b in (part.len() as u64).to_le_bytes().iter().chain(part.iter()) {
            hash ^= u64::from(*b);
            hash = hash.wrapping_mul(0x100000001b3);
        }
    }
    format!("{:016x}", hash)
}

/// `%EA%B0%80` 형태의 percent-encoded UTF-8 문자열을 디코딩한다.
/// 잘못된 시퀀스면 원본 문자열을 그대로 반환한다.
pub fn percent_decode_utf8(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut changed = false;
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex_value(bytes[i + 1]), hex_value(bytes[i + 2])) {
                decoded.push((high << 4) | low);
                changed = true;
                i += 3;
                continue;
            }
        }

        decoded.push(bytes[i]);
        i += 1;
    }

    if changed {
        String::from_utf8(decoded).unwrap_or_else(|_| input.to_string())
    } else {
        input.to_string()
    }
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

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
/// use app_lib::find_unique_path;
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
/// use app_lib::get_copy_destination;
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

/// 충돌 시 Windows 탐색기 스타일 "(1)", "(2)" 접미사 경로 결정
pub fn get_numbered_destination(parent: &Path, stem: &str, ext: &str, is_dir: bool) -> PathBuf {
    let stem = stem.to_string();
    let ext = ext.to_string();
    let (first, pattern): (String, Box<dyn Fn(u32) -> String>) = if is_dir {
        let s = stem.clone();
        let s2 = stem.clone();
        (
            format!("{} (1)", s),
            Box::new(move |n| format!("{} ({})", s2, n)),
        )
    } else {
        let s = stem.clone();
        let e = ext.clone();
        let s2 = stem.clone();
        let e2 = ext.clone();
        (
            format!("{} (1){}", s, e),
            Box::new(move |n| format!("{} ({}){}", s2, n, e2)),
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
/// ```rust,no_run
/// use app_lib::create_sprite_canvas;
/// # fn main() -> app_lib::modules::error::Result<()> {
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
/// # Ok(())
/// # }
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

        let img = image::open(path).map_err(|e| {
            AppError::ImageProcessing(format!("이미지 열기 실패 ({}): {}", path, e))
        })?;
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

/// 숨김 파일 여부 확인
///
/// Unix/macOS: 이름이 `.`으로 시작하는 파일 (예: `.DS_Store`, `.gitignore`)
///
/// # 예제
///
/// ```rust
/// use app_lib::is_hidden_file;
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
/// use app_lib::is_system_filename;
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
