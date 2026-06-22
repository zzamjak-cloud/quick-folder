use crate::helpers::stable_cache_key;
use std::path::PathBuf;

const FILE_ICON_CACHE_DIR: &str = "file_icons";

// OS 네이티브 파일 아이콘 메모리 캐시 (확장자별)
pub(super) fn icon_cache() -> &'static std::sync::Mutex<std::collections::HashMap<String, String>> {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn platform_cache_segment() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(target_os = "linux")]
    {
        "linux"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "other"
    }
}

pub(super) fn icon_cache_key(is_dir: bool, ext: &str, size: u32) -> String {
    let kind = if is_dir {
        "folder".to_string()
    } else if ext.is_empty() {
        "ext:__none__".to_string()
    } else {
        format!("ext:{}", ext)
    };
    let size = size.to_string();
    stable_cache_key(&[
        b"file-icon-v1",
        platform_cache_segment().as_bytes(),
        kind.as_bytes(),
        size.as_bytes(),
    ])
}

fn icon_cache_file<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cache_key: &str,
) -> Option<PathBuf> {
    use tauri::Manager;

    let dir = app.path().app_cache_dir().ok()?.join(FILE_ICON_CACHE_DIR);
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join(format!("{}.png", cache_key)))
}

pub(super) fn read_disk_icon_cache<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cache_key: &str,
) -> Option<Vec<u8>> {
    let cache_file = icon_cache_file(app, cache_key)?;
    let bytes = std::fs::read(cache_file).ok()?;
    if bytes.is_empty() {
        return None;
    }
    Some(bytes)
}

pub(super) fn write_disk_icon_cache<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cache_key: &str,
    bytes: &[u8],
) {
    if bytes.is_empty() {
        return;
    }
    if let Some(cache_file) = icon_cache_file(app, cache_key) {
        std::fs::write(cache_file, bytes).ok();
    }
}

#[cfg(test)]
mod tests {
    use super::{icon_cache_file, icon_cache_key, read_disk_icon_cache, write_disk_icon_cache};

    #[test]
    fn icon_cache_key_separates_kind_and_size() {
        let txt_128 = icon_cache_key(false, "txt", 128);
        let txt_64 = icon_cache_key(false, "txt", 64);
        let folder_128 = icon_cache_key(true, "", 128);
        let none_128 = icon_cache_key(false, "", 128);

        assert_eq!(txt_128, icon_cache_key(false, "txt", 128));
        assert_ne!(txt_128, txt_64);
        assert_ne!(txt_128, folder_128);
        assert_ne!(txt_128, none_128);
    }

    #[test]
    fn disk_icon_cache_roundtrips_bytes() {
        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();
        let cache_key = format!(
            "test-icon-cache-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let bytes = [137, 80, 78, 71, 13, 10, 26, 10];

        write_disk_icon_cache(&app_handle, &cache_key, &bytes);
        assert_eq!(
            read_disk_icon_cache(&app_handle, &cache_key),
            Some(bytes.to_vec())
        );

        if let Some(cache_file) = icon_cache_file(&app_handle, &cache_key) {
            std::fs::remove_file(cache_file).ok();
        }
    }
}
