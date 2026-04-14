//! 프로젝트 전역 상수 정의
//! 매직 넘버와 URL, 플랫폼별 상수를 중앙 관리

// ===== 동시성 제한 =====

/// 무거운 이미지 처리 작업 동시 실행 제한 (메모리 보호)
pub const MAX_HEAVY_OPS: usize = 3;

// ===== 검색/조회 제한 =====

/// 파일 검색 최대 결과 개수
pub const MAX_SEARCH_RESULTS: usize = 100;

/// 최근 파일 조회 최대 개수
pub const MAX_RECENT_FILES: usize = 100;

/// 파일 검색 최대 깊이 (재귀 폴더 탐색)
pub const SEARCH_MAX_DEPTH: usize = 10;

/// 최근 파일 조회 기간 (일)
pub const RECENT_FILES_DEFAULT_DAYS: u32 = 7;

// ===== Windows 플랫폼 상수 =====

#[cfg(target_os = "windows")]
pub mod windows {
    /// 프로세스 생성 시 콘솔 창 숨기기 플래그
    pub const CREATE_NO_WINDOW: u32 = 0x08000000;

    /// Windows 아이콘 크기: 대형 (32x32)
    pub const SHIL_LARGE: i32 = 0;

    /// Windows 아이콘 크기: 점보 (256x256)
    pub const SHIL_JUMBO: i32 = 4;

    /// Windows 아이콘 크기: 초대형 (48x48)
    pub const SHIL_EXTRALARGE: i32 = 2;

    /// 아이콘 추출 시 투명 배경 플래그
    pub const ILD_TRANSPARENT: i32 = 1;

    /// Windows 파일 속성: HIDDEN | SYSTEM (숨김 + 시스템 파일)
    pub const FILE_ATTRIBUTE_HIDDEN_SYSTEM: u32 = 0x6;
}

// ===== 외부 도구 다운로드 URL =====

pub mod download_urls {
    /// Ghostscript Portable (Windows 64bit)
    pub const GHOSTSCRIPT_WIN64: &str =
        "https://github.com/zzamjak-cloud/quick-folder/releases/download/portable-tools-v1/ghostscript-portable-win64.zip";

    /// Ghostscript ZIP 파일명
    pub const GHOSTSCRIPT_ZIP_NAME: &str = "ghostscript-portable-win64.zip";

    /// Python fonttools (Windows 64bit)
    pub const PYTHON_FONTTOOLS_WIN64: &str =
        "https://github.com/zzamjak-cloud/quick-folder/releases/download/portable-tools-v1/python-fonttools-win64.zip";

    /// Python fonttools ZIP 파일명
    pub const PYTHON_FONTTOOLS_ZIP_NAME: &str = "python-fonttools-win64.zip";

    // ── macOS 포터블 패키지 ──────────────────────────────────────────

    /// Ghostscript Portable (macOS ARM64)
    pub const GHOSTSCRIPT_MACOS_ARM64: &str =
        "https://github.com/zzamjak-cloud/quick-folder/releases/download/portable-tools-v1/ghostscript-portable-macos-arm64.tar.gz";

    /// Ghostscript Portable (macOS x86_64)
    /// x86_64 Homebrew bottle 미제공 → ARM64 패키지 사용 시도 (실패 시 brew 폴백)
    pub const GHOSTSCRIPT_MACOS_X86_64: &str =
        "https://github.com/zzamjak-cloud/quick-folder/releases/download/portable-tools-v1/ghostscript-portable-macos-arm64.tar.gz";

    /// Python fonttools (macOS ARM64)
    pub const PYTHON_FONTTOOLS_MACOS_ARM64: &str =
        "https://github.com/zzamjak-cloud/quick-folder/releases/download/portable-tools-v1/python-fonttools-macos-arm64.tar.gz";

    /// Python fonttools (macOS x86_64)
    pub const PYTHON_FONTTOOLS_MACOS_X86_64: &str =
        "https://github.com/zzamjak-cloud/quick-folder/releases/download/portable-tools-v1/python-fonttools-macos-x86_64.tar.gz";
}

// ===== 레지스트리 키 (Windows) =====

#[cfg(target_os = "windows")]
pub mod registry {
    /// FFmpeg 레지스트리 검색 키 목록
    pub const FFMPEG_REGISTRY_KEYS: &[&str] = &[
        "HKEY_LOCAL_MACHINE\\SOFTWARE\\ffmpeg",
        "HKEY_CURRENT_USER\\SOFTWARE\\ffmpeg",
        "HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\ffmpeg",
        "HKEY_CURRENT_USER\\SOFTWARE\\WOW6432Node\\ffmpeg",
        "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
        "HKEY_CURRENT_USER\\Environment",
    ];

    /// 레지스트리 값 타입 문자열 길이
    pub const REG_TYPE_EXPAND_SZ_LEN: usize = 15; // "REG_EXPAND_SZ".len()
    pub const REG_TYPE_SZ_LEN: usize = 6;         // "REG_SZ".len()
}

// ===== 이미지 처리 기본값 =====

pub mod image {
    /// 기본 JPEG 품질 (0-100)
    pub const DEFAULT_JPEG_QUALITY: u8 = 85;

    /// PNG 압축 레벨 (0-9, 높을수록 느리지만 작음)
    pub const DEFAULT_PNG_COMPRESSION: u8 = 6;

    /// 썸네일 캐시 기본 크기
    pub const THUMBNAIL_DEFAULT_SIZE: u32 = 256;
}

// ===== 비디오 처리 기본값 =====

pub mod video {
    /// 기본 CRF 값 (화질 우선: 23)
    pub const DEFAULT_CRF: u8 = 23;

    /// 고화질 CRF 값
    pub const HIGH_QUALITY_CRF: u8 = 18;

    /// 보통 화질 CRF 값
    pub const MEDIUM_QUALITY_CRF: u8 = 28;
}
