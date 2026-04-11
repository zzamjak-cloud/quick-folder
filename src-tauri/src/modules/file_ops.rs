//! 파일 및 디렉토리 조작 모듈
//! list_directory, rename, copy, move, delete, zip 등 17개 Tauri command 포함

use crate::helpers::*;
use super::types::{FileEntry, FileType, classify_file};
use super::error::{AppError, Result};

// ===== 디렉토리 목록 조회 =====

// 디렉토리 목록 조회
#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileEntry>> {
    // spawn_blocking: 네트워크 파일시스템(Google Drive 등) I/O가 tokio 워커를 차단하지 않도록 분리
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<FileEntry>> {
        let entries = std::fs::read_dir(&path)?;
        let mut result = vec![];
        for entry in entries.flatten() {
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            // Windows: 숨김(HIDDEN) 또는 시스템(SYSTEM) 속성 파일 제외
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::fs::MetadataExt;
                // FILE_ATTRIBUTE_HIDDEN(0x2) | FILE_ATTRIBUTE_SYSTEM(0x4)
                if meta.file_attributes() & 0x6 != 0 {
                    continue;
                }
            }

            let name = entry.file_name().to_string_lossy().to_string();
            // 숨김 파일 제외 (점으로 시작하는 파일)
            if name.starts_with('.') {
                continue;
            }
            // Windows 시스템 파일 이름으로 필터링 (대소문자 무관)
            let name_lower = name.to_lowercase();
            if name_lower == "desktop.ini" || name_lower == "thumbs.db" || name_lower == "ntuser.dat" {
                continue;
            }

            let file_type = if meta.is_dir() {
                FileType::Directory
            } else {
                classify_file(&name)
            };
            result.push(FileEntry {
                path: entry.path().to_string_lossy().to_string(),
                is_dir: meta.is_dir(),
                size: if meta.is_dir() { 0 } else { meta.len() },
                modified,
                file_type,
                name,
            });
        }
        Ok(result)
    })
    .await
    .map_err(|e| AppError::Internal(format!("디렉토리 읽기 태스크 실패: {}", e)))?
}

// ===== 경로 확인 =====

// 경로가 디렉토리인지 확인
#[tauri::command]
pub fn is_directory(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

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
        return Err(AppError::AlreadyExists("이미 존재하는 파일입니다".to_string()));
    }
    std::fs::write(&path, "")?;
    Ok(())
}

// 텍스트 파일 읽기 (미리보기용, 최대 바이트 제한)
#[tauri::command]
pub fn read_text_file(path: String, max_bytes: usize) -> Result<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(&path)?;
    let meta = file.metadata()?;
    let read_size = (meta.len() as usize).min(max_bytes);
    let mut buf = vec![0u8; read_size];
    file.read_exact(&mut buf)?;
    // UTF-8 유효하지 않은 바이트는 대체 문자로 변환
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

// 텍스트 파일에 내용 쓰기
#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<()> {
    std::fs::write(&path, content)?;
    Ok(())
}

// ===== 이름 변경 =====

// 이름 바꾸기 (대상 경로에 동일 이름 파일 존재 시 에러)
#[tauri::command]
pub async fn rename_item(old_path: String, new_path: String) -> Result<()> {
    if old_path == new_path { return Ok(()); }
    if std::path::Path::new(&new_path).exists() {
        return Err(AppError::AlreadyExists("동일한 이름의 파일이 존재합니다.".to_string()));
    }
    std::fs::rename(&old_path, &new_path)?;
    Ok(())
}

// ===== 복사 관련 헬퍼 =====

// 재귀 디렉토리 복사 헬퍼
pub fn copy_dir_recursive(src: &std::path::Path, dest: &std::path::Path) -> Result<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)?.flatten() {
        let dest_child = dest.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_recursive(&entry.path(), &dest_child)?;
        } else {
            std::fs::copy(entry.path(), &dest_child)?;
        }
    }
    Ok(())
}

