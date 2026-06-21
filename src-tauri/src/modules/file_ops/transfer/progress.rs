use crate::modules::error::{AppError, Result};
use crate::modules::image_ops::invalidate_thumbnail_cache_paths_in_root;

use super::{collect_copy_jobs, collect_move_jobs, count_files_to_copy};

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

struct TransferPlan {
    steps: Vec<TransferStep>,
    /// cross-volume 이동 후 삭제할 최상위 소스 경로
    move_cleanup_roots: Vec<std::path::PathBuf>,
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

pub(super) fn run_transfer_with_queue(
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

pub(super) fn run_copy_with_progress(
    sources: Vec<String>,
    dest_path: std::path::PathBuf,
    overwrite: bool,
    app_cache: std::path::PathBuf,
    on_progress: tauri::ipc::Channel<CopyProgress>,
) -> Result<()> {
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
}
