// 모듈 선언
// 로직 본체는 quickfolder-core에 있다. 여기에는 GUI(Tauri)에 묶인 것만 남는다.
// 기존 crate::modules::* 경로를 유지하기 위해 코어 모듈을 재수출한다.
pub use quickfolder_core::{
    archive_ops, constants, error, file_ops, helpers, hwp_ops, image_ops, laigter_maps, media_ops,
    paths, progress, runtime, tool_ops, types,
};

pub mod commands;
pub mod system_ops;
pub mod tauri_glue;

// Re-export: lib.rs에서 use modules::*; 로 사용 가능하도록
pub use commands::*;
pub use quickfolder_core::AppPaths;
pub use system_ops::*;