/// copy_items와 동일한 대상 경로 결정 (실제로 복사할 (소스, 대상) 쌍만 수집)
fn collect_copy_jobs(
    sources: &[String],
    dest: &std::path::Path,
    overwrite: bool,
) -> Result<Vec<(std::path::PathBuf, std::path::PathBuf)>> {
    let mut jobs = Vec::new();
    for source in sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let mut dest_path = dest.join(file_name);

        if dest_path.exists() && dest_path.canonicalize().ok() == src_path.canonicalize().ok() {
            let stem = src_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let ext = src_path
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();
            let is_dir = src_path.is_dir();
            dest_path = get_copy_destination(dest, &stem, &ext, is_dir);
        } else if dest_path.exists() && overwrite {
            if dest_path.is_dir() {
                std::fs::remove_dir_all(&dest_path)?;
            } else {
                std::fs::remove_file(&dest_path)?;
            }
        } else if dest_path.exists() {
            continue;
        }
        jobs.push((src_path.to_path_buf(), dest_path));
    }
    Ok(jobs)
}

fn count_files_to_copy(path: &std::path::Path) -> Result<u64> {
    use walkdir::WalkDir;
    if path.is_file() {
        return Ok(1);
    }
    if !path.is_dir() {
        return Ok(0);
    }
    let mut n = 0u64;
    for entry in WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            n += 1;
        }
    }
    Ok(n)
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyProgress {
    pub percent: f32,
    pub done_files: u64,
    pub total_files: u64,
    pub current_name: String,
}

fn copy_dir_recursive_with_progress(
    src: &std::path::Path,
    dest: &std::path::Path,
    total_files: u64,
    done: &mut u64,
    on_progress: &tauri::ipc::Channel<CopyProgress>,
) -> Result<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)?.flatten() {
        let dest_child = dest.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_recursive_with_progress(&entry.path(), &dest_child, total_files, done, on_progress)?;
        } else {
            std::fs::copy(entry.path(), &dest_child)?;
            *done += 1;
            let name = entry.file_name().to_string_lossy().to_string();
            let pct = if total_files > 0 {
                (*done as f32 / total_files as f32) * 100.0
            } else {
                100.0
            };
            let _ = on_progress.send(CopyProgress {
                percent: pct.min(100.0),
                done_files: *done,
                total_files,
                current_name: name,
            });
        }
    }
    Ok(())
}

// ===== 중복 확인 =====

// 대상 디렉토리에서 중복되는 파일명 확인
#[tauri::command]
pub async fn check_duplicate_items(sources: Vec<String>, dest: String) -> Result<Vec<String>> {
    let mut duplicates = Vec::new();
    for source in &sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let dest_path = std::path::Path::new(&dest).join(file_name);
        // 같은 파일이 아닌 다른 파일이 이미 존재하는 경우만 중복으로 판단
        if dest_path.exists() && dest_path.canonicalize().ok() != src_path.canonicalize().ok() {
            duplicates.push(file_name.to_string_lossy().to_string());
        }
    }
    Ok(duplicates)
}

// ===== 복사 =====

// 파일/폴더 복사 (재귀 지원, overwrite=true면 기존 파일 덮어쓰기)
#[tauri::command]
pub async fn copy_items(sources: Vec<String>, dest: String, overwrite: Option<bool>) -> Result<()> {
    let overwrite = overwrite.unwrap_or(false);
    for source in &sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let mut dest_path = std::path::Path::new(&dest).join(file_name);

        // 같은 경로 충돌 시 "(복사)", "(복사 2)" 접미사 추가
        if dest_path.exists() && dest_path.canonicalize().ok() == src_path.canonicalize().ok() {
            let stem = src_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let ext = src_path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
            let is_dir = src_path.is_dir();
            dest_path = get_copy_destination(std::path::Path::new(&dest), &stem, &ext, is_dir);
        } else if dest_path.exists() && overwrite {
            // 덮어쓰기: 기존 파일/폴더 삭제 후 복사
            if dest_path.is_dir() {
                std::fs::remove_dir_all(&dest_path)?;
            } else {
                std::fs::remove_file(&dest_path)?;
            }
        } else if dest_path.exists() {
            // 덮어쓰기 안 함: 스킵
            continue;
        }

        if src_path.is_dir() {
            copy_dir_recursive(src_path, &dest_path)?;
        } else {
            std::fs::copy(src_path, &dest_path)?;
        }
    }
    Ok(())
}

