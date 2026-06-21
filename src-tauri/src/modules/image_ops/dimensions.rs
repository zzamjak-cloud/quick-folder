//! 이미지 규격 조회 모듈

use crate::modules::archive_ops::materialize_archive_path_in_cache;
use crate::modules::error::{AppError, Result};

#[tauri::command]
pub async fn get_image_dimensions(
    app: tauri::AppHandle,
    path: String,
) -> Result<Option<(u32, u32)>> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Option<(u32, u32)>> {
        use std::io::Read;

        let resolved_path = materialize_archive_path_in_cache(&app, &path)?
            .unwrap_or_else(|| std::path::PathBuf::from(&path));
        let resolved_path_str = resolved_path.to_string_lossy().to_string();
        let ext = resolved_path_str
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_lowercase();
        let supported = [
            "jpg", "jpeg", "png", "gif", "webp", "bmp", "psd", "psb", "ico", "icns",
        ];
        if !supported.contains(&ext.as_str()) {
            return Ok(None);
        }
        if ext == "psd" || ext == "psb" {
            // PSD 헤더에서 규격만 읽음 (26바이트만 필요, 전체 파일 로드 방지)
            let mut buf = [0u8; 26];
            let mut f = std::fs::File::open(&resolved_path)?;
            if f.read_exact(&mut buf).is_err() {
                return Ok(None);
            }
            let h = u32::from_be_bytes([buf[14], buf[15], buf[16], buf[17]]);
            let w = u32::from_be_bytes([buf[18], buf[19], buf[20], buf[21]]);
            return Ok(Some((w, h)));
        }
        if ext == "ico" {
            // ICO: ico 크레이트로 가장 큰 아이콘 크기 반환
            let file = std::fs::File::open(&resolved_path)?;
            if let Ok(icon_dir) = ico::IconDir::read(file) {
                let mut max_w = 0u32;
                let mut max_h = 0u32;
                for entry in icon_dir.entries() {
                    let w = entry.width();
                    let h = entry.height();
                    if w >= max_w && h >= max_h {
                        max_w = w;
                        max_h = h;
                    }
                }
                if max_w > 0 {
                    return Ok(Some((max_w, max_h)));
                }
            }
            return Ok(None);
        }
        if ext == "icns" {
            // ICNS: 가장 큰 아이콘의 크기를 반환
            let file = std::fs::File::open(&resolved_path)?;
            if let Ok(family) = icns::IconFamily::read(file) {
                let mut max_size = 0u32;
                for icon_type in family.available_icons() {
                    let s = icon_type.pixel_width();
                    if s > max_size {
                        max_size = s;
                    }
                }
                if max_size > 0 {
                    return Ok(Some((max_size, max_size)));
                }
            }
            return Ok(None);
        }
        match image::image_dimensions(&resolved_path_str) {
            Ok((w, h)) => Ok(Some((w, h))),
            Err(_) => Ok(None),
        }
    })
    .await
    .map_err(|e| AppError::Internal(format!("이미지 규격 조회 실패: {}", e)))?
}
