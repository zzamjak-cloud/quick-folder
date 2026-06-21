//! 미디어 처리 모듈 (비디오/오디오 변환, 썸네일, 압축)

mod gif;
mod thumbnail;
mod video;

pub use gif::{compress_gif, gif_to_mp4};
pub(crate) use thumbnail::get_os_thumbnail;
pub use thumbnail::{get_video_thumbnail, get_video_thumbnail_path, invalidate_thumbnail_cache};
pub use video::{
    compress_video, concat_videos, cut_video, trim_video, video_to_gif, VideoProgress,
};