/// 파일 단위 진행률(0~100%)을 Channel로 전송하는 복사 (클라우드 드라이브 등 대용량 복사용)
#[tauri::command]
pub async fn copy_items_with_progress(
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
    on_progress: tauri::ipc::Channel<CopyProgress>,
) -> Result<()> {
    let overwrite = overwrite.unwrap_or(false);
    let dest_path = std::path::PathBuf::from(dest);
    let on_progress = on_progress.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let jobs = collect_copy_jobs(&sources, &dest_path, overwrite)?;
        let mut total_files = 0u64;
        for (src, _) in &jobs {
            total_files += count_files_to_copy(src)?;
        }

        let _ = on_progress.send(CopyProgress {
            percent: 0.0,
            done_files: 0,
            total_files,
            current_name: String::new(),
        });

        let mut done = 0u64;
        for (src, dest_one) in jobs {
            if src.is_dir() {
                copy_dir_recursive_with_progress(&src, &dest_one, total_files, &mut done, &on_progress)?;
            } else {
                std::fs::copy(&src, &dest_one)?;
                done += 1;
                let pct = if total_files > 0 {
                    (done as f32 / total_files as f32) * 100.0
                } else {
                    100.0
                };
                let name = src
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                let _ = on_progress.send(CopyProgress {
                    percent: pct.min(100.0),
                    done_files: done,
                    total_files,
                    current_name: name,
                });
            }
        }

        let _ = on_progress.send(CopyProgress {
            percent: 100.0,
            done_files: done,
            total_files,
            current_name: String::new(),
        });

        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Internal(format!("복사 작업 실패: {}", e)))?
}

// ===== 복제 =====

// 파일/폴더 복제 (같은 디렉토리에 " (복사)" 접미사)
#[tauri::command]
pub async fn duplicate_items(paths: Vec<String>) -> Result<Vec<String>> {
    let mut new_paths = vec![];
    for source in &paths {
        let src = std::path::Path::new(source);
        let parent = src.parent().ok_or_else(|| AppError::InvalidInput(format!("상위 디렉토리 없음: {}", source)))?;
        let stem = src.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let ext = src.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
        let is_dir = src.is_dir();

        // 충돌 방지: " (복사)", " (복사 2)", " (복사 3)" ...
        let dest_path = get_copy_destination(parent, &stem, &ext, is_dir);

        if is_dir {
            copy_dir_recursive(src, &dest_path)?;
        } else {
            std::fs::copy(src, &dest_path)?;
        }
        new_paths.push(dest_path.to_string_lossy().to_string());
    }
    Ok(new_paths)
}

// ===== 이동 =====

// 파일/폴더 이동 (overwrite=true면 기존 파일 덮어쓰기)
#[tauri::command]
pub async fn move_items(sources: Vec<String>, dest: String, overwrite: Option<bool>) -> Result<()> {
    let overwrite = overwrite.unwrap_or(false);
    for source in &sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let dest_path = std::path::Path::new(&dest).join(file_name);

        // 대상에 같은 이름 파일이 있으면 덮어쓰기 처리
        if dest_path.exists() && dest_path.canonicalize().ok() != src_path.canonicalize().ok() {
            if overwrite {
                if dest_path.is_dir() {
                    std::fs::remove_dir_all(&dest_path)?;
                } else {
                    std::fs::remove_file(&dest_path)?;
                }
            } else {
                continue; // 덮어쓰기 안 함: 스킵
            }
        }

        // 같은 볼륨이면 rename, 다른 볼륨이면 복사 후 삭제
        if std::fs::rename(src_path, &dest_path).is_err() {
            if src_path.is_dir() {
                copy_dir_recursive(src_path, &dest_path)?;
                std::fs::remove_dir_all(src_path)?;
            } else {
                std::fs::copy(src_path, &dest_path)?;
                std::fs::remove_file(src_path)?;
            }
        }
    }
    Ok(())
}

// ===== 삭제 =====

