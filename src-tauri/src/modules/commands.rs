//! Tauri command 래퍼
//!
//! 실제 로직은 quickfolder-core에 있다. 여기서는 프론트엔드가 보내는 Tauri 타입
//! (AppHandle, ipc::Channel)을 코어가 받는 형태로 바꿔 전달만 한다.
//! 프론트엔드 계약(command 이름·파라미터)은 분리 전과 동일하다.

#![allow(clippy::too_many_arguments)]

use quickfolder_core::error::Result;
use quickfolder_core::types::*;
use quickfolder_core::*;

#[tauri::command]
pub async fn analyze_folder_merge(
    source: String,
    dest_parent: String,
) -> Result<FolderMergeAnalysis> {
    quickfolder_core::analyze_folder_merge(source, dest_parent).await
}

#[tauri::command]
pub async fn calculate_folder_size(
    path: String,
) -> Result<FolderSizeInfo> {
    quickfolder_core::calculate_folder_size(path).await
}

#[tauri::command]
pub async fn check_duplicate_items(
    sources: Vec<String>,
    dest: String,
) -> Result<Vec<String>> {
    quickfolder_core::check_duplicate_items(sources, dest).await
}

#[tauri::command]
pub async fn check_ffmpeg(
) -> Result<bool> {
    quickfolder_core::check_ffmpeg().await
}

#[tauri::command]
pub async fn check_fonttools(
) -> Result<bool> {
    quickfolder_core::check_fonttools().await
}

#[tauri::command]
pub async fn compress_gif(
    path: String,
    quality: String,
    reduce_size: bool,
) -> Result<String> {
    quickfolder_core::compress_gif(path, quality, reduce_size).await
}

#[tauri::command]
pub async fn compress_image(
    path: String,
    quality: String,
) -> Result<String> {
    quickfolder_core::compress_image(path, quality).await
}

#[tauri::command]
pub async fn compress_image_preview(
    path: String,
    quality: String,
) -> Result<ImageCompressPreview> {
    quickfolder_core::compress_image_preview(path, quality).await
}

#[tauri::command]
pub async fn compress_pdf(
    input: String,
) -> Result<String> {
    quickfolder_core::compress_pdf(input).await
}

#[tauri::command]
pub async fn compress_to_zip(
    paths: Vec<String>,
    dest: String,
) -> Result<String> {
    quickfolder_core::compress_to_zip(paths, dest).await
}

#[tauri::command]
pub async fn compress_video(
    input: String,
    quality: String,
    scale_percent: Option<u32>,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String> {
    quickfolder_core::compress_video(input, quality, scale_percent, crate::modules::tauri_glue::channel_sink(on_progress)).await
}

#[tauri::command]
pub async fn concat_videos(
    paths: Vec<String>,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String> {
    quickfolder_core::concat_videos(paths, crate::modules::tauri_glue::channel_sink(on_progress)).await
}

#[tauri::command]
pub async fn convert_to_icns(
    path: String,
) -> Result<String> {
    quickfolder_core::convert_to_icns(path).await
}

#[tauri::command]
pub async fn convert_to_ico(
    path: String,
) -> Result<String> {
    quickfolder_core::convert_to_ico(path).await
}

#[tauri::command]
pub async fn copy_items(
    app: tauri::AppHandle,
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
) -> Result<()> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::copy_items(app_paths, sources, dest, overwrite).await
}

#[tauri::command]
pub async fn copy_items_with_progress(
    app: tauri::AppHandle,
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
    on_progress: tauri::ipc::Channel<CopyProgress>,
) -> Result<()> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::copy_items_with_progress(app_paths, sources, dest, overwrite, crate::modules::tauri_glue::channel_sink(on_progress)).await
}

#[tauri::command]
pub async fn create_directory(
    path: String,
) -> Result<()> {
    quickfolder_core::create_directory(path).await
}

#[tauri::command]
pub async fn create_text_file(
    path: String,
) -> Result<()> {
    quickfolder_core::create_text_file(path).await
}

