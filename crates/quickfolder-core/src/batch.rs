//! 배치 실행기
//!
//! 여러 파일에 같은 연산을 병렬로 적용한다. CLI·MCP가 쓰는 진입점이며,
//! GUI는 쓰지 않는다(프론트엔드가 자체 큐로 동시성을 관리한다).
//!
//! 설계 원칙 두 가지:
//! - **실패 격리**: 파일 한 건이 실패해도 배치 전체를 중단하지 않고 건별 결과를 모은다.
//! - **입력 순서 보존**: 완료 순서와 무관하게 결과는 입력 순서로 돌려준다.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::error::Result;
use crate::progress::Progress;

/// 파일 한 건의 처리 결과
pub struct BatchOutcome<T> {
    pub input: PathBuf,
    pub result: Result<T>,
}

impl<T> BatchOutcome<T> {
    pub fn is_ok(&self) -> bool {
        self.result.is_ok()
    }
}

/// 배치 진행률 1건
#[derive(Clone, serde::Serialize)]
pub struct BatchProgress {
    pub done: usize,
    pub total: usize,
    pub current: String,
    pub ok: bool,
}

/// 지킬 UI가 없는 프로세스의 기본 병렬도 — 논리 코어 수.
pub fn default_jobs() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

/// 입력 파일 수집.
///
/// `roots`의 각 항목은 파일이거나 디렉토리다. 디렉토리는 `recursive`에 따라
/// 하위까지 훑는다. `exts`가 비어 있지 않으면 확장자(소문자, 점 없음)로 거른다.
/// 숨김 파일은 제외한다. 결과는 경로순 정렬이라 실행마다 순서가 같다.
pub fn collect_files(roots: &[PathBuf], recursive: bool, exts: &[String]) -> Vec<PathBuf> {
    let wanted: Vec<String> = exts.iter().map(|e| e.trim_start_matches('.').to_lowercase()).collect();
    let matches_ext = |p: &Path| -> bool {
        if wanted.is_empty() {
            return true;
        }
        p.extension()
            .and_then(|e| e.to_str())
            .map(|e| wanted.contains(&e.to_lowercase()))
            .unwrap_or(false)
    };

    let mut out = Vec::new();
    for root in roots {
        if root.is_file() {
            if matches_ext(root) {
                out.push(root.clone());
            }
            continue;
        }
        let walker = walkdir::WalkDir::new(root).max_depth(if recursive { usize::MAX } else { 1 });
        for entry in walker.into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if !entry.file_type().is_file() || !matches_ext(path) {
                continue;
            }
            if crate::helpers::is_hidden_file(&entry.file_name().to_string_lossy()) {
                continue;
            }
            out.push(path.to_path_buf());
        }
    }
    out.sort();
    out.dedup();
    out
}

/// 파일별로 `op`을 최대 `jobs`개까지 동시에 실행한다.
///
/// 동시성은 세마포어로 제한한다. 각 연산 내부의 `spawn_blocking`이 실제 작업을
/// 블로킹 풀로 넘기므로, 여기서 제한하지 않으면 무거운 이미지 디코딩이 한꺼번에
/// 올라와 메모리가 터진다.
pub async fn run_batch<T, F, Fut>(
    inputs: Vec<PathBuf>,
    jobs: usize,
    on_progress: Progress<BatchProgress>,
    op: F,
) -> Vec<BatchOutcome<T>>
where
    T: Send + 'static,
    F: Fn(PathBuf) -> Fut + Send + Sync + 'static,
    Fut: std::future::Future<Output = Result<T>> + Send,
{
    let total = inputs.len();
    let semaphore = Arc::new(tokio::sync::Semaphore::new(jobs.max(1)));
    let op = Arc::new(op);

    let mut slots: Vec<Option<BatchOutcome<T>>> = (0..total).map(|_| None).collect();
    let mut set = tokio::task::JoinSet::new();

    for (index, input) in inputs.into_iter().enumerate() {
        let semaphore = semaphore.clone();
        let op = op.clone();
        set.spawn(async move {
            // 세마포어는 닫지 않으므로 acquire 실패는 발생하지 않는다.
            let _permit = semaphore.acquire_owned().await;
            let result = op(input.clone()).await;
            (index, BatchOutcome { input, result })
        });
    }

    let mut done = 0usize;
    while let Some(joined) = set.join_next().await {
        let (index, outcome) = match joined {
            Ok(value) => value,
            // 태스크 패닉: 해당 항목만 실패로 남기고 배치는 계속한다.
            Err(e) => {
                done += 1;
                log::error!("배치 태스크 실패: {}", e);
                continue;
            }
        };
        done += 1;
        on_progress.send(BatchProgress {
            done,
            total,
            current: outcome.input.to_string_lossy().to_string(),
            ok: outcome.is_ok(),
        });
        slots[index] = Some(outcome);
    }

    slots.into_iter().flatten().collect()
}