/// 클라우드 스토리지 경로 판별 (Google Drive, OneDrive, Dropbox 등)
/// macOS에서 trash::delete 시 시스템 권한 팝업을 방지하기 위해 사용
fn is_cloud_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.contains("/library/cloudstorage/")
        || lower.contains("/library/mobile documents/")
        || lower.contains("/google drive/")
        || lower.contains("/onedrive/")
        || lower.contains("/dropbox/")
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
#[tauri::command]
pub async fn delete_items(paths: Vec<String>, use_trash: bool) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || -> Result<()> {
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
                ctx.delete(p).map_err(|e| AppError::Io(format!("휴지통 이동 실패 {}: {}", path, e)))?;
            } else {
                remove_directly(p, path)?;
            }
        }
        Ok(())
    }).await.map_err(|e| AppError::Internal(format!("삭제 작업 실패: {}", e)))?
}

// Windows 관리자 권한으로 파일/폴더 삭제
// PowerShell Start-Process -Verb RunAs로 UAC 프롬프트 표시
#[tauri::command]
pub async fn delete_items_elevated(paths: Vec<String>) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        // 임시 PowerShell 스크립트 파일에 삭제 명령 작성
        let temp_dir = std::env::temp_dir();
        let script_path = temp_dir.join(format!("qf_elevated_delete_{}.ps1", std::process::id()));

        let ps_commands: Vec<String> = paths.iter().map(|p| {
            let escaped = p.replace("'", "''");
            format!("Remove-Item -LiteralPath '{}' -Recurse -Force -ErrorAction Stop", escaped)
        }).collect();
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
                return Err(AppError::Permission(format!("관리자 권한 삭제 실패: {}", stderr)));
            }
        }

        // 실제 삭제 확인: 파일이 여전히 존재하면 실패
        for path in &paths {
            if std::path::Path::new(path).exists() {
                return Err(AppError::Internal(format!("관리자 권한 삭제 후에도 파일이 존재합니다: {}", path)));
            }
        }

        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = paths;
        Err(AppError::UnsupportedPlatform("관리자 권한 삭제는 Windows에서만 지원됩니다".to_string()))
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
    }).await.map_err(|e| AppError::Internal(format!("복원 작업 실패: {}", e)))?
}

#[cfg(target_os = "macos")]
fn restore_single_item(orig_path: &str) -> Result<()> {
    let home = std::env::var("HOME").map_err(|_| AppError::Internal("HOME 환경변수 없음".to_string()))?;
    let trash_dir = std::path::Path::new(&home).join(".Trash");
    let orig = std::path::Path::new(orig_path);
    let name = orig.file_name()
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
                && ext.as_ref().map_or(true, |e| ename.ends_with(&format!(".{}", e)))
        })
        .collect();

    // 가장 최근 수정된 항목 선택
    candidates.sort_by(|a, b| {
        let ma = a.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
        let mb = b.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
        mb.cmp(&ma)
    });

    if let Some(found) = candidates.first() {
        std::fs::rename(found.path(), orig)?;
        Ok(())
    } else {
        Err(AppError::NotFound(format!("휴지통에서 파일을 찾을 수 없습니다: {}", orig_path)))
    }
}

