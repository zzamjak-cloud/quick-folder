//! Google Drive 통합 모듈
//! macOS: xattr 기반 파일 ID 추출 및 오프라인 핀 설정
//! Windows: DriveFS 가상 스트림(user.drive.id) 기반 파일 ID 추출

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

/// DriveFS 메타데이터 스트림 읽기 (Windows 전용)
#[cfg(target_os = "windows")]
fn read_drive_metadata_stream(path: &str, stream: &str) -> Option<String> {
    let stream_path = format!("{}:{}", path, stream);
    let value = std::fs::read_to_string(&stream_path).ok()?;
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

/// Windows DriveFS user.drive.id 스트림에서 파일 ID 추출
#[cfg(target_os = "windows")]
fn try_read_drive_id_stream(path: &str) -> Option<String> {
    let id = read_drive_metadata_stream(path, "user.drive.id")?;
    // 업로드 직후 'local' 접두사가 붙은 임시 ID는 무시
    if id.starts_with("local") {
        None
    } else {
        Some(id)
    }
}

pub(crate) fn get_google_drive_file_id_for_path(path: &str) -> Result<Option<String>, String> {
    // 1차: xattr로 파일 ID 추출 (macOS 전용)
    // getxattr 시스템콜 직접 호출 — 매 썸네일 요청(캐시 히트 포함)마다 xattr 서브프로세스를
    // fork/exec 하던 오버헤드 제거.
    #[cfg(target_os = "macos")]
    {
        if let Ok(Some(value)) = xattr::get(path, "com.google.drivefs.item-id#S") {
            let id = String::from_utf8_lossy(&value).trim().to_string();
            if !id.is_empty() {
                return Ok(Some(id));
            }
        }
    }

    // 1차: DriveFS 스트림 (Windows 전용)
    #[cfg(target_os = "windows")]
    if let Some(id) = try_read_drive_id_stream(path) {
        return Ok(Some(id));
    }

    // 2차 폴백: Google 서비스 파일의 JSON에서 doc_id 추출
    if let Some(doc_id) = try_parse_google_service_file(path) {
        return Ok(Some(doc_id));
    }

    Ok(None)
}

/// Google Drive 파일의 extended attribute에서 파일 ID 추출
/// macOS: xattr -p com.google.drivefs.item-id#S <path>
/// Windows: path:user.drive.id 스트림
/// 폴백: .gsheet/.gdoc 파일은 JSON 내 doc_id 사용
#[tauri::command]
pub fn get_google_drive_file_id(path: String) -> Result<String, String> {
    Ok(get_google_drive_file_id_for_path(&path)?.unwrap_or_default())
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
        // Windows DriveFS 스트림은 읽기 전용 — no-op
        let _ = (path, offline);
        Ok(())
    }
}
