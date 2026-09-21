//! QuickFolder 코어
//!
//! GUI(Tauri)에 의존하지 않는 파일·이미지·미디어 처리 로직.
//! 데스크톱 앱(src-tauri)과 CLI/MCP 서버가 함께 쓴다.

pub mod constants;
pub mod error;
pub mod helpers;
pub mod paths;
pub mod progress;
pub mod runtime;
pub mod types;

pub use paths::AppPaths;
pub use progress::{null_sink, Progress, ProgressSink};
