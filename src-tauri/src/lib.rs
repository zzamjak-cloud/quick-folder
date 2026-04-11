mod helpers;
use helpers::*;
mod modules;
use modules::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_drag::init())
    .invoke_handler(tauri::generate_handler![
        open_folder,
        copy_path,
        select_folder,
        list_directory,
        get_image_dimensions,
        get_file_thumbnail,
        get_psd_thumbnail,
        get_file_icon,
        check_duplicate_items,
        copy_items,
        copy_items_with_progress,
        duplicate_items,
        move_items,
        delete_items,
        delete_items_elevated,
        restore_trash_items,
        create_directory,
        create_text_file,
        write_text_file,
        rename_item,
        quick_look,
        is_directory,
        get_video_thumbnail,
        compress_to_zip,
        extract_zip,
        open_with_app,
        open_in_photoshop,
        read_text_file,
        write_files_to_clipboard,
        read_files_from_clipboard,
        paste_image_from_clipboard,
        invalidate_thumbnail_cache,
        get_recent_files,
        search_files,
        check_ffmpeg,
        compress_video,
        trim_video,
        cut_video,
        concat_videos,
        video_to_gif,
        pixelate_preview,
        pixelate_image,
        sprite_sheet_preview,
        save_sprite_sheet,
        split_sprite_sheet,
        convert_to_ico,
        convert_to_icns,
        remove_white_bg_preview,
        remove_white_bg_save,
        crop_image,
        save_annotated_image,
        compress_pdf,
        check_gs,
        download_gs,
        install_gs,
        get_font_info,
        read_font_bytes,
        check_fonttools,
        install_fonttools,
        merge_fonts,
        compress_gif,
        get_google_drive_file_id,
        set_google_drive_offline,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
