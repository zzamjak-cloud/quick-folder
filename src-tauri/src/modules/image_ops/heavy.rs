//! 이미지 처리 동시성 제한 모듈

use crate::modules::constants::MAX_HEAVY_OPS;

// --- 동시성 제한 (이미지 처리 메모리 폭주 방지) ---
use std::sync::{Condvar, Mutex, OnceLock};

fn heavy_op_guard() -> &'static (Mutex<usize>, Condvar) {
    static GUARD: OnceLock<(Mutex<usize>, Condvar)> = OnceLock::new();
    GUARD.get_or_init(|| (Mutex::new(0), Condvar::new()))
}

/// RAII 가드: 생성 시 슬롯 획득, 드롭 시 슬롯 반환
pub(super) struct HeavyOpPermit;

impl HeavyOpPermit {
    pub(super) fn acquire() -> Self {
        let (lock, cvar) = heavy_op_guard();
        let mut count = lock.lock().unwrap();
        while *count >= MAX_HEAVY_OPS {
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
