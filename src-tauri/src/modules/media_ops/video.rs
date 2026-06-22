//! 비디오 압축/편집/변환 처리 모듈

mod compress;
mod concat;
mod edit;
mod gif;
mod progress;

use crate::modules::error::Result;

#[derive(Clone, serde::Serialize)]
pub struct VideoProgress {
    pub percent: f32,
    pub speed: String,
    pub fps: f32,
}

#[tauri::command]
pub async fn compress_video(
    input: String,
    quality: String,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String> {
    compress::compress_video(input, quality, on_progress).await
}

#[tauri::command]
pub async fn trim_video(
    input: String,
    start_sec: f64,
    end_sec: f64,
    crop_x: Option<i32>,
    crop_y: Option<i32>,
    crop_w: Option<i32>,
    crop_h: Option<i32>,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String> {
    edit::trim_video(
        input,
        start_sec,
        end_sec,
        crop_x,
        crop_y,
        crop_w,
        crop_h,
        on_progress,
    )
    .await
}

#[tauri::command]
pub async fn cut_video(
    input: String,
    start_sec: f64,
    end_sec: f64,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String> {
    edit::cut_video(input, start_sec, end_sec, on_progress).await
}

#[tauri::command]
pub async fn concat_videos(
    paths: Vec<String>,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String> {
    concat::concat_videos(paths, on_progress).await
}

#[tauri::command]
pub async fn video_to_gif(
    input: String,
    start_sec: f64,
    end_sec: f64,
    crop_x: Option<i32>,
    crop_y: Option<i32>,
    crop_w: Option<i32>,
    crop_h: Option<i32>,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String> {
    gif::video_to_gif(
        input,
        start_sec,
        end_sec,
        crop_x,
        crop_y,
        crop_w,
        crop_h,
        on_progress,
    )
    .await
}
