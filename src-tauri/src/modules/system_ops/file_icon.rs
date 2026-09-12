//! 파일 아이콘 추출 모듈
//! OS 네이티브 아이콘 캐시 및 플랫폼별 추출 로직

mod cache;
mod native;
mod text;

use crate::modules::archive_ops::materialize_archive_path_in_cache;
use crate::modules::types::is_package_bundle;
use cache::{icon_cache, icon_cache_key, icon_cache_key_for_path, read_disk_icon_cache, write_disk_icon_cache};
use native::get_native_icon_bytes;

// OS 네이티브 파일 아이콘 가져오기 (확장자별 캐시)
#[tauri::command]
pub fn get_file_icon(
    app: tauri::AppHandle,
    path: String,
    size: u32,
    is_dir_hint: Option<bool>,
) -> Result<Option<String>, String> {
    use base64::Engine;

    let resolved_path = materialize_archive_path_in_cache(&app, &path)
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| std::path::PathBuf::from(&path));
    let resolved_path_str = resolved_path.to_string_lossy().to_string();
    let p = std::path::Path::new(&resolved_path_str);
    // macOS 번들(.app 등)은 디렉토리지만 아이콘은 앱마다 달라 폴더 아이콘/확장자 캐시를 쓸 수 없다.
    // → 경로+수정시각 단위로 캐시하고 NSWorkspace의 실제 번들 아이콘을 그대로 쓴다.
    let is_bundle = p.is_dir() && is_package_bundle(p);
    let is_dir = !is_bundle && (p.is_dir() || is_dir_hint.unwrap_or(false));
    let ext = if is_dir {
        String::new()
    } else {
        p.extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default()
    };
    let cache_key = if is_bundle {
        icon_cache_key_for_path(&resolved_path_str, p, size)
    } else {
        icon_cache_key(is_dir, &ext, size)
    };

    // 1차: 메모리 캐시
    {
        let cache = icon_cache().lock().map_err(|e| e.to_string())?;
        if let Some(b64) = cache.get(&cache_key) {
            return Ok(Some(b64.clone()));
        }
    }

    // 2차: 디스크 캐시. 앱 업데이트/재시작 후에도 OS 아이콘 재호출을 피한다.
    if let Some(bytes) = read_disk_icon_cache(&app, &cache_key) {
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let mut cache = icon_cache().lock().map_err(|e| e.to_string())?;
        cache.insert(cache_key, b64.clone());
        return Ok(Some(b64));
    }

    // 플랫폼별 아이콘 추출 (패닉 방지)
    // 아이콘은 확장자별 캐시로 재사용되어 실질적으로 한 번만 호출 → 세마포어 불필요
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        get_native_icon_bytes(&resolved_path_str, size, is_dir)
    })) {
        Ok(Some(bytes)) => {
            write_disk_icon_cache(&app, &cache_key, &bytes);
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let mut cache = icon_cache().lock().map_err(|e| e.to_string())?;
            cache.insert(cache_key, b64.clone());
            Ok(Some(b64))
        }
        _ => Ok(None),
    }
}
