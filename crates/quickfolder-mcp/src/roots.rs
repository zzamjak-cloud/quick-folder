//! 접근 허용 루트
//!
//! MCP 서버는 AI 에이전트가 호출한다. 에이전트가 임의 경로를 건드리지 못하도록
//! `QF_MCP_ROOTS`에 나열된 디렉토리 밖은 전부 거부한다.
//! **환경변수가 비어 있으면 아무 경로도 허용하지 않는다** — 명시적 옵트인이 기본이다.

use std::path::{Component, Path, PathBuf};

pub struct Roots {
    allowed: Vec<PathBuf>,
}

impl Roots {
    /// 환경변수에서 읽는다. 구분자는 OS 표준(`:` / `;`).
    pub fn from_env(var: &str) -> Self {
        let allowed = std::env::var_os(var)
            .map(|value| {
                std::env::split_paths(&value)
                    .filter(|p| !p.as_os_str().is_empty())
                    .map(|p| normalize(&p))
                    .collect()
            })
            .unwrap_or_default();
        Self { allowed }
    }

    pub fn new(allowed: Vec<PathBuf>) -> Self {
        Self {
            allowed: allowed.iter().map(|p| normalize(p)).collect(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.allowed.is_empty()
    }

    pub fn list(&self) -> &[PathBuf] {
        &self.allowed
    }

    /// 경로가 허용 루트 안인지 확인하고 정규화된 경로를 돌려준다.
    pub fn check(&self, path: &str) -> Result<PathBuf, String> {
        if self.allowed.is_empty() {
            return Err(
                "허용된 루트가 없습니다. QF_MCP_ROOTS 환경변수에 접근을 허용할 디렉토리를 지정하세요."
                    .to_string(),
            );
        }
        let candidate = normalize(Path::new(path));
        if self.allowed.iter().any(|root| candidate.starts_with(root)) {
            Ok(candidate)
        } else {
            Err(format!(
                "허용 루트 밖의 경로입니다: {} (허용: {})",
                candidate.display(),
                self.allowed
                    .iter()
                    .map(|p| p.display().to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ))
        }
    }

    /// 여러 경로를 한 번에 검사한다. 하나라도 벗어나면 실패.
    pub fn check_all(&self, paths: &[String]) -> Result<Vec<PathBuf>, String> {
        paths.iter().map(|p| self.check(p)).collect()
    }
}

/// 심볼릭 링크와 `..`을 해소한 절대 경로.
///
/// 존재하지 않는 경로(출력 대상 등)는 가장 가까운 상위 실재 경로를 정규화한 뒤
/// 나머지를 이어 붙인다. `..`을 문자열로 남겨두면 루트 검사를 우회할 수 있다.
fn normalize(path: &Path) -> PathBuf {
    if let Ok(resolved) = path.canonicalize() {
        return resolved;
    }
    let mut ancestor = path.to_path_buf();
    let mut tail: Vec<std::ffi::OsString> = Vec::new();
    while let Some(parent) = ancestor.parent().map(|p| p.to_path_buf()) {
        let Some(name) = ancestor.file_name().map(|n| n.to_os_string()) else {
            break;
        };
        if let Ok(resolved) = parent.canonicalize() {
            // name은 실재하는 parent의 바로 아래, tail은 그보다 깊은 쪽부터 쌓였으므로
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
    // 정규화할 수 없으면 최소한 . 과 .. 만 접어 둔다
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

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("qf_roots_{}_{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("inside")).unwrap();
        dir
    }

    #[test]
    fn empty_allowlist_denies_everything() {
        let roots = Roots::new(vec![]);
        assert!(roots.is_empty());
        assert!(roots.check("/tmp").is_err(), "옵트인 전에는 전부 거부");
    }

    #[test]
    fn allows_paths_under_root_and_rejects_outside() {
        let dir = temp_dir("basic");
        let roots = Roots::new(vec![dir.clone()]);

        assert!(roots.check(dir.join("inside").to_str().unwrap()).is_ok());
        assert!(roots.check("/etc").is_err(), "루트 밖 거부");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_parent_traversal_escape() {
        let dir = temp_dir("traversal");
        let roots = Roots::new(vec![dir.join("inside")]);

        // inside/../ 로 루트를 빠져나가는 경로는 거부돼야 한다
        let escape = dir.join("inside").join("..").join("outside.txt");
        assert!(
            roots.check(escape.to_str().unwrap()).is_err(),
            "..로 루트를 벗어나면 거부해야 한다"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn allows_not_yet_existing_output_path_inside_root() {
        let dir = temp_dir("output");
        let roots = Roots::new(vec![dir.clone()]);

        let target = dir.join("inside").join("new").join("out.png");
        let checked = roots
            .check(target.to_str().unwrap())
            .expect("아직 없는 출력 경로도 루트 안이면 허용");
        assert!(checked.ends_with("out.png"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
