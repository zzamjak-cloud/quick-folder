use crate::modules::archive_ops::materialize_archive_path_in_cache;
use crate::modules::error::{AppError, Result};
use crate::modules::image_ops::{invalidate_thumbnail_cache_paths_in_root, thumbnail_cache_root};

// ===== 파일/디렉토리 생성 =====

// 새 폴더 생성
#[tauri::command]
pub async fn create_directory(path: String) -> Result<()> {
    std::fs::create_dir_all(&path)?;
    Ok(())
}

// 빈 텍스트 파일 생성
#[tauri::command]
pub async fn create_text_file(path: String) -> Result<()> {
    let p = std::path::Path::new(&path);
    if p.exists() {
        return Err(AppError::AlreadyExists(
            "이미 존재하는 파일입니다".to_string(),
        ));
    }
    std::fs::write(&path, "")?;
    Ok(())
}

// 텍스트 파일 읽기 (미리보기용, 최대 바이트 제한)
pub(super) fn read_text_file_impl(path: &std::path::Path, max_bytes: usize) -> Result<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let meta = file.metadata()?;
    let read_size = (meta.len() as usize).min(max_bytes);
    let mut buf = vec![0u8; read_size];
    file.read_exact(&mut buf)?;
    // UTF-8 유효하지 않은 바이트는 대체 문자로 변환
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

// 텍스트 파일에 내용 쓰기
#[tauri::command]
pub fn read_text_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
    max_bytes: usize,
) -> Result<String> {
    let resolved_path = materialize_archive_path_in_cache(&app, &path)?
        .unwrap_or_else(|| std::path::PathBuf::from(&path));
    read_text_file_impl(&resolved_path, max_bytes)
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<()> {
    std::fs::write(&path, content)?;
    Ok(())
}

// ===== 이름 변경 =====

pub(super) async fn rename_item_impl(
    old_path: String,
    new_path: String,
    app_cache: Option<&std::path::Path>,
) -> Result<()> {
    if old_path == new_path {
        return Ok(());
    }
    if std::path::Path::new(&new_path).exists() {
        return Err(AppError::AlreadyExists(
            "동일한 이름의 파일이 존재합니다.".to_string(),
        ));
    }
    if let Some(app_cache) = app_cache {
        invalidate_thumbnail_cache_paths_in_root(app_cache, std::slice::from_ref(&old_path));
    }
    std::fs::rename(&old_path, &new_path)?;
    Ok(())
}

// 이름 바꾸기 (대상 경로에 동일 이름 파일 존재 시 에러)
#[tauri::command]
pub async fn rename_item<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    old_path: String,
    new_path: String,
) -> Result<()> {
    let app_cache = thumbnail_cache_root(&app)?;
    rename_item_impl(old_path, new_path, Some(&app_cache)).await
}

// ===== 삭제 =====

/// 클라우드 스토리지 경로 판별 (Google Drive, OneDrive, Dropbox 등)
/// macOS에서 trash::delete 시 시스템 권한 팝업을 방지하기 위해 사용
pub(super) fn is_cloud_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    let norm = lower.replace('\\', "/");
    lower.contains("/library/cloudstorage/")
        || lower.contains("/library/mobile documents/")
        || lower.contains("/google drive/")
        || lower.contains("\\google drive")
        || is_windows_google_drive_virtual(&norm)
        || lower.contains("/onedrive/")
        || lower.contains("\\onedrive")
        || lower.contains("/dropbox/")
        || lower.contains("\\dropbox")
}

/// Windows Google Drive 가상 드라이브 (G:\My Drive 등)
fn is_windows_google_drive_virtual(norm: &str) -> bool {
    const ROOTS: &[&str] = &[
        "my drive",
        "내 드라이브",
        "shared drives",
        "공유 드라이브",
        "other computers",
        "computers",
    ];
    let Some(colon) = norm.find(":/") else {
        return false;
    };
    if colon != 1 {
        return false;
    }
    let after = &norm[colon + 2..];
    ROOTS
        .iter()
        .any(|root| after == *root || after.starts_with(&format!("{}/", root)))
}

/// 경로에 따라 직접 삭제 수행 (디렉토리/파일 구분)
fn remove_directly(p: &std::path::Path, _path: &str) -> Result<()> {
    if p.is_dir() {
        std::fs::remove_dir_all(p)?;
    } else {
        std::fs::remove_file(p)?;
    }
    Ok(())
}

// 파일/폴더 삭제 (use_trash=true면 휴지통, 클라우드 경로는 직접 삭제)
// spawn_blocking: 네트워크 파일시스템에서 tokio 워커 차단 방지
// macOS: NsFileManager 사용 (Finder AppleScript 대비 빠르고 권한 문제 없음)
pub(super) async fn delete_items_impl(
    paths: Vec<String>,
    use_trash: bool,
    app_cache: Option<std::path::PathBuf>,
) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || -> Result<()> {
        if let Some(app_cache) = app_cache {
            invalidate_thumbnail_cache_paths_in_root(&app_cache, &paths);
        }

        #[cfg(target_os = "macos")]
        let ctx = {
            use trash::macos::{DeleteMethod, TrashContextExtMacos};
            let mut c = trash::TrashContext::new();
            c.set_delete_method(DeleteMethod::NsFileManager);
            c
        };

        #[cfg(not(target_os = "macos"))]
        let ctx = trash::TrashContext::new();
        for path in &paths {
            let p = std::path::Path::new(path.as_str());
            if use_trash && !is_cloud_path(path) {
                ctx.delete(p)
                    .map_err(|e| AppError::Io(format!("휴지통 이동 실패 {}: {}", path, e)))?;
            } else {
                remove_directly(p, path)?;
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::Internal(format!("삭제 작업 실패: {}", e)))?
}

#[tauri::command]
pub async fn delete_items<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    paths: Vec<String>,
    use_trash: bool,
) -> Result<()> {
    let app_cache = thumbnail_cache_root(&app)?;
    delete_items_impl(paths, use_trash, Some(app_cache)).await
}