#[cfg(target_os = "windows")]
fn restore_single_item(orig_path: &str) -> Result<()> {
    let items = trash::os_limited::list()
        .map_err(|e| AppError::Io(format!("휴지통 조회 실패: {}", e)))?;
    let orig = std::path::Path::new(orig_path);
    let target_name = orig.file_name().unwrap_or_default();
    let target_parent = orig.parent().unwrap_or(std::path::Path::new(""));

    // 원래 경로와 일치하는 항목 찾기 (가장 최근 것)
    let mut matching: Vec<_> = items.into_iter()
        .filter(|item| item.original_parent == target_parent && item.name == target_name)
        .collect();
    matching.sort_by(|a, b| b.time_deleted.cmp(&a.time_deleted));

    if let Some(item) = matching.into_iter().next() {
        trash::os_limited::restore_all(std::iter::once(item))
            .map_err(|e| AppError::Io(format!("복원 실패 {}: {}", orig_path, e)))
    } else {
        Err(AppError::NotFound(format!("휴지통에서 파일을 찾을 수 없습니다: {}", orig_path)))
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn restore_single_item(orig_path: &str) -> Result<()> {
    Err(AppError::UnsupportedPlatform(format!("이 플랫폼에서는 휴지통 복원이 지원되지 않습니다: {}", orig_path)))
}

// ===== ZIP 압축 =====

// ZIP 압축
#[tauri::command]
pub async fn compress_to_zip(paths: Vec<String>, dest: String) -> Result<String> {
    let file = std::fs::File::create(&dest)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for source in &paths {
        let src = std::path::Path::new(source);
        let base_name = src.file_name().unwrap_or_default().to_string_lossy().to_string();

        if src.is_dir() {
            add_directory_to_zip(&mut zip, src, &base_name, options)?;
        } else {
            zip.start_file(&base_name, options)?;
            let content = std::fs::read(src)?;
            std::io::Write::write_all(&mut zip, &content)?;
        }
    }

    zip.finish()?;
    Ok(dest)
}

fn add_directory_to_zip<W: std::io::Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    dir: &std::path::Path,
    prefix: &str,
    options: zip::write::SimpleFileOptions,
) -> Result<()> {
    zip.add_directory(format!("{}/", prefix), options)?;
    for entry in std::fs::read_dir(dir)?.flatten() {
        let entry_name = entry.file_name().to_string_lossy().to_string();
        let full_name = format!("{}/{}", prefix, entry_name);
        if entry.path().is_dir() {
            add_directory_to_zip(zip, &entry.path(), &full_name, options)?;
        } else {
            zip.start_file(&full_name, options)?;
            let content = std::fs::read(entry.path())?;
            std::io::Write::write_all(zip, &content)?;
        }
    }
    Ok(())
}

// ZIP 압축 풀기
// zip_path: 압축 파일 경로, dest_dir: 출력 디렉토리 경로
#[tauri::command]
pub async fn extract_zip(zip_path: String, dest_dir: String) -> Result<String> {
    let file = std::fs::File::open(&zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    let dest = std::path::Path::new(&dest_dir);
    std::fs::create_dir_all(dest)?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let out_path = dest.join(entry.mangled_name());

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
        } else {
            // 부모 디렉토리 생성
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&out_path)?;
            std::io::copy(&mut entry, &mut outfile)?;
        }
    }
    Ok(dest_dir)
}

