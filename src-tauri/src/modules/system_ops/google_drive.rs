//! Google Drive 통합 모듈
//! xattr 기반 파일 ID 추출 및 오프라인 핀 설정 (macOS 전용)

/// Google 서비스 파일(.gsheet, .gdoc 등)의 JSON에서 doc_id 추출 폴백
fn try_parse_google_service_file(path: &str) -> Option<String> {
    let lower = path.to_lowercase();
    if lower.ends_with(".gsheet")
        || lower.ends_with(".gdoc")
        || lower.ends_with(".gslides")
        || lower.ends_with(".gmap")
    {
        if let Ok(content) = std::fs::read_to_string(path) {
            // JSON 형식: {"doc_id": "FILE_ID", ...}
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(doc_id) = json.get("doc_id").and_then(|v| v.as_str()) {
                    if !doc_id.is_empty() {
                        return Some(doc_id.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Google Drive 파일의 extended attribute에서 파일 ID 추출
/// macOS: xattr -p com.google.drivefs.item-id#S <path>
/// 폴백: .gsheet/.gdoc 파일은 JSON 내 doc_id 사용
#[tauri::command]
pub fn get_google_drive_file_id(path: String) -> Result<String, String> {
    // 1차: xattr로 파일 ID 추출 (macOS 전용)
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("xattr")
            .args(["-p", "com.google.drivefs.item-id#S", &path])
            .output()
            .map_err(|e| format!("xattr 실행 실패: {}", e))?;

        if output.status.success() {
            let id = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !id.is_empty() {
                return Ok(id);
            }
        }
    }

    // 2차 폴백: Google 서비스 파일의 JSON에서 doc_id 추출
    if let Some(doc_id) = try_parse_google_service_file(&path) {
        return Ok(doc_id);
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Windows: Google 서비스 파일 JSON 폴백만 사용
        let _ = &path;
    }

    Ok(String::new())
}

/// Google Drive 파일의 오프라인 핀 설정/해제
/// macOS: com.google.drivefs.pinned xattr 조작
/// Windows: 미지원 (에러 반환 없이 no-op)
#[tauri::command]
pub fn set_google_drive_offline(path: String, offline: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if offline {
            // 오프라인 핀 설정: xattr -w com.google.drivefs.pinned 1 <path>
            let status = std::process::Command::new("xattr")
                .args(["-w", "com.google.drivefs.pinned", "1", &path])
                .status()
                .map_err(|e| format!("xattr 쓰기 실패: {}", e))?;
            if !status.success() {
                return Err("오프라인 핀 설정 실패".to_string());
            }
        } else {
            // 오프라인 핀 해제: xattr -d com.google.drivefs.pinned <path>
            // 이미 없는 경우 무시
            let _ = std::process::Command::new("xattr")
                .args(["-d", "com.google.drivefs.pinned", &path])
                .status();
        }
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Windows 등: no-op
        let _ = (path, offline);
        Ok(())
    }
}
