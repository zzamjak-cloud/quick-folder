//! 경로 봉쇄(containment) 검사
//!
//! 허용 루트 밖 접근을 막는 쪽에서 공통으로 쓴다.
//! - MCP 서버의 `QF_MCP_ROOTS` 검사 (`quickfolder-mcp::roots`)
//! - AI 에이전트 요청의 대상 폴더 검사 (`agent_launch`)
//!
//! **문자열 비교로는 안 된다.** `root/../etc` 처럼 `..` 을 문자열로 남겨 두면
//! `starts_with` 검사를 그대로 통과한다. 반드시 [`normalize`] 로 해소한 뒤 비교한다.

use std::ffi::OsString;
use std::path::{Component, Path, PathBuf};

/// 심볼릭 링크와 `..` 을 해소한 절대 경로.
///
/// 존재하지 않는 경로(아직 만들지 않은 출력 대상 등)는 가장 가까운 상위 실재 경로를
/// 정규화한 뒤 나머지를 이어 붙인다.
pub fn normalize(path: &Path) -> PathBuf {
    if let Ok(resolved) = path.canonicalize() {
        return resolved;
    }
    let mut ancestor = path.to_path_buf();
    let mut tail: Vec<OsString> = Vec::new();
    while let Some(parent) = ancestor.parent().map(|p| p.to_path_buf()) {
        let Some(name) = ancestor.file_name().map(|n| n.to_os_string()) else {
            break;
        };
        if let Ok(resolved) = parent.canonicalize() {
            // name 은 실재하는 parent 의 바로 아래, tail 은 그보다 깊은 쪽부터 쌓였으므로
            // name → tail 역순 순서로 이어 붙여야 원래 경로가 복원된다.
            let mut out = resolved;
            out.push(name);
            for part in tail.iter().rev() {
                out.push(part);
            }
            return out;
        }
        tail.push(name);
        ancestor = parent;
    }
    // 정규화할 수 없으면 최소한 `.` 과 `..` 만 접어 둔다
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// `path` 가 `roots` 중 하나의 아래(또는 루트 자신)인지 확인하고 정규화된 경로를 돌려준다.
///
/// `roots` 는 이미 정규화돼 있다고 가정하지 않는다 — 여기서 다시 정규화한다.
/// 빈 `roots` 는 언제나 거부다. 명시적 옵트인이 기본값이라서다.
pub fn contained_in(path: &Path, roots: &[PathBuf]) -> Option<PathBuf> {
    if roots.is_empty() {
        return None;
    }
    let candidate = normalize(path);
    roots
        .iter()
        .any(|root| candidate.starts_with(normalize(root)))
        .then_some(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("qf_guard_{}_{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("inside")).unwrap();
        dir
    }

    #[test]
    fn empty_roots_deny_everything() {
        assert!(contained_in(Path::new("/tmp"), &[]).is_none());
    }

    #[test]
    fn allows_root_itself_and_children() {
        let dir = temp_dir("children");
        let roots = vec![dir.clone()];

        assert!(contained_in(&dir, &roots).is_some(), "루트 자신은 허용");
        assert!(contained_in(&dir.join("inside"), &roots).is_some());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parent_dir_escape_is_rejected() {
        let dir = temp_dir("escape");
        let roots = vec![dir.join("inside")];

        // inside/../ 로 루트 밖을 노리는 경로는 정규화 후 거부돼야 한다
        let escaped = dir.join("inside").join("..").join("outside");
        assert!(contained_in(&escaped, &roots).is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sibling_with_shared_prefix_is_rejected() {
        // `/a/root` 아래인지 볼 때 `/a/rootx` 가 문자열 prefix 로 걸리면 안 된다
        let base = temp_dir("prefix");
        std::fs::create_dir_all(base.join("rootx")).unwrap();
        std::fs::create_dir_all(base.join("root")).unwrap();
        let roots = vec![base.join("root")];

        assert!(contained_in(&base.join("rootx"), &roots).is_none());

        let _ = std::fs::remove_dir_all(&base);
    }
}
