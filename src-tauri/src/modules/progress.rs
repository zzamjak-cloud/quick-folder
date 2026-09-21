//! 진행률 전송 추상화
//!
//! 코어 로직이 Tauri IPC Channel에 직접 의존하지 않도록 싱크 트레이트로 감싼다.
//! GUI는 `ChannelSink`(프론트엔드 Channel), CLI/MCP는 별도 싱크를 꽂는다.
//!
//! `ChannelSink`만 Tauri에 의존한다. 코어 크레이트 분리 시 이 타입은 src-tauri 쪽
//! 글루 코드로 옮기고 트레이트와 `NullSink`는 그대로 이동한다.

use std::sync::Arc;

/// 진행률 수신자.
pub trait ProgressSink<T>: Send + Sync + 'static {
    /// 진행률 1건 전송. 수신자가 사라졌으면 `false`를 돌려
    /// 호출부가 남은 작업을 조기 중단할 수 있게 한다.
    fn send(&self, payload: T) -> bool;
}

/// 공유 가능한 진행률 싱크 핸들. 스레드 간 clone 해서 넘긴다.
pub type Progress<T> = Arc<dyn ProgressSink<T>>;

/// 진행률을 버리는 싱크 (진행률이 필요 없는 호출부·테스트용)
pub struct NullSink;

impl<T: Send + 'static> ProgressSink<T> for NullSink {
    fn send(&self, _payload: T) -> bool {
        true
    }
}

/// 진행률을 무시하는 핸들 생성
pub fn null_sink<T: Send + 'static>() -> Progress<T> {
    Arc::new(NullSink)
}

/// Tauri IPC Channel 어댑터 (GUI 전용)
pub struct ChannelSink<T: Clone + serde::Serialize + Send + Sync + 'static> {
    channel: tauri::ipc::Channel<T>,
}

impl<T: Clone + serde::Serialize + Send + Sync + 'static> ProgressSink<T> for ChannelSink<T> {
    fn send(&self, payload: T) -> bool {
        self.channel.send(payload).is_ok()
    }
}

/// 프론트엔드 Channel을 진행률 싱크 핸들로 감싼다.
pub fn channel_sink<T: Clone + serde::Serialize + Send + Sync + 'static>(
    channel: tauri::ipc::Channel<T>,
) -> Progress<T> {
    Arc::new(ChannelSink { channel })
}
