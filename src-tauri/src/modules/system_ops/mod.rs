//! 시스템 통합 모듈
//! 파일 탐색기 연동, 클립보드, 파일 검색, 최근 파일, 아이콘 추출

// 공통 타입
#[derive(serde::Serialize)]
pub struct FolderSelection {
    pub path: String,
    pub name: String,
}

// 서브모듈
mod app_activation;
mod clipboard;
mod file_explorer;
mod file_icon;
mod file_search;
mod google_drive;
mod webview_recovery;

// Re-export all public functions
pub use app_activation::*;
pub use clipboard::*;
pub use file_explorer::*;
pub use file_icon::*;
pub use file_search::*;
pub use google_drive::*;
pub use webview_recovery::*;
