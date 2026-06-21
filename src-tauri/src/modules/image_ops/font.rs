//! 폰트 정보 처리 모듈

use crate::modules::error::{AppError, Result};

// ─── 폰트 처리 ─────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct FontInfo {
    name: String,
    family: String,
    style: String,
    glyph_count: u32,
}

#[tauri::command]
pub fn get_font_info(path: String) -> Result<FontInfo> {
    let data = std::fs::read(&path)?;
    let face = ttf_parser::Face::parse(&data, 0)
        .map_err(|e| AppError::FontProcessing(format!("폰트 파싱 실패: {}", e)))?;

    let mut name = String::new();
    let mut family = String::new();
    let mut style = String::new();

    for record in face.names() {
        // name_id 4 = Full Name, 1 = Family, 2 = Style
        if let Some(s) = record.to_string() {
            match record.name_id {
                ttf_parser::name_id::FULL_NAME => {
                    if name.is_empty() {
                        name = s;
                    }
                }
                ttf_parser::name_id::FAMILY => {
                    if family.is_empty() {
                        family = s;
                    }
                }
                ttf_parser::name_id::SUBFAMILY => {
                    if style.is_empty() {
                        style = s;
                    }
                }
                _ => {}
            }
        }
    }

    if name.is_empty() {
        // 파일명에서 추출
        name = std::path::Path::new(&path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();
    }
    if family.is_empty() {
        family = name.clone();
    }
    if style.is_empty() {
        style = "Regular".to_string();
    }

    Ok(FontInfo {
        name,
        family,
        style,
        glyph_count: face.number_of_glyphs() as u32,
    })
}

#[tauri::command]
pub fn read_font_bytes(path: String) -> Result<String> {
    let data = std::fs::read(&path)?;
    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}
