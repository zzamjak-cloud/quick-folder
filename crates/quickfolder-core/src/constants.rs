//! 프로젝트 전역 상수 정의
//! 매직 넘버와 URL, 플랫폼별 상수를 중앙 관리

// ===== 동시성 제한 =====

/// 무거운 이미지 처리 작업 동시 실행 제한 (메모리 보호)
pub const MAX_HEAVY_OPS: usize = 3;

// ===== 검색/조회 제한 =====

/// 파일 검색 최대 깊이 (재귀 폴더 탐색)
pub const SEARCH_MAX_DEPTH: usize = 10;

/// 중복 파일 탐색 최대 깊이 (재귀 폴더 탐색)
pub const DUPLICATE_SCAN_MAX_DEPTH: usize = 20;

/// 중복 파일 탐색 최대 파일 수
pub const MAX_DUPLICATE_SCAN_FILES: usize = 100_000;

/// 중복 그룹 최대 반환 수
pub const MAX_DUPLICATE_GROUPS: usize = 500;

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
    // 라이선스 정책:
    // - FFmpeg는 자체 LGPL 빌드를 번들한다 (build-ffmpeg-lgpl.yml).
    //   아래 GPL 빌드 URL들은 번들이 없거나 손상된 예외 상황의 런타임 다운로드 폴백 전용 —
    //   GPL 빌드는 절대 번들·재호스팅 금지, 원 배포처에서 사용자 기기로 직접 다운로드만 허용.
    // - Ghostscript(AGPL-3.0)는 의존 제거됨 (PDF 압축은 Rust 자체 구현)

    /// FFmpeg (Windows 64bit, gyan.dev 공식 빌드 — 원 배포처 직접 다운로드)
    #[cfg(target_os = "windows")]
    pub const FFMPEG_WIN64: &str =
        "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";

    /// FFmpeg (Windows 64bit 미러, BtbN GitHub 공식 빌드 — gyan.dev 장애 시 폴백)
    #[cfg(target_os = "windows")]
    pub const FFMPEG_WIN64_MIRROR: &str =
        "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip";

    /// FFmpeg (macOS, evermeet.cx 공식 정적 빌드 — x86_64 전용, Apple Silicon은 Rosetta 필요)
    #[cfg(target_os = "macos")]
    pub const FFMPEG_MACOS: &str = "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip";

    /// FFmpeg (macOS, martin-riedl.de 공식 빌드 인덱스 — arm64 네이티브 빌드 제공.
    /// 최신 버전 경로는 런타임에 이 인덱스 페이지에서 파싱한다)
    #[cfg(target_os = "macos")]
    pub const FFMPEG_MACOS_RIEDL_INDEX: &str = "https://ffmpeg.martin-riedl.de/";

    /// Python fonttools (Windows 64bit)
    #[cfg(target_os = "windows")]
    pub const PYTHON_FONTTOOLS_WIN64: &str =
        "https://github.com/zzamjak-cloud/quick-folder/releases/download/portable-tools-v1/python-fonttools-win64.zip";

    /// Python fonttools ZIP 파일명
    #[cfg(target_os = "windows")]
    pub const PYTHON_FONTTOOLS_ZIP_NAME: &str = "python-fonttools-win64.zip";

    // ── macOS 포터블 패키지 ──────────────────────────────────────────

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
    pub const REG_TYPE_SZ_LEN: usize = 6; // "REG_SZ".len()
}
