use crate::helpers::{get_copy_destination, get_numbered_destination};
use crate::modules::error::{AppError, Result};
use crate::modules::image_ops::{invalidate_thumbnail_cache_paths_in_root, thumbnail_cache_root};

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
    app_cache: Option<&std::path::Path>,
) -> Result<Vec<(std::path::PathBuf, std::path::PathBuf)>> {
    let mut jobs = Vec::new();
    for source in sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let mut dest_path = dest.join(file_name);

        if dest_path.exists() && dest_path.canonicalize().ok() == src_path.canonicalize().ok() {
            let stem = src_path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let ext = src_path
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();
            let is_dir = src_path.is_dir();
            dest_path = get_copy_destination(dest, &stem, &ext, is_dir);
        } else if dest_path.exists() && overwrite {
            if let Some(app_cache) = app_cache {
                invalidate_thumbnail_cache_paths_in_root(
                    app_cache,
                    &[dest_path.to_string_lossy().to_string()],
                );
            }
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

/// move_items와 동일한 대상 경로 결정 (실제 이동은 하지 않음)
fn collect_move_jobs(
    sources: &[String],
    dest: &std::path::Path,
    overwrite: bool,
    app_cache: Option<&std::path::Path>,
) -> Result<Vec<(std::path::PathBuf, std::path::PathBuf)>> {
    let mut jobs = Vec::new();
    for source in sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let dest_path = dest.join(file_name);

        if dest_path.exists() && dest_path.canonicalize().ok() != src_path.canonicalize().ok() {
            if overwrite {
                if let Some(app_cache) = app_cache {
                    invalidate_thumbnail_cache_paths_in_root(
                        app_cache,
                        &[dest_path.to_string_lossy().to_string()],
                    );
                }
                if dest_path.is_dir() {
                    std::fs::remove_dir_all(&dest_path)?;
                } else {
                    std::fs::remove_file(&dest_path)?;
                }
            } else {
                continue;
            }
        }

        jobs.push((src_path.to_path_buf(), dest_path));
    }
    Ok(jobs)
}

pub(super) fn count_files_to_copy(path: &std::path::Path) -> Result<u64> {
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

/// 작업 큐 패널용 개별 파일 항목
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferFileItem {
    pub id: u32,
    pub name: String,
    pub status: String,
    pub percent: f32,
}

/// 작업 큐 패널용 진행률 (파일 목록 + 전체 카운트)
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferQueueProgress {
    pub phase: String,
    pub operation: String,
    pub done_files: u64,
    pub total_files: u64,
    pub current_name: String,
    pub percent: f32,
    pub active_id: Option<u32>,
    pub files: Option<Vec<TransferFileItem>>,
}

/// 전송 단위: 원자적 이동(rename) 또는 파일 복사
enum TransferStep {
    AtomicMove {
        src: std::path::PathBuf,
        dest: std::path::PathBuf,
        name: String,
    },
    CopyFile {
        src: std::path::PathBuf,
        dest: std::path::PathBuf,
        name: String,
    },
}

/// 같은 볼륨이면 rename으로 이동 가능 (부작용 없이 판별)
fn is_same_volume(a: &std::path::Path, b: &std::path::Path) -> bool {
    #[cfg(windows)]
    {
        use std::path::Component;
        let drive = |p: &std::path::Path| {
            p.components().find_map(|c| match c {
                Component::Prefix(prefix) => {
                    Some(prefix.as_os_str().to_string_lossy().to_ascii_lowercase())
                }
                _ => None,
            })
        };
        drive(a) == drive(b)
    }
    #[cfg(not(windows))]
    {
        use std::os::unix::fs::MetadataExt;

        let a_dev = std::fs::metadata(a).ok().map(|m| m.dev());
        let b_base = b.parent().unwrap_or(b);
        let b_dev = std::fs::metadata(b_base).ok().map(|m| m.dev());
        a_dev.is_some() && a_dev == b_dev
    }
}

fn send_queue_progress(
    channel: &tauri::ipc::Channel<TransferQueueProgress>,
    phase: &str,
    operation: &str,
    done: u64,
    total: u64,
    current_name: &str,
    active_id: Option<u32>,
    files: Option<Vec<TransferFileItem>>,
) {
    let percent = if total > 0 {
        (done as f32 / total as f32) * 100.0
    } else {
        0.0
    };
    let _ = channel.send(TransferQueueProgress {
        phase: phase.to_string(),
        operation: operation.to_string(),
        done_files: done,
        total_files: total,
        current_name: current_name.to_string(),
        percent: percent.min(100.0),
        active_id,
        files,
    });
}

struct TransferPlan {
    steps: Vec<TransferStep>,
    /// cross-volume 이동 후 삭제할 최상위 소스 경로
    move_cleanup_roots: Vec<std::path::PathBuf>,
}

/// 복사/이동 작업을 전송 단위 목록으로 펼침 (디스크 변경 없음)
fn build_transfer_plan(
    jobs: &[(std::path::PathBuf, std::path::PathBuf)],
    operation: &str,
) -> Result<TransferPlan> {
    use walkdir::WalkDir;
    let mut steps = Vec::new();
    let mut move_cleanup_roots = Vec::new();
    for (src, dest) in jobs {
        let top_name = src
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        if operation == "move" && is_same_volume(src, dest) {
            steps.push(TransferStep::AtomicMove {
                src: src.clone(),
                dest: dest.clone(),
                name: top_name,
            });
            continue;
        }

        if operation == "move" {
            move_cleanup_roots.push(src.clone());
        }

        if src.is_file() {
            steps.push(TransferStep::CopyFile {
                src: src.clone(),
                dest: dest.clone(),
                name: top_name,
            });
        } else if src.is_dir() {
            for entry in WalkDir::new(src).into_iter().filter_map(|e| e.ok()) {
                if entry.file_type().is_file() {
                    let rel = entry.path().strip_prefix(src).unwrap_or(entry.path());
                    let dest_path = dest.join(rel);
                    let name = entry.file_name().to_string_lossy().to_string();
                    steps.push(TransferStep::CopyFile {
                        src: entry.path().to_path_buf(),
                        dest: dest_path,
                        name,
                    });
                }
            }
        }
    }
    Ok(TransferPlan {
        steps,
        move_cleanup_roots,
    })
}

fn execute_transfer_steps(
    plan: &TransferPlan,
    operation: &str,
    app_cache: Option<&std::path::Path>,
    channel: &tauri::ipc::Channel<TransferQueueProgress>,
) -> Result<()> {
    let steps = &plan.steps;
    let total = steps.len() as u64;
    let file_items: Vec<TransferFileItem> = steps
        .iter()
        .enumerate()
        .map(|(i, step)| TransferFileItem {
            id: i as u32,
            name: match step {
                TransferStep::AtomicMove { name, .. } | TransferStep::CopyFile { name, .. } => {
                    name.clone()
                }
            },
            status: "pending".to_string(),
            percent: 0.0,
        })
        .collect();

    send_queue_progress(
        channel,
        "transferring",
        operation,
        0,
        total,
        "",
        None,
        Some(file_items),
    );

    let mut done = 0u64;

    for (idx, step) in steps.iter().enumerate() {
        let name = match step {
            TransferStep::AtomicMove { name, .. } | TransferStep::CopyFile { name, .. } => {
                name.clone()
            }
        };

        send_queue_progress(
            channel,
            "transferring",
            operation,
            done,
            total,
            &name,
            Some(idx as u32),
            None,
        );

        match step {
            TransferStep::AtomicMove { src, dest, .. } => {
                if let Some(app_cache) = app_cache {
                    invalidate_thumbnail_cache_paths_in_root(
                        app_cache,
                        &[src.to_string_lossy().to_string()],
                    );
                }
                std::fs::rename(src, dest)?;
            }
            TransferStep::CopyFile { src, dest, .. } => {
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                if let Some(app_cache) = app_cache {
                    if dest.exists() {
                        invalidate_thumbnail_cache_paths_in_root(
                            app_cache,
                            &[dest.to_string_lossy().to_string()],
                        );
                    }
                }
                std::fs::copy(src, dest)?;
            }
        }

        done += 1;
        send_queue_progress(
            channel,
            "transferring",
            operation,
            done,
            total,
            &name,
            None,
            None,
        );
    }

    if operation == "move" {
        for root in &plan.move_cleanup_roots {
            if root.exists() {
                if root.is_dir() {
                    let _ = std::fs::remove_dir_all(root);
                } else {
                    let _ = std::fs::remove_file(root);
                }
            }
        }
    }

    send_queue_progress(channel, "done", operation, done, total, "", None, None);
    Ok(())
}

fn run_transfer_with_queue(
    operation: &str,
    sources: &[String],
    dest: &std::path::Path,
    overwrite: bool,
    app_cache: Option<&std::path::Path>,
    channel: &tauri::ipc::Channel<TransferQueueProgress>,
) -> Result<()> {
    send_queue_progress(channel, "scanning", operation, 0, 0, "", None, None);

    let jobs = if operation == "move" {
        collect_move_jobs(sources, dest, overwrite, app_cache)?
    } else {
        collect_copy_jobs(sources, dest, overwrite, app_cache)?
    };

    // 빈 폴더도 대상에 생성 (파일이 없으면 steps에 포함되지 않음)
    for (src, dest) in &jobs {
        if src.is_dir() {
            std::fs::create_dir_all(dest)?;
        }
    }

    let plan = build_transfer_plan(&jobs, operation)?;
    let total = plan.steps.len() as u64;

    if total == 0 {
        send_queue_progress(channel, "done", operation, 0, 0, "", None, None);
        return Ok(());
    }

    execute_transfer_steps(&plan, operation, app_cache, channel)
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
            copy_dir_recursive_with_progress(
                &entry.path(),
                &dest_child,
                total_files,
                done,
                on_progress,
            )?;
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

// ===== 스마트 폴더 병합 =====

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FolderMergeConflictFile {
    pub relative_path: String,
    pub source_modified: u64,
    pub dest_modified: u64,
    pub source_size: u64,
    pub dest_size: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderMergeAnalysis {
    pub source_path: String,
    pub dest_path: String,
    pub folder_name: String,
    pub conflicts: Vec<FolderMergeConflictFile>,
    pub only_source: Vec<String>,
    pub only_dest: Vec<String>,
}

#[derive(serde::Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum FolderMergeConflictMode {
    Rename,
    OverwriteNewer,
    Skip,
}

fn file_modified_ms(path: &std::path::Path) -> u64 {
    path.metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 디렉토리 내 모든 파일의 상대 경로·메타 수집 (키: `/` 구분 상대 경로)
fn collect_relative_files(
    dir: &std::path::Path,
    base: &std::path::Path,
    out: &mut std::collections::HashMap<String, (u64, u64)>,
) -> Result<()> {
    for entry in std::fs::read_dir(dir)?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_relative_files(&path, base, out)?;
        } else {
            let rel = path
                .strip_prefix(base)
                .map_err(|_| AppError::Internal("상대 경로 계산 실패".into()))?;
            let key = rel.to_string_lossy().replace('\\', "/");
            let meta = path.metadata()?;
            out.insert(key, (meta.len(), file_modified_ms(&path)));
        }
    }
    Ok(())
}

fn analyze_folder_merge_paths(
    source: &std::path::Path,
    dest: &std::path::Path,
) -> Result<FolderMergeAnalysis> {
    let mut source_files = std::collections::HashMap::new();
    let mut dest_files = std::collections::HashMap::new();
    collect_relative_files(source, source, &mut source_files)?;
    collect_relative_files(dest, dest, &mut dest_files)?;

    let mut conflicts = Vec::new();
    let mut only_source = Vec::new();
    let mut only_dest = Vec::new();

    for (rel, (src_size, src_mod)) in &source_files {
        if let Some((dest_size, dest_mod)) = dest_files.get(rel) {
            conflicts.push(FolderMergeConflictFile {
                relative_path: rel.clone(),
                source_modified: *src_mod,
                dest_modified: *dest_mod,
                source_size: *src_size,
                dest_size: *dest_size,
            });
        } else {
            only_source.push(rel.clone());
        }
    }
    for rel in dest_files.keys() {
        if !source_files.contains_key(rel) {
            only_dest.push(rel.clone());
        }
    }

    conflicts.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    only_source.sort();
    only_dest.sort();

    let folder_name = source
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(FolderMergeAnalysis {
        source_path: source.to_string_lossy().to_string(),
        dest_path: dest.to_string_lossy().to_string(),
        folder_name,
        conflicts,
        only_source,
        only_dest,
    })
}

/// 같은 이름 폴더 병합 전 양쪽 내용 비교
#[tauri::command]
pub async fn analyze_folder_merge(
    source: String,
    dest_parent: String,
) -> Result<FolderMergeAnalysis> {
    tauri::async_runtime::spawn_blocking(move || {
        let src_path = std::path::Path::new(&source);
        if !src_path.is_dir() {
            return Err(AppError::InvalidInput("소스가 폴더가 아닙니다".into()));
        }
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let dest_path = std::path::Path::new(&dest_parent).join(file_name);
        if !dest_path.is_dir() {
            return Err(AppError::InvalidInput(
                "대상에 같은 이름의 폴더가 없습니다".into(),
            ));
        }
        analyze_folder_merge_paths(src_path, &dest_path)
    })
    .await
    .map_err(|e| AppError::Internal(format!("폴더 병합 분석 실패: {}", e)))?
}

fn merge_copy_file(
    src: &std::path::Path,
    dest: &std::path::Path,
    mode: FolderMergeConflictMode,
    app_cache: Option<&std::path::Path>,
) -> Result<()> {
    if dest.exists() {
        match mode {
            FolderMergeConflictMode::Skip => return Ok(()),
            FolderMergeConflictMode::OverwriteNewer => {
                if file_modified_ms(src) <= file_modified_ms(dest) {
                    return Ok(());
                }
                if let Some(app_cache) = app_cache {
                    invalidate_thumbnail_cache_paths_in_root(
                        app_cache,
                        &[dest.to_string_lossy().to_string()],
                    );
                }
                std::fs::copy(src, dest)?;
            }
            FolderMergeConflictMode::Rename => {
                let stem = src
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let ext = src
                    .extension()
                    .map(|e| format!(".{}", e.to_string_lossy()))
                    .unwrap_or_default();
                let parent = dest
                    .parent()
                    .ok_or_else(|| AppError::Internal("대상 파일의 부모 경로 없음".into()))?;
                let numbered = get_numbered_destination(parent, &stem, &ext, false);
                std::fs::copy(src, &numbered)?;
            }
        }
    } else {
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(src, dest)?;
    }
    Ok(())
}

pub(super) fn merge_folders_recursive(
    source: &std::path::Path,
    dest: &std::path::Path,
    mode: FolderMergeConflictMode,
    app_cache: Option<&std::path::Path>,
) -> Result<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(source)?.flatten() {
        let src_child = entry.path();
        let dest_child = dest.join(entry.file_name());
        if src_child.is_dir() {
            if dest_child.exists() && dest_child.is_dir() {
                merge_folders_recursive(&src_child, &dest_child, mode, app_cache)?;
            } else if !dest_child.exists() {
                copy_dir_recursive(&src_child, &dest_child)?;
            }
            // 파일·폴더 타입 불일치 시 소스 하위는 건너뜀
        } else {
            merge_copy_file(&src_child, &dest_child, mode, app_cache)?;
        }
    }
    Ok(())
}

/// 스마트 폴더 병합 실행 (is_move=true면 병합 후 소스 폴더 삭제)
#[tauri::command]
pub async fn merge_folders(
    app: tauri::AppHandle,
    source: String,
    dest_parent: String,
    conflict_mode: FolderMergeConflictMode,
    is_move: bool,
) -> Result<()> {
    let app_cache = thumbnail_cache_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let src_path = std::path::Path::new(&source);
        if !src_path.is_dir() {
            return Err(AppError::InvalidInput("소스가 폴더가 아닙니다".into()));
        }
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let dest_path = std::path::Path::new(&dest_parent).join(file_name);
        if !dest_path.is_dir() {
            return Err(AppError::InvalidInput(
                "대상에 같은 이름의 폴더가 없습니다".into(),
            ));
        }

        if let Some(app_cache) = Some(&app_cache) {
            invalidate_thumbnail_cache_paths_in_root(
                app_cache,
                &[dest_path.to_string_lossy().to_string()],
            );
        }

        merge_folders_recursive(src_path, &dest_path, conflict_mode, Some(&app_cache))?;

        if is_move {
            if let Some(app_cache) = Some(&app_cache) {
                invalidate_thumbnail_cache_paths_in_root(app_cache, &[source.clone()]);
            }
            std::fs::remove_dir_all(src_path)?;
        }

        Ok(())
    })
    .await
    .map_err(|e| AppError::Internal(format!("폴더 병합 실패: {}", e)))?
}