/// 배치 결과 요약
pub struct BatchSummary {
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
}

pub fn summarize<T>(outcomes: &[BatchOutcome<T>]) -> BatchSummary {
    let succeeded = outcomes.iter().filter(|o| o.is_ok()).count();
    BatchSummary {
        total: outcomes.len(),
        succeeded,
        failed: outcomes.len() - succeeded,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppError;
    use crate::progress::null_sink;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("qf_batch_{}_{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn collect_files_filters_by_extension_and_skips_hidden() {
        let dir = temp_dir("collect");
        std::fs::write(dir.join("a.png"), b"1").unwrap();
        std::fs::write(dir.join("b.PNG"), b"1").unwrap();
        std::fs::write(dir.join("c.txt"), b"1").unwrap();
        std::fs::write(dir.join(".hidden.png"), b"1").unwrap();
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("sub/d.png"), b"1").unwrap();

        let shallow = collect_files(&[dir.clone()], false, &["png".to_string()]);
        let names: Vec<String> = shallow
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["a.png", "b.PNG"], "대소문자 무시·숨김 제외·비재귀");

        let deep = collect_files(&[dir.clone()], true, &[".png".to_string()]);
        assert_eq!(deep.len(), 3, "재귀 시 하위 디렉토리 포함");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn run_batch_isolates_failures_and_preserves_input_order() {
        let inputs: Vec<PathBuf> = (0..20).map(|i| PathBuf::from(format!("/tmp/f{:02}", i))).collect();
        let outcomes = crate::runtime::block_on(run_batch(
            inputs.clone(),
            4,
            null_sink(),
            |path: PathBuf| async move {
                let name = path.file_name().unwrap().to_string_lossy().to_string();
                // 짝수만 성공시켜 실패가 섞여도 배치가 끝까지 도는지 본다
                if name.ends_with('0') || name.ends_with('2') {
                    Err(AppError::InvalidInput(name))
                } else {
                    Ok(name)
                }
            },
        ));

        assert_eq!(outcomes.len(), inputs.len(), "모든 입력에 결과가 있어야 한다");
        for (outcome, input) in outcomes.iter().zip(inputs.iter()) {
            assert_eq!(&outcome.input, input, "결과가 입력 순서를 보존해야 한다");
        }
        let summary = summarize(&outcomes);
        assert_eq!(summary.total, 20);
        assert_eq!(summary.failed, 4, "f00 f02 f10 f12");
        assert_eq!(summary.succeeded, 16);
    }

    #[test]
    fn run_batch_respects_concurrency_limit() {
        let inflight = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let (i2, p2) = (inflight.clone(), peak.clone());

        let inputs: Vec<PathBuf> = (0..24).map(|i| PathBuf::from(format!("/tmp/x{}", i))).collect();
        let outcomes = crate::runtime::block_on(run_batch(inputs, 3, null_sink(), move |_p| {
            let (inflight, peak) = (i2.clone(), p2.clone());
            async move {
                let now = inflight.fetch_add(1, Ordering::SeqCst) + 1;
                peak.fetch_max(now, Ordering::SeqCst);
                tokio::task::yield_now().await;
                std::thread::sleep(std::time::Duration::from_millis(5));
                inflight.fetch_sub(1, Ordering::SeqCst);
                Ok(())
            }
        }));

        assert_eq!(outcomes.len(), 24);
        assert!(
            peak.load(Ordering::SeqCst) <= 3,
            "동시 실행이 한도를 넘었다: {}",
            peak.load(Ordering::SeqCst)
        );
    }

    #[test]
    fn run_batch_reports_progress_for_every_item() {
        use crate::progress::ProgressSink;

        struct Counter(AtomicUsize);
        impl ProgressSink<BatchProgress> for Counter {
            fn send(&self, _p: BatchProgress) -> bool {
                self.0.fetch_add(1, Ordering::SeqCst);
                true
            }
        }
        let sink = Arc::new(Counter(AtomicUsize::new(0)));
        let counter = sink.clone();

        let inputs: Vec<PathBuf> = (0..7).map(|i| PathBuf::from(format!("/tmp/p{}", i))).collect();
        crate::runtime::block_on(run_batch(inputs, 2, sink, |_p| async move { Ok(()) }));

        assert_eq!(counter.0.load(Ordering::SeqCst), 7);
    }
}
