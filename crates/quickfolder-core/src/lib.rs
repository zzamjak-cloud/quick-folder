//! QuickFolder 코어
//!
//! GUI(Tauri)에 의존하지 않는 파일·이미지·미디어 처리 로직.
//! 데스크톱 앱(src-tauri)과 CLI/MCP 서버가 함께 쓴다.
//!
//! 앱의 `#[tauri::command]` 래퍼는 여기 함수들을 그대로 호출한다.
//! GUI 상태가 필요한 값(캐시 경로, 진행률 채널)은 `AppPaths`·`Progress<T>`로 주입받는다.

pub mod agent_launch;
pub mod archive_ops;
pub mod batch;
pub mod constants;
pub mod error;
pub mod file_ops;
pub mod helpers;
pub mod hwp_ops;
pub mod image_ops;
pub mod laigter_maps;
pub mod mcp_setup;
pub mod media_ops;
pub mod path_guard;
pub mod paths;
pub mod progress;
pub mod runtime;
pub mod system_ops;
pub mod tool_ops;
pub mod types;

pub use paths::AppPaths;
pub use progress::{null_sink, Progress, ProgressSink};

// 평면 재수출 — 앱의 command 래퍼와 CLI/MCP가 짧은 경로로 쓰도록
pub use archive_ops::*;
pub use file_ops::*;
pub use helpers::*;
pub use hwp_ops::*;
pub use image_ops::*;
pub use laigter_maps::*;
pub use media_ops::*;
pub use system_ops::*;
pub use tool_ops::*;