// ===== 복사 =====

// 파일/폴더 복사 (재귀 지원, overwrite=true면 기존 파일 덮어쓰기)
pub(super) async fn copy_items_impl(
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
    app_cache: Option<&std::path::Path>,
) -> Result<()> {
    let overwrite = overwrite.unwrap_or(false);
    for source in &sources {
        let src_path = std::path::Path::new(source);
        let file_name = src_path
            .file_name()
            .ok_or_else(|| AppError::InvalidInput(format!("잘못된 경로: {}", source)))?;
        let mut dest_path = std::path::Path::new(&dest).join(file_name);

        // 같은 경로 충돌 시 "(복사)", "(복사 2)" 접미사 추가
        if dest_path.exists() && dest_path.canonicalize().ok() == src_path.canonicalize().ok() {
            let stem = src_path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let ext = src_path
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();
            let is_dir = src_path.is_dir();
            dest_path = get_copy_destination(std::path::Path::new(&dest), &stem, &ext, is_dir);
        } else if dest_path.exists() && overwrite {
            // 덮어쓰기: 기존 파일/폴더 삭제 후 복사
            if let Some(app_cache) = app_cache {
                invalidate_thumbnail_cache_paths_in_root(
                    app_cache,
                    &[dest_path.to_string_lossy().to_string()],
                );
            }
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

// 파일/폴더 복사 (재귀 지원, overwrite=true면 기존 파일 덮어쓰기)
#[tauri::command]
pub async fn copy_items(
    app: tauri::AppHandle,
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
) -> Result<()> {
    let app_cache = thumbnail_cache_root(&app)?;
    copy_items_impl(sources, dest, overwrite, Some(&app_cache)).await
}

/// 파일 단위 진행률(0~100%)을 Channel로 전송하는 복사 (클라우드 드라이브 등 대용량 복사용)
#[tauri::command]
pub async fn copy_items_with_progress(
    app: tauri::AppHandle,
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
    on_progress: tauri::ipc::Channel<CopyProgress>,
) -> Result<()> {
    let overwrite = overwrite.unwrap_or(false);
    let dest_path = std::path::PathBuf::from(dest);
    let app_cache = thumbnail_cache_root(&app)?;
    let on_progress = on_progress.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let jobs = collect_copy_jobs(&sources, &dest_path, overwrite, Some(&app_cache))?;
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
                copy_dir_recursive_with_progress(
                    &src,
                    &dest_one,
                    total_files,
                    &mut done,
                    &on_progress,
                )?;
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

/// 작업 큐 패널용 복사/이동 (파일별 진행률 + 전체 카운트)
#[tauri::command]
pub async fn transfer_items_with_progress(
    app: tauri::AppHandle,
    operation: String,
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
    on_progress: tauri::ipc::Channel<TransferQueueProgress>,
) -> Result<()> {
    let overwrite = overwrite.unwrap_or(false);
    let dest_path = std::path::PathBuf::from(dest);
    let app_cache = thumbnail_cache_root(&app)?;
    let on_progress = on_progress.clone();
    let op = operation.clone();

    tauri::async_runtime::spawn_blocking(move || {
        run_transfer_with_queue(
            &op,
            &sources,
            &dest_path,
            overwrite,
            Some(&app_cache),
            &on_progress,
        )
    })
    .await
    .map_err(|e| AppError::Internal(format!("전송 작업 실패: {}", e)))?
}

// ===== 복제 =====

// 파일/폴더 복제 (같은 디렉토리에 " (복사)" 접미사)
#[tauri::command]
pub async fn duplicate_items(paths: Vec<String>) -> Result<Vec<String>> {
    let mut new_paths = vec![];
    for source in &paths {
        let src = std::path::Path::new(source);
        let parent = src
            .parent()
            .ok_or_else(|| AppError::InvalidInput(format!("상위 디렉토리 없음: {}", source)))?;
        let stem = src
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let ext = src
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
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
pub(super) async fn move_items_impl(
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
    app_cache: Option<&std::path::Path>,
) -> Result<()> {
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
                if let Some(app_cache) = app_cache {
                    invalidate_thumbnail_cache_paths_in_root(
                        app_cache,
                        &[dest_path.to_string_lossy().to_string()],
                    );
                }
                if dest_path.is_dir() {
                    std::fs::remove_dir_all(&dest_path)?;
                } else {
                    std::fs::remove_file(&dest_path)?;
                }
            } else {
                continue; // 덮어쓰기 안 함: 스킵
            }
        }

        if let Some(app_cache) = app_cache {
            invalidate_thumbnail_cache_paths_in_root(app_cache, std::slice::from_ref(source));
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

// 파일/폴더 이동 (overwrite=true면 기존 파일 덮어쓰기)
#[tauri::command]
pub async fn move_items(
    app: tauri::AppHandle,
    sources: Vec<String>,
    dest: String,
    overwrite: Option<bool>,
) -> Result<()> {
    let app_cache = thumbnail_cache_root(&app)?;
    move_items_impl(sources, dest, overwrite, Some(&app_cache)).await
}
