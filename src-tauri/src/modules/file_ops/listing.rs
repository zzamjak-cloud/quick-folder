use crate::modules::archive_ops::{list_archive_directory, resolve_archive_virtual_path_with_app};
use crate::modules::error::{AppError, Result};
use crate::modules::types::{classify_file, FileEntry, FileType};

fn virtual_dir_entry(name: String, path: String) -> FileEntry {
    FileEntry {
        name,
        path,
        is_dir: true,
        size: 0,
        modified: 0,
        file_type: FileType::Directory,
    }
}

// ===== 디렉토리 목록 조회 =====

// 디렉토리 목록 조회
#[tauri::command]
pub async fn list_directory(app: tauri::AppHandle, path: String) -> Result<Vec<FileEntry>> {
    // spawn_blocking: 네트워크 파일시스템(Google Drive 등) I/O가 tokio 워커를 차단하지 않도록 분리
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<FileEntry>> {
        if resolve_archive_virtual_path_with_app(&app, &path)?.is_some() {
            return list_archive_directory(&app, &path);
        }

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
            if name_lower == "desktop.ini"
                || name_lower == "thumbs.db"
                || name_lower == "ntuser.dat"
            {
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

// ===== 가상 시스템 루트 목록 =====

#[tauri::command]
pub async fn list_system_roots() -> Result<Vec<FileEntry>> {
    #[cfg(target_os = "windows")]
    {
        let mut result: Vec<FileEntry> = Vec::new();
        for letter in 'A'..='Z' {
            let drive = format!("{}:\\", letter);
            let drive_path = std::path::Path::new(&drive);
            if drive_path.is_dir() {
                result.push(virtual_dir_entry(format!("{}:", letter), drive));
            }
        }

        // Google Drive for desktop: "Google Drive - <email>" 사용자 폴더 항목 표시
        if let Ok(user_profile) = std::env::var("USERPROFILE") {
            if let Ok(entries) = std::fs::read_dir(&user_profile) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if !path.is_dir() {
                        continue;
                    }
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("Google Drive") {
                        result.push(virtual_dir_entry(name, path.to_string_lossy().to_string()));
                    }
                }
            }
        }

        result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        return Ok(result);
    }

    #[cfg(target_os = "macos")]
    {
        let result = vec![
            virtual_dir_entry("사용자 폴더".to_string(), "/Users".to_string()),
            virtual_dir_entry("응용 프로그램".to_string(), "/Applications".to_string()),
            virtual_dir_entry("라이브러리".to_string(), "/Library".to_string()),
            virtual_dir_entry("시스템".to_string(), "/System".to_string()),
        ];
        return Ok(result);
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Ok(vec![])
    }
}

// ===== 경로 확인 =====

// 경로가 디렉토리인지 확인
#[tauri::command]
pub fn is_directory(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

#[derive(Debug, serde::Serialize)]
pub struct FolderSizeChildInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub bytes: String,
    pub file_count: u64,
    pub folder_count: u64,
}

#[derive(Debug, serde::Serialize)]
pub struct FolderSizeInfo {
    pub bytes: String,
    pub file_count: u64,
    pub folder_count: u64,
    pub children: Vec<FolderSizeChildInfo>,
}

#[derive(Default)]
struct FolderSizeAccumulator {
    bytes: u64,
    file_count: u64,
    folder_count: u64,
}

// 폴더 내부 파일 크기 합계를 계산한다.
#[tauri::command]
pub async fn calculate_folder_size(path: String) -> Result<FolderSizeInfo> {
    tauri::async_runtime::spawn_blocking(move || calculate_folder_size_impl(&path))
        .await
        .map_err(|e| AppError::Internal(format!("폴더 용량 계산 작업 실패: {}", e)))?
}

fn calculate_folder_size_impl(path: &str) -> Result<FolderSizeInfo> {
    let root = std::path::Path::new(path);
    let metadata = std::fs::symlink_metadata(root)?;
    if !metadata.is_dir() {
        return Err(AppError::InvalidInput("폴더 경로가 아닙니다".to_string()));
    }

    let mut acc = FolderSizeAccumulator::default();
    let children = collect_folder_size_children(root, &mut acc)?;
    Ok(FolderSizeInfo {
        bytes: acc.bytes.to_string(),
        file_count: acc.file_count,
        folder_count: acc.folder_count,
        children,
    })
}

fn collect_folder_size_children(
    root: &std::path::Path,
    total: &mut FolderSizeAccumulator,
) -> Result<Vec<FolderSizeChildInfo>> {
    let mut children: Vec<(u64, String, FolderSizeChildInfo)> = Vec::new();

    for entry_result in std::fs::read_dir(root)? {
        let entry = match entry_result {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let entry_path = entry.path();
        let metadata = match std::fs::symlink_metadata(&entry_path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.file_type().is_symlink() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry_path.to_string_lossy().to_string();
        if metadata.is_dir() {
            let mut child_acc = FolderSizeAccumulator::default();
            collect_folder_size(&entry_path, &mut child_acc)?;
            total.bytes = total.bytes.saturating_add(child_acc.bytes);
            total.file_count = total.file_count.saturating_add(child_acc.file_count);
            total.folder_count = total
                .folder_count
                .saturating_add(child_acc.folder_count.saturating_add(1));
            children.push((
                child_acc.bytes,
                name.to_lowercase(),
                FolderSizeChildInfo {
                    name,
                    path,
                    is_dir: true,
                    bytes: child_acc.bytes.to_string(),
                    file_count: child_acc.file_count,
                    folder_count: child_acc.folder_count,
                },
            ));
        } else if metadata.is_file() {
            let bytes = metadata.len();
            total.bytes = total.bytes.saturating_add(bytes);
            total.file_count = total.file_count.saturating_add(1);
            children.push((
                bytes,
                name.to_lowercase(),
                FolderSizeChildInfo {
                    name,
                    path,
                    is_dir: false,
                    bytes: bytes.to_string(),
                    file_count: 1,
                    folder_count: 0,
                },
            ));
        }
    }

    children.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    Ok(children.into_iter().map(|(_, _, child)| child).collect())
}

fn collect_folder_size(path: &std::path::Path, acc: &mut FolderSizeAccumulator) -> Result<()> {
    for entry_result in std::fs::read_dir(path)? {
        let entry = match entry_result {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let entry_path = entry.path();
        let metadata = match std::fs::symlink_metadata(&entry_path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            acc.folder_count = acc.folder_count.saturating_add(1);
            collect_folder_size(&entry_path, acc)?;
        } else if metadata.is_file() {
            acc.file_count = acc.file_count.saturating_add(1);
            acc.bytes = acc.bytes.saturating_add(metadata.len());
        }
    }
    Ok(())
}
