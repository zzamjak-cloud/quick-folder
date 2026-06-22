//! 파일 아이콘 추출 모듈
//! OS 네이티브 아이콘 캐시 및 플랫폼별 추출 로직

mod cache;
mod native;
mod text;

use crate::modules::archive_ops::materialize_archive_path_in_cache;
use cache::icon_cache;
use native::get_native_icon_bytes;

// OS 네이티브 파일 아이콘 가져오기 (확장자별 캐시)
#[tauri::command]
pub fn get_file_icon(
    app: tauri::AppHandle,
    path: String,
    size: u32,
) -> Result<Option<String>, String> {
    use base64::Engine;

    let resolved_path = materialize_archive_path_in_cache(&app, &path)
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| std::path::PathBuf::from(&path));
    let resolved_path_str = resolved_path.to_string_lossy().to_string();
    let p = std::path::Path::new(&resolved_path_str);
    let cache_key = if p.is_dir() {
        format!("__folder___{}", size)
    } else {
        let ext = p
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        format!("{}_{}", ext, size)
    };

    // 캐시 히트
    {
        let cache = icon_cache().lock().map_err(|e| e.to_string())?;
        if let Some(b64) = cache.get(&cache_key) {
            return Ok(Some(b64.clone()));
        }
    }

    // 플랫폼별 아이콘 추출 (패닉 방지)
    // 아이콘은 확장자별 캐시로 재사용되어 실질적으로 한 번만 호출 → 세마포어 불필요
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        get_native_icon_bytes(&resolved_path_str, size)
    })) {
        Ok(Some(bytes)) => {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let mut cache = icon_cache().lock().map_err(|e| e.to_string())?;
            cache.insert(cache_key, b64.clone());
            Ok(Some(b64))
        }
        _ => Ok(None),
    }
}
