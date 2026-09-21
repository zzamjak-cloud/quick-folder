//! 앱 경로 규약
//!
//! 캐시 디렉토리 위치를 한 곳에서 결정한다. GUI 앱은 Tauri `AppHandle`에서(src-tauri 글루),
//! CLI/MCP는 번들 식별자 기준 경로에서 만들어 같은 캐시를 공유한다.
//! (이미 내려받은 ffmpeg·썸네일 캐시를 재사용하기 위함)

use std::path::{Path, PathBuf};

use crate::error::{AppError, Result};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AppPaths {
    cache_dir: PathBuf,
}

impl AppPaths {
    pub fn new(cache_dir: PathBuf) -> Self {
        Self { cache_dir }
    }

    /// 번들 식별자 기준 캐시 경로 — GUI가 쓰는 경로와 동일해야 한다.
    /// macOS: ~/Library/Caches/{id}, Windows: %LOCALAPPDATA%/{id},
    /// Linux: $XDG_CACHE_HOME/{id} 또는 ~/.cache/{id}
    pub fn from_bundle_identifier(identifier: &str) -> Result<Self> {
        let base = platform_cache_root()
            .ok_or_else(|| AppError::Internal("캐시 디렉토리를 찾을 수 없습니다.".to_string()))?;
        Ok(Self::new(base.join(identifier)))
    }

    pub fn cache_dir(&self) -> &Path {
        &self.cache_dir
    }

    /// 캐시 하위 디렉토리 경로(생성하지 않음)
    pub fn cache_subdir(&self, name: &str) -> PathBuf {
        self.cache_dir.join(name)
    }
}

/// 플랫폼 캐시 루트 (macOS: ~/Library/Caches, Windows: %LOCALAPPDATA%,
/// Linux: $XDG_CACHE_HOME 또는 ~/.cache) — Tauri가 쓰는 경로와 동일하다.
fn platform_cache_root() -> Option<PathBuf> {
    dirs::cache_dir()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_subdir_joins_under_cache_dir() {
        let paths = AppPaths::new(PathBuf::from("/tmp/qf-cache"));
        assert_eq!(
            paths.cache_subdir("img_thumbnails"),
            PathBuf::from("/tmp/qf-cache/img_thumbnails")
        );
    }

    #[test]
    fn bundle_identifier_path_is_under_platform_cache_root() {
        let paths = AppPaths::from_bundle_identifier("com.quickfolder.widget")
            .expect("플랫폼 캐시 경로 확인 실패");
        let root = platform_cache_root().expect("플랫폼 캐시 루트 없음");
        assert_eq!(paths.cache_dir(), root.join("com.quickfolder.widget"));
    }
}