#[tauri::command]
pub async fn crop_image(
    path: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<String> {
    quickfolder_core::crop_image(path, x, y, width, height).await
}

#[tauri::command]
pub async fn cut_video(
    input: String,
    start_sec: f64,
    end_sec: f64,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String> {
    quickfolder_core::cut_video(input, start_sec, end_sec, crate::modules::tauri_glue::channel_sink(on_progress)).await
}

#[tauri::command]
pub async fn delete_items(
    app: tauri::AppHandle,
    paths: Vec<String>,
    use_trash: bool,
) -> Result<()> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::delete_items(app_paths, paths, use_trash).await
}

#[tauri::command]
pub async fn delete_items_elevated(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<()> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::delete_items_elevated(app_paths, paths).await
}

#[tauri::command]
pub async fn download_ffmpeg(
) -> Result<()> {
    quickfolder_core::download_ffmpeg().await
}

#[tauri::command]
pub async fn download_fonttools(
) -> Result<()> {
    quickfolder_core::download_fonttools().await
}

#[tauri::command]
pub async fn duplicate_items(
    paths: Vec<String>,
) -> Result<Vec<String>> {
    quickfolder_core::duplicate_items(paths).await
}

#[tauri::command]
pub async fn ensure_thumbnails_batch(
    app: tauri::AppHandle,
    items: Vec<ThumbnailBatchItem>,
    size: u32,
) -> Result<Vec<ThumbnailBatchResult>> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::ensure_thumbnails_batch(app_paths, items, size).await
}

#[tauri::command]
pub async fn extract_archive(
    archive_path: String,
    dest_dir: String,
) -> Result<crate::file_ops::ExtractResult> {
    quickfolder_core::extract_archive(archive_path, dest_dir).await
}

#[tauri::command]
pub async fn extract_hwp_text(
    path: String,
) -> std::result::Result<String, String> {
    quickfolder_core::extract_hwp_text(path).await
}

#[tauri::command]
pub async fn extract_zip(
    zip_path: String,
    dest_dir: String,
) -> Result<ExtractResult> {
    quickfolder_core::extract_zip(zip_path, dest_dir).await
}

#[tauri::command]
pub async fn get_file_thumbnail(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::get_file_thumbnail(app_paths, path, size).await
}

#[tauri::command]
pub async fn get_file_thumbnail_path(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::get_file_thumbnail_path(app_paths, path, size).await
}

#[tauri::command]
pub fn get_font_info(
    path: String,
) -> Result<FontInfo> {
    quickfolder_core::get_font_info(path)
}

#[tauri::command]
pub async fn get_image_dimensions(
    app: tauri::AppHandle,
    path: String,
) -> Result<Option<(u32, u32)>> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::get_image_dimensions(app_paths, path).await
}

#[tauri::command]
pub async fn get_psd_preview_path(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::get_psd_preview_path(app_paths, path, size).await
}

#[tauri::command]
pub async fn get_psd_thumbnail(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::get_psd_thumbnail(app_paths, path, size).await
}

#[tauri::command]
pub async fn get_psd_thumbnail_path(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::get_psd_thumbnail_path(app_paths, path, size).await
}

#[tauri::command]
pub async fn get_video_thumbnail(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::get_video_thumbnail(app_paths, path, size).await
}

#[tauri::command]
pub async fn get_video_thumbnail_path(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::get_video_thumbnail_path(app_paths, path, size).await
}

#[tauri::command]
pub async fn gif_to_mp4(
    path: String,
) -> Result<String> {
    quickfolder_core::gif_to_mp4(path).await
}

#[tauri::command]
pub async fn install_ffmpeg(
) -> Result<()> {
    quickfolder_core::install_ffmpeg().await
}

#[tauri::command]
pub async fn install_fonttools(
) -> Result<()> {
    quickfolder_core::install_fonttools().await
}

#[tauri::command]
pub async fn invalidate_thumbnail_cache(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<()> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::invalidate_thumbnail_cache(app_paths, paths).await
}

