use crate::modules::error::{AppError, Result};

// ─── 경로 및 환경 헬퍼 함수 ──────────────────────────────────────────────

/// ffmpeg sidecar와 동일: 실행 파일이 있는 디렉터리 (여기에 `python_fonttools_embed` 등 배치)
pub(super) fn app_sidecar_directory() -> Result<std::path::PathBuf> {
    std::env::current_exe()?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| AppError::Internal("실행 파일 디렉터리를 알 수 없습니다.".to_string()))
}

/// fonttools 전용 내장 Python 루트 (사용자 영구 디렉터리, 앱 업데이트 시에도 유지)
pub(super) fn fonttools_embed_root() -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        // Windows: %LOCALAPPDATA%\QuickFolder\python_fonttools_embed
        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            return std::path::PathBuf::from(local_appdata)
                .join("QuickFolder")
                .join("python_fonttools_embed");
        }
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        // macOS/Linux: ~/Library/Application Support/QuickFolder/python_fonttools_embed (macOS)
        //              ~/.local/share/QuickFolder/python_fonttools_embed (Linux)
        if let Ok(home) = std::env::var("HOME") {
            #[cfg(target_os = "macos")]
            return std::path::PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("QuickFolder")
                .join("python_fonttools_embed");

            #[cfg(target_os = "linux")]
            return std::path::PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("QuickFolder")
                .join("python_fonttools_embed");
        }
    }

    // 폴백: 실행 파일 디렉터리 (이전 방식)
    app_sidecar_directory()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("python_fonttools_embed")
}
