//! 파일 검색 및 최근 파일 조회 모듈
//! Spotlight/Windows Search Index 활용 + walkdir 폴백

use super::super::types::{FileEntry, FileType, classify_file};
use super::super::constants::{MAX_SEARCH_RESULTS, SEARCH_MAX_DEPTH};
use crate::helpers::{is_hidden_file, is_system_file, is_system_filename};

#[cfg(target_os = "windows")]
use super::super::constants::windows::*;

// ===== 최근 변경 파일 조회 =====

// 지정된 루트 디렉토리들에서 최근 N일 이내 변경된 파일 조회
// spawn_blocking으로 네트워크 파일시스템 차단 방지
#[tauri::command]
pub async fn get_recent_files(roots: Vec<String>, days: u32) -> Result<Vec<FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<FileEntry>, String> {
        let now = std::time::SystemTime::now();
        let cutoff = std::time::Duration::from_secs(days as u64 * 24 * 60 * 60);
        let mut results: Vec<FileEntry> = Vec::new();

        for root in &roots {
            let root_path = std::path::Path::new(root);
            if !root_path.is_dir() {
                continue;
            }
            // 1단계 깊이만 스캔 (재귀 X → 성능 보장)
            let entries = match std::fs::read_dir(root_path) {
                Ok(e) => e,
                Err(_) => continue,
            };
            for entry in entries.flatten() {
                let meta = match entry.metadata() {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                // 디렉토리 제외 (파일만)
                if meta.is_dir() {
                    continue;
                }

                let name = entry.file_name().to_string_lossy().to_string();

                // 숨김 파일 제외
                if is_hidden_file(&name) {
                    continue;
                }

                // 시스템/임시 파일 제외
                if is_system_filename(&name) {
                    continue;
                }

                // Windows: 숨김(HIDDEN) 또는 시스템(SYSTEM) 속성 파일 제외
                #[cfg(target_os = "windows")]
                {
                    if is_system_file(&meta) {
                        continue;
                    }
                }
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);

                // 최근 N일 이내 변경된 파일만
                let file_age = now
                    .duration_since(meta.modified().unwrap_or(now))
                    .unwrap_or(cutoff);
                if file_age > cutoff {
                    continue;
                }

                let file_type = classify_file(&name);
                results.push(FileEntry {
                    path: entry.path().to_string_lossy().to_string(),
                    is_dir: false,
                    size: meta.len(),
                    modified,
                    file_type,
                    name,
                });
            }
        }

        // 최신순 정렬
        results.sort_by(|a, b| b.modified.cmp(&a.modified));
        // 최대 100개 제한
        results.truncate(100);
        Ok(results)
    })
    .await
    .map_err(|e| format!("최근 파일 조회 실패: {}", e))?
}

// ===== 파일 검색 =====

// 글로벌 파일 검색 (하위 폴더 재귀 탐색)
// macOS: Spotlight 인덱스(mdfind) 활용으로 즉시 검색, 실패 시 walkdir 폴백
// Windows: Windows Search Index(ADODB) 활용, 실패 시 walkdir 폴백
#[tauri::command]
pub async fn search_files(root: String, query: String, max_results: usize) -> Result<Vec<FileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<FileEntry>, String> {
        // macOS: mdfind (Spotlight 인덱스) 먼저 시도
        #[cfg(target_os = "macos")]
        {
            if let Ok(entries) = search_with_mdfind(&root, &query, max_results) {
                return Ok(entries);
            }
        }

        // Windows: Windows Search Index (ADODB) 먼저 시도
        #[cfg(target_os = "windows")]
        {
            if let Ok(entries) = search_with_windows_index(&root, &query, max_results) {
                if !entries.is_empty() {
                    return Ok(entries);
                }
            }
        }

        // 폴백: walkdir 기반 직접 탐색
        search_with_walkdir(&root, &query, max_results)
    })
    .await
    .map_err(|e| format!("파일 검색 태스크 실패: {}", e))?
}