#[tauri::command]
pub fn is_directory(
    path: String,
) -> bool {
    quickfolder_core::is_directory(path)
}

#[tauri::command]
pub async fn laigter_maps_export(
    input: String,
    params: LaigterParams,
    options: LaigterExportOptions,
) -> Result<Vec<String>> {
    quickfolder_core::laigter_maps_export(input, params, options).await
}

#[tauri::command]
pub async fn laigter_maps_preview(
    input: String,
    params: LaigterParams,
    max_side: Option<u32>,
) -> Result<LaigterMapsPreviewResponse> {
    quickfolder_core::laigter_maps_preview(input, params, max_side).await
}

#[tauri::command]
pub async fn list_directory(
    app: tauri::AppHandle,
    path: String,
) -> Result<Vec<FileEntry>> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::list_directory(app_paths, path).await
}

#[tauri::command]
pub async fn list_system_roots(
) -> Result<Vec<FileEntry>> {
    quickfolder_core::list_system_roots().await
}

#[tauri::command]
pub async fn materialize_archive_paths(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<Vec<String>> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::materialize_archive_paths(app_paths, paths).await
}

#[tauri::command]
pub async fn merge_folders(
    app: tauri::AppHandle,
    source: String,
    dest_parent: String,
    conflict_mode: FolderMergeConflictMode,
    is_move: bool,
) -> Result<()> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::merge_folders(app_paths, source, dest_parent, conflict_mode, is_move).await
}

#[tauri::command]
pub async fn merge_fonts(
    base_path: String,
    merge_path: String,
    output_path: String,
) -> Result<String> {
    quickfolder_core::merge_fonts(base_path, merge_path, output_path).await
}

#[tauri::command]
pub async fn move_items(
    app: tauri::AppHandle,
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
) -> Result<()> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::move_items(app_paths, sources, dest, overwrite).await
}

#[tauri::command]
pub async fn pixelate_image(
    input: String,
    pixel_size: u32,
    scale: u32,
    max_colors: u32,
) -> Result<String> {
    quickfolder_core::pixelate_image(input, pixel_size, scale, max_colors).await
}

#[tauri::command]
pub async fn pixelate_preview(
    input: String,
    pixel_size: u32,
    scale: u32,
    max_colors: u32,
) -> Result<String> {
    quickfolder_core::pixelate_preview(input, pixel_size, scale, max_colors).await
}

#[tauri::command]
pub async fn prewarm_psd_preview(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<bool> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::prewarm_psd_preview(app_paths, path, size).await
}

#[tauri::command]
pub async fn read_cached_listing(
    app: tauri::AppHandle,
    path: String,
) -> Result<Option<Vec<FileEntry>>> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::read_cached_listing(app_paths, path).await
}

#[tauri::command]
pub fn read_font_bytes(
    path: String,
) -> Result<String> {
    quickfolder_core::read_font_bytes(path)
}

#[tauri::command]
pub fn read_text_file(
    app: tauri::AppHandle,
    path: String,
    max_bytes: usize,
) -> Result<String> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::read_text_file(app_paths, path, max_bytes)
}

#[tauri::command]
pub async fn remove_white_bg_preview(
    input: String,
    threshold: u8,
    feather: u8,
    seeds: Vec<[u32; 2]>,
) -> Result<String> {
    quickfolder_core::remove_white_bg_preview(input, threshold, feather, seeds).await
}

#[tauri::command]
pub async fn remove_white_bg_save(
    inputs: Vec<String>,
    threshold: u8,
    feather: u8,
    seeds: Vec<[u32; 2]>,
    trim: bool,
) -> Result<Vec<String>> {
    quickfolder_core::remove_white_bg_save(inputs, threshold, feather, seeds, trim).await
}

#[tauri::command]
pub async fn rename_item(
    app: tauri::AppHandle,
    old_path: String,
    new_path: String,
) -> Result<()> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::rename_item(app_paths, old_path, new_path).await
}

