//! 이미지 처리 동시성 제한 모듈
//!
//! 메모리를 크게 쓰는 이미지 연산의 동시 실행 수를 제한한다.
//! 한도는 프로세스 성격에 따라 다르다.
//!
//! - GUI 앱: 기본값 `MAX_HEAVY_OPS`(=3). UI 스레드·WebView와 CPU·메모리를 나눠 쓰므로 보수적.
//! - CLI / MCP 서버: 지킬 UI가 없으므로 `set_heavy_op_limit(available_parallelism())`로 열어둔다.

use crate::constants::MAX_HEAVY_OPS;

use std::sync::{Condvar, Mutex, OnceLock};

static LIMIT: OnceLock<usize> = OnceLock::new();

/// 동시 실행 한도를 설정한다. **프로세스당 1회, 첫 이미지 연산 전에** 호출해야 한다.
/// 이미 정해진 뒤면 `false`를 반환하고 기존 값을 유지한다.
pub fn set_heavy_op_limit(limit: usize) -> bool {
    LIMIT.set(limit.max(1)).is_ok()
}

/// 현재 적용 중인 한도. 설정되지 않았으면 GUI 기본값으로 고정된다.
pub fn heavy_op_limit() -> usize {
    *LIMIT.get_or_init(|| MAX_HEAVY_OPS)
}

fn heavy_op_guard() -> &'static (Mutex<usize>, Condvar) {
    static GUARD: OnceLock<(Mutex<usize>, Condvar)> = OnceLock::new();
    GUARD.get_or_init(|| (Mutex::new(0), Condvar::new()))
}

/// RAII 가드: 생성 시 슬롯 획득, 드롭 시 슬롯 반환
pub(super) struct HeavyOpPermit;

impl HeavyOpPermit {
    pub(super) fn acquire() -> Self {
        let limit = heavy_op_limit();
        let (lock, cvar) = heavy_op_guard();
        let mut count = lock.lock().unwrap();
        while *count >= limit {
            count = cvar.wait(count).unwrap();
        }
        *count += 1;
        HeavyOpPermit
    }
}

impl Drop for HeavyOpPermit {
    fn drop(&mut self) {
        let (lock, cvar) = heavy_op_guard();
        let mut count = lock.lock().unwrap();
        *count -= 1;
        cvar.notify_one();
    }
}