// ===== 테스트 =====

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn setup_test_dir(name: &str) -> std::path::PathBuf {
        let temp = std::env::temp_dir();
        let test_dir = temp.join(format!("file_ops_test_{}", name));
        let _ = fs::remove_dir_all(&test_dir); // 기존 테스트 디렉토리 제거
        fs::create_dir_all(&test_dir).unwrap();
        test_dir
    }

    fn cleanup_test_dir(path: &std::path::Path) {
        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn test_is_directory() {
        let test_dir = setup_test_dir("is_directory");
        let file_path = test_dir.join("test.txt");
        fs::write(&file_path, "test").unwrap();

        assert_eq!(is_directory(test_dir.to_string_lossy().to_string()), true);
        assert_eq!(is_directory(file_path.to_string_lossy().to_string()), false);
        assert_eq!(is_directory("/nonexistent/path".to_string()), false);

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_is_cloud_path() {
        assert_eq!(is_cloud_path("/Users/test/Library/CloudStorage/GoogleDrive/file.txt"), true);
        assert_eq!(is_cloud_path("/Users/test/Library/Mobile Documents/com~apple~CloudDocs/file.txt"), true);
        assert_eq!(is_cloud_path("/Users/test/Google Drive/file.txt"), true);
        assert_eq!(is_cloud_path("/Users/test/OneDrive/file.txt"), true);
        assert_eq!(is_cloud_path("/Users/test/Dropbox/file.txt"), true);
        assert_eq!(is_cloud_path("/Users/test/Documents/file.txt"), false);
    }

    #[test]
    fn test_create_directory() {
        let test_dir = setup_test_dir("create_directory");
        let new_dir = test_dir.join("new_folder");

        tauri::async_runtime::block_on(async {
            let result = create_directory(new_dir.to_string_lossy().to_string()).await;
            assert!(result.is_ok());
            assert!(new_dir.exists());
            assert!(new_dir.is_dir());
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_create_text_file() {
        let test_dir = setup_test_dir("create_text_file");
        let file_path = test_dir.join("new_file.txt");

        tauri::async_runtime::block_on(async {
            // 새 파일 생성
            let result = create_text_file(file_path.to_string_lossy().to_string()).await;
            assert!(result.is_ok());
            assert!(file_path.exists());
            assert!(file_path.is_file());

            // 이미 존재하는 파일 — AlreadyExists 에러
            let result2 = create_text_file(file_path.to_string_lossy().to_string()).await;
            assert!(result2.is_err());
            assert!(matches!(result2.unwrap_err(), AppError::AlreadyExists(_)));
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_read_text_file() {
        let test_dir = setup_test_dir("read_text_file");
        let file_path = test_dir.join("test.txt");
        let content = "Hello, World! 안녕하세요!";
        fs::write(&file_path, content).unwrap();

        // 전체 읽기
        let result = read_text_file(file_path.to_string_lossy().to_string(), 1000);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), content);

        // 부분 읽기 (최대 10바이트)
        let result2 = read_text_file(file_path.to_string_lossy().to_string(), 10);
        assert!(result2.is_ok());
        assert_eq!(result2.unwrap().len(), 10);

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_write_text_file() {
        let test_dir = setup_test_dir("write_text_file");
        let file_path = test_dir.join("output.txt");
        let content = "Test content\nLine 2\n한글 테스트";

        tauri::async_runtime::block_on(async {
            let result = write_text_file(file_path.to_string_lossy().to_string(), content.to_string()).await;
            assert!(result.is_ok());

            let read_content = fs::read_to_string(&file_path).unwrap();
            assert_eq!(read_content, content);
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_rename_item() {
        let test_dir = setup_test_dir("rename_item");
        let old_path = test_dir.join("old.txt");
        let new_path = test_dir.join("new.txt");
        fs::write(&old_path, "test").unwrap();

        tauri::async_runtime::block_on(async {
            // 정상 이름 변경
            let result = rename_item(
                old_path.to_string_lossy().to_string(),
                new_path.to_string_lossy().to_string(),
            ).await;
            assert!(result.is_ok());
            assert!(!old_path.exists());
            assert!(new_path.exists());

            // 이미 존재하는 이름으로 변경 시도 — AlreadyExists 에러
            let another = test_dir.join("another.txt");
            fs::write(&another, "test2").unwrap();
            let result2 = rename_item(
                another.to_string_lossy().to_string(),
                new_path.to_string_lossy().to_string(),
            ).await;
            assert!(result2.is_err());
            assert!(matches!(result2.unwrap_err(), AppError::AlreadyExists(_)));
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_copy_dir_recursive() {
        let test_dir = setup_test_dir("copy_dir_recursive");
        let src_dir = test_dir.join("source");
        let dest_dir = test_dir.join("destination");

        // 소스 디렉토리 구조 생성
        fs::create_dir_all(src_dir.join("subdir")).unwrap();
        fs::write(src_dir.join("file1.txt"), "content1").unwrap();
        fs::write(src_dir.join("subdir/file2.txt"), "content2").unwrap();

        // 재귀 복사
        let result = copy_dir_recursive(&src_dir, &dest_dir);
        assert!(result.is_ok());
        assert!(dest_dir.exists());
        assert!(dest_dir.join("file1.txt").exists());
        assert!(dest_dir.join("subdir").exists());
        assert!(dest_dir.join("subdir/file2.txt").exists());

        let content = fs::read_to_string(dest_dir.join("subdir/file2.txt")).unwrap();
        assert_eq!(content, "content2");

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_duplicate_items() {
        let test_dir = setup_test_dir("duplicate_items");
        let file1 = test_dir.join("original.txt");
        fs::write(&file1, "content").unwrap();

        tauri::async_runtime::block_on(async {
            // 복제
            let result = duplicate_items(vec![file1.to_string_lossy().to_string()]).await;
            assert!(result.is_ok());

            let new_paths = result.unwrap();
            assert_eq!(new_paths.len(), 1);
            assert!(new_paths[0].contains("(복사)"));

            let duplicated = std::path::Path::new(&new_paths[0]);
            assert!(duplicated.exists());
            assert_eq!(fs::read_to_string(duplicated).unwrap(), "content");

            // 두 번째 복제 — "(복사 2)" 접미사
            let result2 = duplicate_items(vec![file1.to_string_lossy().to_string()]).await;
            assert!(result2.is_ok());
            let new_paths2 = result2.unwrap();
            assert!(new_paths2[0].contains("(복사 2)"));
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_copy_items() {
        let test_dir = setup_test_dir("copy_items");
        let src = test_dir.join("src");
        let dest = test_dir.join("dest");
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&dest).unwrap();

        let file1 = src.join("file1.txt");
        fs::write(&file1, "content1").unwrap();

        tauri::async_runtime::block_on(async {
            // 복사
            let result = copy_items(
                vec![file1.to_string_lossy().to_string()],
                dest.to_string_lossy().to_string(),
                None,
            ).await;
            assert!(result.is_ok());
            assert!(dest.join("file1.txt").exists());
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_move_items() {
        let test_dir = setup_test_dir("move_items");
        let src = test_dir.join("src");
        let dest = test_dir.join("dest");
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&dest).unwrap();

        let file1 = src.join("file1.txt");
        fs::write(&file1, "content1").unwrap();

        tauri::async_runtime::block_on(async {
            // 이동
            let result = move_items(
                vec![file1.to_string_lossy().to_string()],
                dest.to_string_lossy().to_string(),
                None,
            ).await;
            assert!(result.is_ok());
            assert!(!file1.exists()); // 원본 삭제됨
            assert!(dest.join("file1.txt").exists());
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_check_duplicate_items() {
        let test_dir = setup_test_dir("check_duplicate_items");
        let src = test_dir.join("src");
        let dest = test_dir.join("dest");
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&dest).unwrap();

        let file1 = src.join("file1.txt");
        fs::write(&file1, "content1").unwrap();
        fs::write(dest.join("file1.txt"), "existing").unwrap();

        tauri::async_runtime::block_on(async {
            let result = check_duplicate_items(
                vec![file1.to_string_lossy().to_string()],
                dest.to_string_lossy().to_string(),
            ).await;
            assert!(result.is_ok());
            let duplicates = result.unwrap();
            assert_eq!(duplicates.len(), 1);
            assert_eq!(duplicates[0], "file1.txt");
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_compress_and_extract_zip() {
        let test_dir = setup_test_dir("zip");
        let src_dir = test_dir.join("source");
        let zip_path = test_dir.join("archive.zip");
        let extract_dir = test_dir.join("extracted");

        // 소스 파일 생성
        fs::create_dir_all(src_dir.join("subdir")).unwrap();
        fs::write(src_dir.join("file1.txt"), "content1").unwrap();
        fs::write(src_dir.join("subdir/file2.txt"), "content2").unwrap();

        tauri::async_runtime::block_on(async {
            // 압축
            let result = compress_to_zip(
                vec![src_dir.to_string_lossy().to_string()],
                zip_path.to_string_lossy().to_string(),
            ).await;
            assert!(result.is_ok());
            assert!(zip_path.exists());

            // 압축 해제
            let result2 = extract_zip(
                zip_path.to_string_lossy().to_string(),
                extract_dir.to_string_lossy().to_string(),
            ).await;
            assert!(result2.is_ok());
            assert!(extract_dir.join("source/file1.txt").exists());
            assert!(extract_dir.join("source/subdir/file2.txt").exists());
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_delete_items_direct() {
        let test_dir = setup_test_dir("delete_items");
        let file1 = test_dir.join("file1.txt");
        fs::write(&file1, "content").unwrap();

        tauri::async_runtime::block_on(async {
            // 직접 삭제 (use_trash = false)
            let result = delete_items(vec![file1.to_string_lossy().to_string()], false).await;
            assert!(result.is_ok());
            assert!(!file1.exists());
        });

        cleanup_test_dir(&test_dir);
    }

    #[test]
    fn test_count_files_to_copy() {
        let test_dir = setup_test_dir("count_files");
        let dir = test_dir.join("dir");
        fs::create_dir_all(dir.join("subdir")).unwrap();
        fs::write(dir.join("file1.txt"), "").unwrap();
        fs::write(dir.join("file2.txt"), "").unwrap();
        fs::write(dir.join("subdir/file3.txt"), "").unwrap();

        let count = count_files_to_copy(&dir).unwrap();
        assert_eq!(count, 3);

        let file_path = test_dir.join("single.txt");
        fs::write(&file_path, "").unwrap();
        let count2 = count_files_to_copy(&file_path).unwrap();
        assert_eq!(count2, 1);

        cleanup_test_dir(&test_dir);
    }
}
