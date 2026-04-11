//! 애플리케이션 에러 타입 정의
//!
//! 모든 Tauri 커맨드에서 일관된 에러 처리를 위한 중앙 집중식 에러 타입.
//!
//! # 사용 예제
//!
//! ```rust
//! use crate::modules::error::{AppError, Result};
//!
//! // Tauri 커맨드에서 Result<T> 반환 (AppError 자동 변환)
//! #[tauri::command]
//! pub async fn my_command(path: String) -> Result<String> {
//!     // io::Error는 자동으로 AppError::Io로 변환됨
//!     let content = std::fs::read_to_string(&path)?;
//!     Ok(content)
//! }
//!
//! // 명시적 에러 생성
//! #[tauri::command]
//! pub fn validate_input(value: u32) -> Result<()> {
//!     if value > 100 {
//!         return Err(AppError::InvalidInput("값은 100 이하여야 합니다".to_string()));
//!     }
//!     Ok(())
//! }
//! ```
//!
//! # 자동 변환 (From trait)
//!
//! 다음 에러 타입은 자동으로 AppError로 변환됩니다:
//! - `std::io::Error` → `AppError::Io` / `Permission` / `NotFound` / `AlreadyExists`
//! - `image::ImageError` → `AppError::ImageProcessing`
//! - `zip::ZipError` → `AppError::Io`

use std::fmt;

/// 애플리케이션 에러 타입
///
/// Tauri는 `Display`를 구현한 타입을 자동으로 JSON으로 직렬화합니다.
/// `#[serde(tag = "type", content = "message")]`로 직렬화되어
/// 프론트엔드에서 `{type: "io_error", message: "..."}`로 수신됩니다.
#[derive(Debug, serde::Serialize)]
#[serde(tag = "type", content = "message")]
pub enum AppError {
    // ===== 파일 시스템 에러 =====

    /// I/O 오류 (파일 읽기/쓰기 실패 등)
    ///
    /// `std::io::Error`에서 자동 변환됩니다 (ErrorKind가 특정 타입이 아닌 경우).
    #[serde(rename = "io_error")]
    Io(String),

    /// 권한 거부 (파일/디렉토리 접근 불가)
    ///
    /// `std::io::ErrorKind::PermissionDenied`에서 자동 변환됩니다.
    #[serde(rename = "permission_denied")]
    Permission(String),

    /// 파일/디렉토리를 찾을 수 없음
    ///
    /// `std::io::ErrorKind::NotFound`에서 자동 변환됩니다.
    #[serde(rename = "not_found")]
    NotFound(String),

    /// 파일/디렉토리가 이미 존재
    ///
    /// `std::io::ErrorKind::AlreadyExists`에서 자동 변환됩니다.
    /// 주로 `create_text_file`, `rename_item`에서 발생합니다.
    #[serde(rename = "already_exists")]
    AlreadyExists(String),

    // ===== 외부 도구 에러 =====

    /// 외부 도구(FFmpeg, Ghostscript 등)를 찾을 수 없음
    ///
    /// 사용자에게 도구 설치 안내 메시지를 표시해야 합니다.
    #[serde(rename = "tool_not_found")]
    ToolNotFound { tool: String },

    /// 외부 도구 실행 실패
    ///
    /// 도구는 찾았으나 실행 중 오류 발생 (잘못된 파라미터, 지원되지 않는 형식 등).
    #[serde(rename = "tool_execution_failed")]
    ToolExecution { tool: String, reason: String },

    /// 외부 도구 다운로드 실패
    ///
    /// 자동 다운로드 시도 중 네트워크 오류 또는 서버 응답 실패.
    #[serde(rename = "tool_download_failed")]
    ToolDownload { tool: String, reason: String },

    /// 외부 도구 설치 실패
    ///
    /// 다운로드는 성공했으나 압축 해제/설치 과정에서 오류.
    #[serde(rename = "tool_installation_failed")]
    ToolInstallation { tool: String, reason: String },

    // ===== 미디어 처리 에러 =====

    /// 이미지 처리 실패 (리사이징, 썸네일 생성 등)
    ///
    /// `image::ImageError`에서 자동 변환됩니다.
    /// 지원되지 않는 형식, 손상된 이미지 파일 등에서 발생합니다.
    #[serde(rename = "image_processing_failed")]
    ImageProcessing(String),

    /// 동영상 처리 실패 (압축, 변환 등)
    ///
    /// FFmpeg 실행 실패, 지원되지 않는 코덱 등에서 발생합니다.
    #[serde(rename = "video_processing_failed")]
    VideoProcessing(String),

    /// 오디오 처리 실패
    ///
    /// 현재 사용되지 않음 (향후 오디오 기능 추가 시 사용).
    #[serde(rename = "audio_processing_failed")]
    AudioProcessing(String),

    /// PDF 처리 실패 (압축, 변환 등)
    ///
    /// Ghostscript 실행 실패, 손상된 PDF 등에서 발생합니다.
    #[serde(rename = "pdf_processing_failed")]
    PdfProcessing(String),

    /// 폰트 처리 실패 (병합, 서브셋 등)
    ///
    /// fonttools 실행 실패, 잘못된 폰트 형식 등에서 발생합니다.
    #[serde(rename = "font_processing_failed")]
    FontProcessing(String),

    // ===== 플랫폼 에러 =====

    /// 지원되지 않는 플랫폼
    ///
    /// 특정 OS에서만 작동하는 기능(예: Windows 관리자 권한 삭제)을
    /// 다른 OS에서 호출했을 때 발생합니다.
    #[serde(rename = "unsupported_platform")]
    UnsupportedPlatform(String),

