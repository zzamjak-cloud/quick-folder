//! 이미지 처리 모듈 (썸네일, 픽셀화, 배경 제거, 스프라이트 시트, ICO/ICNS 변환, 폰트 처리)

pub mod batch;
mod background;
mod compression;
mod convert;
mod dimensions;
mod font;
pub mod heavy;
mod pixelate;
mod sprite;
mod thumbnail;

pub use background::{remove_white_bg_preview, remove_white_bg_save};
pub use batch::{run_image_batch, ImageBatchOp};
pub use heavy::{heavy_op_limit, set_heavy_op_limit};
pub use compression::{
    compress_image, compress_image_preview, crop_image, resize_image, save_annotated_image,
    ImageCompressPreview,
};
pub use convert::{convert_to_icns, convert_to_ico};
pub use dimensions::get_image_dimensions;
pub use font::{get_font_info, read_font_bytes, FontInfo};
pub use pixelate::{clear_pixelate_preview_cache, pixelate_image, pixelate_preview};
pub use sprite::{save_sprite_sheet, split_sprite_sheet, sprite_sheet_preview};
pub(crate) use thumbnail::{
    cached_thumbnail, ensure_cached_thumbnail, ensure_google_drive_thumbnail,
    invalidate_thumbnail_cache_paths, invalidate_thumbnail_cache_paths_in_root,
    migrate_thumbnail_cache_for_rename,
};
// 앱 시작 시 1회 캐시 마이그레이션 — src-tauri setup에서 호출
pub use thumbnail::migrate_psd_local_cache_once;
pub use thumbnail::{
    get_file_thumbnail, get_file_thumbnail_path, get_psd_preview_path, get_psd_thumbnail,
    get_psd_thumbnail_path, prewarm_psd_preview,
};
