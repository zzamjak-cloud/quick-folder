//! Tauri 전용 어댑터
//!
//! 코어(quickfolder-core)는 GUI를 모른다. 앱이 가진 Tauri 타입을
//! 코어가 받는 형태로 바꿔주는 얇은 변환 계층.

use quickfolder_core::error::{AppError, Result};
use quickfolder_core::paths::AppPaths;
use quickfolder_core::progress::{Progress, ProgressSink};

/// Tauri AppHandle에서 캐시 경로 규약을 파생한다.
pub fn app_paths<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<AppPaths> {
    use tauri::Manager;
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| AppError::Internal(e.to_string()))?;
    Ok(AppPaths::new(cache_dir))
}

/// 프론트엔드 IPC Channel을 코어의 진행률 싱크로 감싼다.
struct ChannelSink<T: Clone + serde::Serialize + Send + Sync + 'static> {
    channel: tauri::ipc::Channel<T>,
}

impl<T: Clone + serde::Serialize + Send + Sync + 'static> ProgressSink<T> for ChannelSink<T> {
    fn send(&self, payload: T) -> bool {
        self.channel.send(payload).is_ok()
    }
}

pub fn channel_sink<T: Clone + serde::Serialize + Send + Sync + 'static>(
    channel: tauri::ipc::Channel<T>,
) -> Progress<T> {
    std::sync::Arc::new(ChannelSink { channel })
}