    /// 클립보드 작업 실패
    ///
    /// 현재 사용되지 않음 (clipboard-manager 플러그인 사용).
    #[serde(rename = "clipboard_error")]
    Clipboard(String),

    // ===== 일반 에러 =====

    /// 잘못된 입력값 (파라미터 검증 실패)
    ///
    /// 사용자 입력이 유효하지 않거나, 경로가 잘못되었거나,
    /// 파일명을 추출할 수 없는 경우 등에 발생합니다.
    #[serde(rename = "invalid_input")]
    InvalidInput(String),

    /// 내부 오류 (예상치 못한 상황)
    ///
    /// spawn_blocking 실패, 알 수 없는 에러 등 디버깅이 필요한 상황.
    #[serde(rename = "internal_error")]
    Internal(String),

    /// 작업 취소됨
    ///
    /// 사용자가 작업을 취소했거나, 타임아웃 등으로 중단된 경우.
    #[serde(rename = "cancelled")]
    Cancelled(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            // 파일 시스템
            Self::Io(msg) => write!(f, "파일 작업 실패: {}", msg),
            Self::Permission(msg) => write!(f, "권한 오류: {}", msg),
            Self::NotFound(msg) => write!(f, "찾을 수 없음: {}", msg),
            Self::AlreadyExists(msg) => write!(f, "이미 존재함: {}", msg),

            // 외부 도구
            Self::ToolNotFound { tool } => write!(f, "{} 도구를 찾을 수 없습니다", tool),
            Self::ToolExecution { tool, reason } => {
                write!(f, "{} 실행 실패: {}", tool, reason)
            }
            Self::ToolDownload { tool, reason } => {
                write!(f, "{} 다운로드 실패: {}", tool, reason)
            }
            Self::ToolInstallation { tool, reason } => {
                write!(f, "{} 설치 실패: {}", tool, reason)
            }

            // 미디어 처리
            Self::ImageProcessing(msg) => write!(f, "이미지 처리 실패: {}", msg),
            Self::VideoProcessing(msg) => write!(f, "동영상 처리 실패: {}", msg),
            Self::AudioProcessing(msg) => write!(f, "오디오 처리 실패: {}", msg),
            Self::PdfProcessing(msg) => write!(f, "PDF 처리 실패: {}", msg),
            Self::FontProcessing(msg) => write!(f, "폰트 처리 실패: {}", msg),

            // 플랫폼
            Self::UnsupportedPlatform(msg) => write!(f, "지원되지 않는 플랫폼: {}", msg),
            Self::Clipboard(msg) => write!(f, "클립보드 오류: {}", msg),

            // 일반
            Self::InvalidInput(msg) => write!(f, "잘못된 입력: {}", msg),
            Self::Internal(msg) => write!(f, "내부 오류: {}", msg),
            Self::Cancelled(msg) => write!(f, "취소됨: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}

// ===== From 구현 (자동 변환) =====

/// `std::io::Error` → `AppError` 자동 변환
///
/// ErrorKind에 따라 적절한 AppError variant로 매핑합니다:
/// - `NotFound` → `AppError::NotFound`
/// - `PermissionDenied` → `AppError::Permission`
/// - `AlreadyExists` → `AppError::AlreadyExists`
/// - 기타 → `AppError::Io`
///
/// # 예제
///
/// ```rust
/// use crate::modules::error::{AppError, Result};
///
/// fn read_file(path: &str) -> Result<String> {
///     // io::Error는 자동으로 AppError로 변환됨
///     let content = std::fs::read_to_string(path)?;
///     Ok(content)
/// }
/// ```
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        use std::io::ErrorKind;
        match e.kind() {
            ErrorKind::NotFound => Self::NotFound(e.to_string()),
            ErrorKind::PermissionDenied => Self::Permission(e.to_string()),
            ErrorKind::AlreadyExists => Self::AlreadyExists(e.to_string()),
            _ => Self::Io(e.to_string()),
        }
    }
}

/// `image::ImageError` → `AppError::ImageProcessing` 자동 변환
///
/// 이미지 크레이트의 모든 에러를 ImageProcessing으로 변환합니다.
///
/// # 예제
///
/// ```rust
/// use crate::modules::error::Result;
///
/// fn load_image(path: &str) -> Result<image::RgbaImage> {
///     // ImageError는 자동으로 AppError::ImageProcessing으로 변환됨
///     let img = image::open(path)?;
///     Ok(img.to_rgba8())
/// }
/// ```
impl From<image::ImageError> for AppError {
    fn from(e: image::ImageError) -> Self {
        Self::ImageProcessing(e.to_string())
    }
}

/// `zip::result::ZipError` → `AppError::Io` 자동 변환
///
/// ZIP 압축/해제 오류를 Io 에러로 변환합니다.
impl From<zip::result::ZipError> for AppError {
    fn from(e: zip::result::ZipError) -> Self {
        Self::Io(format!("ZIP 처리 오류: {}", e))
    }
}

// ===== Result 타입 별칭 =====

/// 애플리케이션 전용 Result 타입
///
/// `std::result::Result<T, AppError>`의 별칭으로,
/// 모든 Tauri 커맨드에서 간결하게 사용할 수 있습니다.
///
/// # 예제
///
/// ```rust
/// use crate::modules::error::Result;
///
/// #[tauri::command]
/// pub async fn my_command(path: String) -> Result<Vec<String>> {
///     // ...
///     Ok(vec![])
/// }
/// ```
pub type Result<T> = std::result::Result<T, AppError>;

// ===== 헬퍼 함수 =====

/// String 에러를 AppError로 변환하는 헬퍼
pub fn str_to_error(msg: impl Into<String>) -> AppError {
    AppError::Internal(msg.into())
}