// Windows 관리자 권한으로 파일/폴더 삭제
// PowerShell Start-Process -Verb RunAs로 UAC 프롬프트 표시
#[tauri::command]
pub async fn delete_items_elevated(app: tauri::AppHandle, paths: Vec<String>) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        let _ = crate::modules::image_ops::invalidate_thumbnail_cache_paths(&app, &paths);
        // 임시 PowerShell 스크립트 파일에 삭제 명령 작성
        let temp_dir = std::env::temp_dir();
        let script_path = temp_dir.join(format!("qf_elevated_delete_{}.ps1", std::process::id()));

        let ps_commands: Vec<String> = paths
            .iter()
            .map(|p| {
                let escaped = p.replace("'", "''");
                format!(
                    "Remove-Item -LiteralPath '{}' -Recurse -Force -ErrorAction Stop",
                    escaped
                )
            })
            .collect();
        let script_content = ps_commands.join("\n");

        std::fs::write(&script_path, &script_content)?;

        let script_path_str = script_path.to_string_lossy().to_string();

        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"{}\"'",
                    script_path_str.replace("'", "''")
                ),
            ])
            .output()?;

        // 임시 파일 정리
        let _ = std::fs::remove_file(&script_path);

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !stderr.trim().is_empty() {
                return Err(AppError::Permission(format!(
                    "관리자 권한 삭제 실패: {}",
                    stderr
                )));
            }
        }

        // 실제 삭제 확인: 파일이 여전히 존재하면 실패
        for path in &paths {
            if std::path::Path::new(path).exists() {
                return Err(AppError::Internal(format!(
                    "관리자 권한 삭제 후에도 파일이 존재합니다: {}",
                    path
                )));
            }
        }

        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        let _ = paths;
        Err(AppError::UnsupportedPlatform(
            "관리자 권한 삭제는 Windows에서만 지원됩니다".to_string(),
        ))
    }
}

// ===== 휴지통 복원 =====

// 휴지통에서 파일 복원 (원래 경로로)
#[tauri::command]
pub async fn restore_trash_items(original_paths: Vec<String>) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || -> Result<()> {
        for orig_path in &original_paths {
            restore_single_item(orig_path)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::Internal(format!("복원 작업 실패: {}", e)))?
}

#[cfg(target_os = "macos")]
fn restore_single_item(orig_path: &str) -> Result<()> {
    let home =
        std::env::var("HOME").map_err(|_| AppError::Internal("HOME 환경변수 없음".to_string()))?;
    let trash_dir = std::path::Path::new(&home).join(".Trash");
    let orig = std::path::Path::new(orig_path);
    let name = orig
        .file_name()
        .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", orig_path)))?
        .to_string_lossy();

    // 정확한 이름 일치 먼저 시도
    let exact = trash_dir.join(&*name);
    if exact.exists() {
        std::fs::rename(&exact, orig)?;
        return Ok(());
    }

    // 충돌로 인해 이름이 변경되었을 수 있음 — 타임스탬프 패턴으로 검색
    // macOS는 "file 12.34.56 PM.ext" 형식으로 이름 변경
    let stem = orig.file_stem().unwrap_or_default().to_string_lossy();
    let ext = orig.extension().map(|e| e.to_string_lossy().to_string());
    let mut candidates: Vec<_> = std::fs::read_dir(&trash_dir)?
        .flatten()
        .filter(|entry| {
            let ename = entry.file_name().to_string_lossy().to_string();
            ename.starts_with(&*stem)
                && ext
                    .as_ref()
                    .map_or(true, |e| ename.ends_with(&format!(".{}", e)))
        })
        .collect();

    // 가장 최근 수정된 항목 선택
    candidates.sort_by(|a, b| {
        let ma = a
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::UNIX_EPOCH);
        let mb = b
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::UNIX_EPOCH);
        mb.cmp(&ma)
    });

    if let Some(found) = candidates.first() {
        std::fs::rename(found.path(), orig)?;
        Ok(())
    } else {
        Err(AppError::NotFound(format!(
            "휴지통에서 파일을 찾을 수 없습니다: {}",
            orig_path
        )))
    }
}

#[cfg(target_os = "windows")]
fn restore_single_item(orig_path: &str) -> Result<()> {
    let items =
        trash::os_limited::list().map_err(|e| AppError::Io(format!("휴지통 조회 실패: {}", e)))?;
    let orig = std::path::Path::new(orig_path);
    let target_name = orig.file_name().unwrap_or_default();
    let target_parent = orig.parent().unwrap_or(std::path::Path::new(""));

    // 원래 경로와 일치하는 항목 찾기 (가장 최근 것)
    let mut matching: Vec<_> = items
        .into_iter()
        .filter(|item| item.original_parent == target_parent && item.name == target_name)
        .collect();
    matching.sort_by(|a, b| b.time_deleted.cmp(&a.time_deleted));

    if let Some(item) = matching.into_iter().next() {
        trash::os_limited::restore_all(std::iter::once(item))
            .map_err(|e| AppError::Io(format!("복원 실패 {}: {}", orig_path, e)))
    } else {
        Err(AppError::NotFound(format!(
            "휴지통에서 파일을 찾을 수 없습니다: {}",
            orig_path
        )))
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn restore_single_item(orig_path: &str) -> Result<()> {
    Err(AppError::UnsupportedPlatform(format!(
        "이 플랫폼에서는 휴지통 복원이 지원되지 않습니다: {}",
        orig_path
    )))
}