// macOS Spotlight 인덱스(mdfind) 기반 즉시 검색
#[cfg(target_os = "macos")]
fn search_with_mdfind(root: &str, query: &str, max_results: usize) -> Result<Vec<FileEntry>, String> {
    use std::process::Command;

    let output = Command::new("mdfind")
        .args(["-onlyin", root, "-name", query])
        .output()
        .map_err(|e| format!("mdfind 실행 실패: {}", e))?;

    if !output.status.success() {
        return Err("mdfind 실행 실패".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut result = vec![];

    for line in stdout.lines() {
        if line.is_empty() { continue; }
        let path = std::path::Path::new(line);

        // 숨김 파일 제외 (경로의 어느 컴포넌트든 .으로 시작하면 제외)
        let has_hidden = path.components().any(|c| {
            is_hidden_file(&c.as_os_str().to_string_lossy())
        });
        if has_hidden { continue; }

        let meta = match std::fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let modified = meta.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let is_dir = meta.is_dir();
        let file_type = if is_dir { FileType::Directory } else { classify_file(&name) };

        result.push(FileEntry {
            path: line.to_string(),
            is_dir,
            size: if is_dir { 0 } else { meta.len() },
            modified,
            file_type,
            name,
        });

        if result.len() >= max_results { break; }
    }

    Ok(result)
}

// Windows Search Index (ADODB COM) 기반 즉시 검색
// Windows는 기본적으로 사용자 폴더를 인덱싱하므로 Spotlight과 유사한 속도
#[cfg(target_os = "windows")]
fn search_with_windows_index(root: &str, query: &str, max_results: usize) -> Result<Vec<FileEntry>, String> {
    use std::process::Command;

    // SQL 인젝션 방지: 작은따옴표 이스케이프
    let safe_query = query.replace('\'', "''");
    // Windows Search scope는 file:/// URL 형식 사용
    let scope_path = root.replace('\\', "/");
    let scope = if scope_path.starts_with("//") {
        format!("file:{}", scope_path)
    } else {
        format!("file:///{}", scope_path)
    };

    // PowerShell로 Windows Search Index 쿼리 (ADODB COM)
    let ps_script = format!(
        concat!(
            "$ErrorActionPreference='SilentlyContinue';",
            "$c=New-Object -Com ADODB.Connection;",
            "$c.Open('Provider=Search.CollatorDSO;Extended Properties=''Application=Windows'';');",
            "$r=$c.Execute(\"SELECT TOP {} System.ItemPathDisplay FROM SystemIndex ",
            "WHERE SCOPE='{}' AND System.FileName LIKE '%{}%'\");",
            "while(-not $r.EOF){{$r.Fields.Item('System.ItemPathDisplay').Value;$r.MoveNext()}};",
            "if($r){{$r.Close()}};$c.Close()"
        ),
        max_results, scope, safe_query
    );

    use std::os::windows::process::CommandExt;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NoLogo", "-Command", &ps_script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("PowerShell 실행 실패: {}", e))?;

    if !output.status.success() {
        return Err("Windows Search Index 쿼리 실패".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut result = vec![];

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }

        let path = std::path::Path::new(line);
        let name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // 숨김 파일 제외
        if is_hidden_file(&name) { continue; }

        let meta = match std::fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        // Windows 시스템/숨김 파일 제외
        if is_system_file(&meta) { continue; }

        let modified = meta.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let is_dir = meta.is_dir();
        let file_type = if is_dir { FileType::Directory } else { classify_file(&name) };

        result.push(FileEntry {
            path: line.to_string(),
            is_dir,
            size: if is_dir { 0 } else { meta.len() },
            modified,
            file_type,
            name,
        });

        if result.len() >= max_results { break; }
    }

    Ok(result)
}

// walkdir 기반 직접 재귀 탐색 (인덱스 검색 폴백)
fn search_with_walkdir(root: &str, query: &str, max_results: usize) -> Result<Vec<FileEntry>, String> {
    use walkdir::WalkDir;

    let query_lower = query.to_lowercase();
    let mut result = vec![];

    let walker = WalkDir::new(root)
        .max_depth(SEARCH_MAX_DEPTH)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy();
            // 숨김 파일/디렉토리 전체 서브트리 제외
            if is_hidden_file(&name) {
                return false;
            }
            // Windows 시스템 파일 제외
            #[cfg(target_os = "windows")]
            {
                if let Ok(meta) = entry.metadata() {
                    if is_system_file(&meta) {
                        return false;
                    }
                }
            }
            true
        });

    for entry in walker.flatten() {
        if entry.depth() == 0 { continue; }

        let name = entry.file_name().to_string_lossy().to_string();
        if !name.to_lowercase().contains(&query_lower) { continue; }

        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let modified = meta.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let is_dir = meta.is_dir();
        let file_type = if is_dir { FileType::Directory } else { classify_file(&name) };

        result.push(FileEntry {
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
            size: if is_dir { 0 } else { meta.len() },
            modified,
            file_type,
            name,
        });

        if result.len() >= max_results { break; }
    }

    Ok(result)
}
