//! HWP/HWPX 미리보기 텍스트 추출
//!
//! [hwarang](https://crates.io/crates/hwarang)로 HWP 5.0(OLE/CFB)·HWPX(ZIP) 본문 텍스트를 읽는다.

use std::path::Path;

/// HWP/HWPX 파일에서 미리보기용 텍스트를 추출한다.
/// 성공: 추출된 평문 (UTF-8) — 단락/줄바꿈은 라이브러리 출력에 따름
/// 실패: 사용자에게 보여줄 메시지
#[tauri::command]
pub async fn extract_hwp_text(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("파일이 존재하지 않습니다.".to_string());
    }
    let lower = path.to_lowercase();
    if !lower.ends_with(".hwp") && !lower.ends_with(".hwpx") {
        return Err("HWP/HWPX 파일이 아닙니다.".to_string());
    }

    let text = hwarang::extract_text_from_file(p).map_err(|e| e.to_string())?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("본문 텍스트를 추출하지 못했습니다.".to_string());
    }
    Ok(trimmed.to_string())
}
