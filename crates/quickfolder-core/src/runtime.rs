//! 비동기 런타임 헬퍼
//!
//! Tauri의 `async_runtime`(tokio 재노출)에 직접 의존하지 않기 위한 얇은 층.
//! GUI 앱의 command는 Tauri가 만든 런타임 컨텍스트 안에서 실행되므로
//! `tokio::task::spawn_blocking`을 그대로 쓰면 되고, 런타임 바깥(테스트·CLI·MCP)에서는
//! 여기서 만드는 전역 런타임을 쓴다.

use std::future::Future;
use std::sync::OnceLock;

/// 런타임 바깥에서 쓰는 전역 멀티스레드 런타임.
/// 프로세스당 1회만 생성된다.
fn global() -> &'static tokio::runtime::Runtime {
    static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("tokio 런타임 생성 실패")
    })
}

/// 동기 컨텍스트에서 future를 완료까지 실행한다.
///
/// 이미 tokio 런타임 안에서 호출하면 패닉한다(tokio 기본 동작).
/// 런타임 안에서는 `.await`를 쓸 것.
pub fn block_on<F: Future>(future: F) -> F::Output {
    global().block_on(future)
}
