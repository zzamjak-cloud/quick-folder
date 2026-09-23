//! 접근 허용 루트
//!
//! MCP 서버는 AI 에이전트가 호출한다. 에이전트가 임의 경로를 건드리지 못하도록
//! `QF_MCP_ROOTS`에 나열된 디렉토리 밖은 전부 거부한다.
//! **환경변수가 비어 있으면 아무 경로도 허용하지 않는다** — 명시적 옵트인이 기본이다.

use std::path::{Path, PathBuf};

use quickfolder_core::path_guard::normalize;

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