#[tauri::command]
pub async fn resize_image(
    path: String,
    width: u32,
    height: u32,
) -> Result<String> {
    quickfolder_core::resize_image(path, width, height).await
}

#[tauri::command]
pub async fn restore_trash_items(
    original_paths: Vec<String>,
) -> Result<()> {
    quickfolder_core::restore_trash_items(original_paths).await
}

#[tauri::command]
pub async fn save_annotated_image(
    original_path: String,
    image_data: String,
) -> Result<String> {
    quickfolder_core::save_annotated_image(original_path, image_data).await
}

#[tauri::command]
pub async fn save_sprite_sheet(
    images: Vec<String>,
    cell_width: u32,
    cell_height: u32,
    cols: u32,
    rows: u32,
    output: String,
) -> Result<String> {
    quickfolder_core::save_sprite_sheet(images, cell_width, cell_height, cols, rows, output).await
}

#[tauri::command]
pub async fn split_sprite_sheet(
    input: String,
    cols: u32,
    rows: u32,
    output_dir: String,
    base_name: String,
) -> Result<Vec<String>> {
    quickfolder_core::split_sprite_sheet(input, cols, rows, output_dir, base_name).await
}

#[tauri::command]
pub async fn sprite_sheet_preview(
    images: Vec<String>,
    cell_width: u32,
    cell_height: u32,
    cols: u32,
    rows: u32,
) -> Result<String> {
    quickfolder_core::sprite_sheet_preview(images, cell_width, cell_height, cols, rows).await
}

#[tauri::command]
pub async fn transfer_items_with_progress(
    app: tauri::AppHandle,
    operation: String,
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
    on_progress: tauri::ipc::Channel<TransferQueueProgress>,
) -> Result<()> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::transfer_items_with_progress(app_paths, operation, sources, dest, overwrite, crate::modules::tauri_glue::channel_sink(on_progress)).await
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
    scale_width: Option<i32>,
    speed: Option<f64>,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String> {
    quickfolder_core::trim_video(input, start_sec, end_sec, crop_x, crop_y, crop_w, crop_h, scale_width, speed, crate::modules::tauri_glue::channel_sink(on_progress)).await
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
    scale_width: Option<i32>,
    speed: Option<f64>,
    on_progress: tauri::ipc::Channel<VideoProgress>,
) -> Result<String> {
    quickfolder_core::video_to_gif(input, start_sec, end_sec, crop_x, crop_y, crop_w, crop_h, scale_width, speed, crate::modules::tauri_glue::channel_sink(on_progress)).await
}

#[tauri::command]
pub async fn write_cached_listing(
    app: tauri::AppHandle,
    path: String,
    entries: Vec<FileEntry>,
) -> Result<()> {
    let app_paths = crate::modules::tauri_glue::app_paths(&app)?;
    quickfolder_core::write_cached_listing(app_paths, path, entries).await
}

#[tauri::command]
pub async fn write_text_file(
    path: String,
    content: String,
) -> Result<()> {
    quickfolder_core::write_text_file(path, content).await
}

#[tauri::command]
pub async fn find_duplicate_files(
    root: String,
) -> std::result::Result<Vec<DuplicateGroup>, String> {
    quickfolder_core::find_duplicate_files(root).await
}

#[tauri::command]
pub fn get_google_drive_file_id(
    path: String,
) -> std::result::Result<String, String> {
    quickfolder_core::get_google_drive_file_id(path)
}

#[tauri::command]
pub async fn get_recent_files(
    roots: Vec<String>,
    days: u32,
) -> std::result::Result<Vec<FileEntry>, String> {
    quickfolder_core::get_recent_files(roots, days).await
}

#[tauri::command]
pub async fn search_files(
    root: String,
    query: String,
    max_results: usize,
) -> std::result::Result<Vec<FileEntry>, String> {
    quickfolder_core::search_files(root, query, max_results).await
}

#[tauri::command]
pub fn set_google_drive_offline(
    path: String,
    offline: bool,
) -> std::result::Result<(), String> {
    quickfolder_core::set_google_drive_offline(path, offline)
}
