//! AI 에이전트 요청 실행 (폴더 우클릭 → "AI Agent 요청하기")
//!
//! [`mcp_setup`](crate::mcp_setup) 은 **에이전트 → QuickFolder** 방향이다.
//! 이 모듈은 반대 방향 — **QuickFolder → 에이전트** — 으로, 앱이 에이전트 CLI 를
//! 헤드리스로 띄워 특정 폴더에 지시를 적용시킨다.
//!
//! ## 폴더 봉쇄
//!
//! 1. 대상 폴더가 **실제 등록된** 허용 루트 안인지 검사한다
//!    (프론트엔드가 보낸 값이 아니라 클라이언트 설정 파일에 적힌 값을 기준으로 한다)
//! 2. 에이전트의 작업 디렉토리를 그 폴더로 두고, **파일 도구를 작업 디렉토리 안에 가둔다**.
//!    셸·웹·부수효과 도구는 끈다 — 필요한 것만 명시적으로 켜는 방식이다.
//! 3. QuickFolder MCP 서버에 넘기는 `QF_MCP_ROOTS` 를 **대상 폴더 하나로** 좁힌다.
//!    허용 루트 전체가 아니라 우클릭한 폴더만 열린다.
//!
//! 파일 도구(읽기·쓰기·수정·검색)는 끄지 않는다. 끄면 "텍스트 파일 읽고 요약해서
//! README 로 써줘" 같은 평범한 일까지 못 하게 되는데, 2번이 이미 폴더 밖을 막는다.
//!
//! ## 에이전트별 봉쇄 수준 차이
//!
//! | 에이전트 | 읽기 | 쓰기 | 셸 |
//! |---|---|---|---|
//! | Claude Code | 폴더 안으로 갇힘 (`--restricted`) | 폴더 안 | 제거 |
//! | Gemini CLI | 폴더 안으로 갇힘 (workspace 경계) | 폴더 안 | 제거 (`tools.core` allowlist) |
//! | Codex CLI | **갇히지 않음** | **갇히지 않음** | 살아 있음 |
//!
//! ### Codex 는 왜 못 가두나 (실측 결과)
//!
//! `codex exec` 는 비대화형에서 승인 정책을 `never` 로 강제한다. 그 상태에서는
//! MCP 도구 호출이 전부 거부된다(`MCP tool call requires approval, but approval
//! policy is never`). 이를 푸는 수단은 `--approve-for-me` 하나뿐인데, 이 플래그는
//! **샌드박스 이탈 요청까지 자동 승인**한다 — 상위 폴더 읽기와 쓰기가 실제로 통과했다.
//! 반대로 `--sandbox` 를 켜면 Windows 샌드박스가 PowerShell 기동 자체를 막아
//! (`CreateProcess ... blocked by policy`) Codex 가 아무것도 못 한다.
//!
//! 시도해 보고 안 되는 것으로 확인된 것들 (다시 시도하지 말 것):
//! `approval_policy` 를 `on-failure`/`untrusted` 로 바꾸기,
//! `mcp_servers.<name>.auto_approve`/`trust`/`trust_level`,
//! `projects."<경로>".trust_level='trusted'`, `mcp_servers={}` 로 초기화 후 재등록.
//!
//! 그래서 Codex 는 [`AgentLauncher::confines_to_folder`] 가 `false` 다. QuickFolder
//! MCP 도구는 여전히 대상 폴더로 제한되지만, Codex 자신의 셸은 디스크 어디든 간다.
//! UI 가 이 값을 보고 경고와 추가 확인 단계를 띄운다.

use std::path::{Path, PathBuf};

use crate::error::{AppError, Result};
use crate::mcp_setup::{ROOTS_ENV, SERVER_NAME};
use crate::path_guard;

/// 앱이 띄울 수 있는 에이전트
pub struct AgentLauncher {
    pub id: &'static str,
    pub label: &'static str,
    /// [`crate::mcp_setup::CLIENTS`] 의 대응 id — 등록 여부를 이걸로 판정한다
    pub mcp_client_id: &'static str,
    /// PATH 에서 찾을 실행 파일 이름 (확장자 없이)
    pub program: &'static str,
    /// 이 에이전트 자신의 도구가 대상 폴더 안으로 갇히는가.
    ///
    /// `false` 면 봉쇄가 **전혀** 보장되지 않는다 (모듈 문서의 Codex 항목 참고).
    /// QuickFolder MCP 도구의 루트 제한은 이 값과 무관하게 항상 적용된다.
    pub confines_to_folder: bool,
}

/// 지원 목록.
///
/// GUI 앱(Claude Desktop·Cursor)은 프롬프트를 외부에서 주입할 수 없어 대상이 아니다.
pub const LAUNCHERS: &[AgentLauncher] = &[
    AgentLauncher {
        id: "claude-code",
        label: "Claude Code",
        mcp_client_id: "claude-code",
        program: "claude",
        confines_to_folder: true,
    },
    AgentLauncher {
        id: "codex-cli",
        label: "Codex CLI",
        mcp_client_id: "codex-cli",
        program: "codex",
        confines_to_folder: false,
    },
    AgentLauncher {
        id: "gemini-cli",
        label: "Gemini CLI",
        mcp_client_id: "gemini-cli",
        program: "gemini",
        confines_to_folder: true,
    },
];

pub fn find_launcher(id: &str) -> Result<&'static AgentLauncher> {
    LAUNCHERS
        .iter()
        .find(|l| l.id == id)
        .ok_or_else(|| AppError::InvalidInput(format!("알 수 없는 에이전트: {}", id)))
}

/// PATH 에서 실행 파일을 찾는다.
///
/// Windows 의 `claude`·`gemini`·`codex` 는 npm 이 만든 `.cmd` 셔임인 경우가 많아
/// `PATHEXT` 를 훑어야 한다. 셸을 거치지 않고 직접 spawn 하므로 확장자까지 붙은
/// 전체 경로가 필요하다.
pub fn find_program(program: &str) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;

    #[cfg(target_os = "windows")]
    let exts: Vec<String> = std::env::var("PATHEXT")
        .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string())
        .split(';')
        .filter(|e| !e.is_empty())
        .map(|e| e.to_lowercase())
        .collect();
    #[cfg(not(target_os = "windows"))]
    let exts: Vec<String> = Vec::new();

    for dir in std::env::split_paths(&paths) {
        let bare = dir.join(program);
        if bare.is_file() {
            return Some(bare);
        }
        for ext in &exts {
            let candidate = dir.join(format!("{}{}", program, ext));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// 실행에 필요한 것 전부. 셸을 거치지 않으므로 인자 이스케이프 고민이 없다.
#[derive(Debug, PartialEq, Eq)]
pub struct Invocation {
    pub program: PathBuf,
    pub args: Vec<String>,
    /// 에이전트의 작업 디렉토리 = 우클릭한 폴더
    pub cwd: PathBuf,
    /// spawn 시 추가할 환경변수
    pub env: Vec<(String, String)>,
    /// spawn 직전에 써야 하는 임시 파일 (경로, 내용). 끝나면 지운다.
    pub temp_files: Vec<(PathBuf, String)>,
}

/// 대상 폴더가 허용 루트 안인지 검사하고 정규화된 경로를 돌려준다.
pub fn resolve_target_folder(folder: &str, allowed_roots: &[PathBuf]) -> Result<PathBuf> {
    let path = Path::new(folder);
    if !path.is_dir() {
        return Err(AppError::InvalidInput(format!(
            "폴더가 아닙니다: {}",
            folder
        )));
    }
    path_guard::contained_in(path, allowed_roots).ok_or_else(|| {
        AppError::Permission(format!(
            "허용 폴더 밖입니다: {} — 설정 → AI 에이전트 연동(MCP)에서 허용 폴더에 추가해 주세요.",
            folder
        ))
    })
}

/// Claude Code 에 켜 줄 내장 도구. 파일 작업에 필요한 것만 고른다.
///
/// 끄는 쪽이 아니라 켜는 쪽을 적는 이유: Claude Code 의 내장 도구에는 `CronDelete`,
/// `SendMessage`, `PushNotification` 처럼 파일과 무관하게 폴더 밖으로 나가는 것이
/// 섞여 있다. allowlist 로 두면 버전이 올라가며 도구가 늘어도 새로 열리지 않는다.
const CLAUDE_TOOLS: &[&str] = &["Read", "Write", "Edit", "Glob", "Grep"];

/// Gemini CLI 에 켜 줄 내장 도구 (`tools.core` allowlist).
///
/// `run_shell_command`, `web_fetch`, `google_web_search`, `save_memory` 가 빠진다.
const GEMINI_TOOLS: &[&str] = &[
    "read_file",
    "write_file",
    "replace",
    "glob",
    "search_file_content",
    "list_directory",
    "read_many_files",
];

/// 대상 폴더 하나만 담은 `QF_MCP_ROOTS` 값
fn narrowed_roots(target: &Path) -> Result<String> {
    crate::mcp_setup::join_roots(std::slice::from_ref(&target.to_path_buf()))
}

/// Claude Code 용 MCP 설정 JSON 한 덩어리
fn claude_mcp_config(qf_mcp: &Path, target: &Path) -> Result<String> {
    let value = serde_json::json!({
        "mcpServers": {
            SERVER_NAME: {
                "command": qf_mcp.to_string_lossy(),
                "args": [],
                "env": { ROOTS_ENV: narrowed_roots(target)? },
            }
        }
    });
    serde_json::to_string(&value)
        .map_err(|e| AppError::Internal(format!("MCP 설정 직렬화 실패: {}", e)))
}

/// Gemini CLI 용 시스템 설정 JSON.
///
/// `GEMINI_CLI_SYSTEM_SETTINGS_PATH` 로 주입한다. Gemini 의 설정 우선순위에서
/// system 이 가장 높아(workspace·user 보다 뒤에 병합된다) 사용자 설정을 확실히 덮는다.
/// 사용자의 `~/.gemini/settings.json` 이나 대상 폴더를 건드리지 않는 것이 핵심이다.
fn gemini_settings(qf_mcp: &Path, target: &Path) -> Result<String> {
    let value = serde_json::json!({
        "mcpServers": {
            SERVER_NAME: {
                "command": qf_mcp.to_string_lossy(),
                "args": [],
                "env": { ROOTS_ENV: narrowed_roots(target)? },
            }
        },
        // 사용자가 등록해 둔 다른 MCP 서버는 붙이지 않는다
        "mcp": { "allowed": [SERVER_NAME] },
        "tools": { "core": GEMINI_TOOLS },
    });
    serde_json::to_string_pretty(&value)
        .map_err(|e| AppError::Internal(format!("Gemini 설정 직렬화 실패: {}", e)))
}

/// TOML 리터럴 문자열(`'...'`). Codex `-c key=value` 의 value 로 쓴다.
///
/// 기본 문자열(`"..."`)을 쓰면 Windows 경로의 `\U` 같은 조각이 유니코드 이스케이프로
/// 해석돼 깨진다 — [`crate::mcp_setup`] 이 같은 이유로 `toml_edit` 리터럴을 쓴다.
/// 리터럴 문자열에는 작은따옴표를 넣을 수 없으므로 그런 경로는 거부한다.
fn toml_literal(value: &str) -> Result<String> {
    if value.contains('\'') {
        return Err(AppError::InvalidInput(format!(
            "경로에 작은따옴표가 있어 Codex 설정으로 넘길 수 없습니다: {}",
            value
        )));
    }
    Ok(format!("'{}'", value))
}

/// Gemini 설정을 둘 임시 파일 경로. `token` 은 요청마다 다른 값이어야 한다.
pub fn gemini_settings_path(token: &str) -> PathBuf {
    std::env::temp_dir().join(format!("qf-agent-gemini-{}.json", token))
}

/// 에이전트 CLI 인자를 만든다. 순수 함수라 테스트로 고정해 둔다.
///
/// `mcp_payload` 는 Claude/Gemini 는 설정 JSON, Codex 는 qf-mcp 실행 경로다.
fn build_args(
    agent_id: &str,
    prompt: &str,
    target: &Path,
    qf_mcp: &Path,
    mcp_config: &str,
) -> Result<Vec<String>> {
    let launcher = find_launcher(agent_id)?;
    let trimmed = prompt.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("요청 내용이 비어 있습니다".to_string()));
    }
    let mcp_tools = format!("mcp__{}", SERVER_NAME);

    match launcher.id {
        "claude-code" => Ok(vec![
            "-p".to_string(),
            trimmed.to_string(),
            // 사용자·프로젝트 설정을 무시하고, 셸·코드 실행 도구를 제거하고,
            // 파일 도구를 작업 디렉토리 안에 가둔다
            "--restricted".to_string(),
            // 내장 도구는 allowlist 로만 연다
            "--tools".to_string(),
            CLAUDE_TOOLS.join(","),
            // 우리가 준 MCP 서버 외에는 붙이지 않는다
            "--mcp-config".to_string(),
            mcp_config.to_string(),
            "--strict-mcp-config".to_string(),
            // 켜 둔 도구는 자동 승인
            "--allowedTools".to_string(),
            format!("{} {}", mcp_tools, CLAUDE_TOOLS.join(" ")),
            // 그 밖에 승인이 필요한 것은 묻지 말고 거부한다 (헤드리스라 답할 사람이 없다)
            "--permission-prompts".to_string(),
            "none".to_string(),
            // 진행 상황을 줄 단위로 흘려보낸다 (--print 에서는 --verbose 가 함께 필요하다)
            "--output-format".to_string(),
            "stream-json".to_string(),
            "--verbose".to_string(),
        ]),

        "codex-cli" => Ok(vec![
            "exec".to_string(),
            trimmed.to_string(),
            "-C".to_string(),
            target.display().to_string(),
            // 사용자의 config.toml 을 통째로 무시한다 — 거기 등록된 다른 MCP 서버
            // (예: 홈 디렉토리를 루트로 잡은 filesystem 서버)가 붙으면 봉쇄가 무너진다.
            // 인증은 CODEX_HOME 에서 그대로 읽으므로 로그인은 유지된다.
            "--ignore-user-config".to_string(),
            // 대상 폴더가 git 저장소가 아니어도 실행한다
            "--skip-git-repo-check".to_string(),
            // 세션 파일을 남기지 않는다
            "--ephemeral".to_string(),
            // 승인 요청을 자동 심사로 돌린다. 헤드리스에서 MCP 도구를 쓰려면 필수다
            // (`approval_policy='never'` 로 두면 MCP 호출이 전부 거부된다).
            // 이 플래그가 workspace-write 샌드박스를 함께 적용하므로 `--sandbox` 와
            // 동시에 쓸 수 없다.
            "--approve-for-me".to_string(),
            "--json".to_string(),
            "-c".to_string(),
            format!(
                "mcp_servers.{}.command={}",
                SERVER_NAME,
                toml_literal(&qf_mcp.display().to_string())?
            ),
            "-c".to_string(),
            format!("mcp_servers.{}.args=[]", SERVER_NAME),
            "-c".to_string(),
            format!(
                "mcp_servers.{}.env.{}={}",
                SERVER_NAME,
                ROOTS_ENV,
                toml_literal(&narrowed_roots(target)?)?
            ),
        ]),

        "gemini-cli" => Ok(vec![
            "-p".to_string(),
            trimmed.to_string(),
            // 설정에서 이미 도구를 좁혀 뒀으므로 남은 도구는 자동 승인한다
            "--approval-mode".to_string(),
            "yolo".to_string(),
            "--output-format".to_string(),
            "stream-json".to_string(),
        ]),

        other => Err(AppError::InvalidInput(format!(
            "실행 방법이 정의되지 않은 에이전트: {}",
            other
        ))),
    }
}

/// 우클릭 한 번에 필요한 실행 정보를 전부 조립한다.
///
/// `token` 은 요청마다 다른 값(요청 ID)이어야 한다 — 임시 설정 파일 이름에 쓴다.
pub fn build_invocation(
    agent_id: &str,
    folder: &str,
    prompt: &str,
    qf_mcp: &Path,
    allowed_roots: &[PathBuf],
    token: &str,
) -> Result<Invocation> {
    let launcher = find_launcher(agent_id)?;
    let target = resolve_target_folder(folder, allowed_roots)?;
    let program = find_program(launcher.program).ok_or_else(|| {
        AppError::NotFound(format!(
            "{} 실행 파일({})을 PATH 에서 찾을 수 없습니다.",
            launcher.label, launcher.program
        ))
    })?;

    let mcp_config = match launcher.id {
        "claude-code" => claude_mcp_config(qf_mcp, &target)?,
        _ => String::new(),
    };
    let args = build_args(agent_id, prompt, &target, qf_mcp, &mcp_config)?;

    // Gemini 만 설정을 파일로 받는다 (인라인 JSON 을 받는 플래그가 없다)
    let (env, temp_files) = if launcher.id == "gemini-cli" {
        let path = gemini_settings_path(token);
        (
            vec![(
                "GEMINI_CLI_SYSTEM_SETTINGS_PATH".to_string(),
                path.display().to_string(),
            )],
            vec![(path, gemini_settings(qf_mcp, &target)?)],
        )
    } else {
        (Vec::new(), Vec::new())
    };

    Ok(Invocation {
        program,
        args,
        cwd: target,
        env,
        temp_files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_target(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("qf_agent_{}_{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn args_for(agent: &str, target: &Path) -> Vec<String> {
        build_args(agent, "정리해줘", target, Path::new("/opt/qf-mcp"), "CFG").unwrap()
    }

    fn value_after(args: &[String], flag: &str) -> String {
        let at = args
            .iter()
            .position(|a| a == flag)
            .unwrap_or_else(|| panic!("{} 누락: {:?}", flag, args));
        args[at + 1].clone()
    }

    #[test]
    fn all_three_clis_are_supported() {
        let ids: Vec<&str> = LAUNCHERS.iter().map(|l| l.id).collect();
        assert_eq!(ids, vec!["claude-code", "codex-cli", "gemini-cli"]);
    }

    #[test]
    fn gui_apps_are_not_launchable() {
        // 프롬프트를 외부에서 주입할 수 없다
        assert!(find_launcher("claude-desktop").is_err());
        assert!(find_launcher("cursor").is_err());
    }

    #[test]
    fn only_codex_is_unconfined() {
        // Codex 만 봉쇄를 보장하지 못한다 — UI 가 이걸 보고 경고를 띄운다
        let unconfined: Vec<&str> = LAUNCHERS
            .iter()
            .filter(|l| !l.confines_to_folder)
            .map(|l| l.id)
            .collect();
        assert_eq!(unconfined, vec!["codex-cli"]);
    }

    #[test]
    fn empty_prompt_is_rejected_for_every_agent() {
        let target = temp_target("empty_prompt");
        for launcher in LAUNCHERS {
            assert!(
                build_args(launcher.id, "  \n ", &target, Path::new("/opt/qf-mcp"), "CFG").is_err(),
                "{} 빈 프롬프트를 통과시킴",
                launcher.id
            );
        }
        let _ = std::fs::remove_dir_all(&target);
    }

    #[test]
    fn prompt_goes_into_a_single_argv_slot() {
        let target = temp_target("prompt_slot");
        // 셸을 거치지 않으므로 공백·따옴표가 섞여도 한 칸에 그대로 들어간다
        let tricky = "  a b \"c\" && rm -rf /  ";
        for launcher in LAUNCHERS {
            let args =
                build_args(launcher.id, tricky, &target, Path::new("/opt/qf-mcp"), "CFG").unwrap();
            assert!(
                args.iter().any(|a| a == "a b \"c\" && rm -rf /"),
                "{} 프롬프트가 한 칸에 안 들어감: {:?}",
                launcher.id,
                args
            );
        }
        let _ = std::fs::remove_dir_all(&target);
    }

    #[test]
    fn claude_opens_file_tools_but_not_shell() {
        let target = temp_target("claude_tools");
        let args = args_for("claude-code", &target);

        // 파일 도구는 켜 둔다 — 끄면 "읽고 요약해서 써줘" 가 안 된다
        assert_eq!(value_after(&args, "--tools"), "Read,Write,Edit,Glob,Grep");
        // 폴더 봉쇄는 --restricted 가 한다
        assert!(args.iter().any(|a| a == "--restricted"));
        assert!(args.iter().any(|a| a == "--strict-mcp-config"));
        assert_eq!(value_after(&args, "--mcp-config"), "CFG");
        assert_eq!(
            value_after(&args, "--allowedTools"),
            "mcp__quickfolder Read Write Edit Glob Grep"
        );
        assert_eq!(value_after(&args, "--permission-prompts"), "none");

        // 셸·부수효과 도구가 allowlist 에 끼어들면 안 된다
        let tools = value_after(&args, "--tools");
        for forbidden in ["Bash", "PowerShell", "WebFetch", "CronDelete", "SendMessage", "Task"] {
            assert!(!tools.contains(forbidden), "{} 가 열렸다", forbidden);
        }
        let _ = std::fs::remove_dir_all(&target);
    }

    #[test]
    fn codex_ignores_user_config_and_uses_auto_approval() {
        let target = temp_target("codex_args");
        let args = args_for("codex-cli", &target);

        assert_eq!(args[0], "exec");
        // 사용자 config.toml 의 다른 MCP 서버가 붙으면 봉쇄가 무너진다
        assert!(args.iter().any(|a| a == "--ignore-user-config"));
        // 헤드리스에서 MCP 도구를 쓰려면 필수 (never 로 두면 전부 거부된다)
        assert!(args.iter().any(|a| a == "--approve-for-me"));
        // --approve-for-me 와 --sandbox 는 동시에 쓸 수 없다
        assert!(!args.iter().any(|a| a == "--sandbox"));
        assert!(args.iter().any(|a| a == "--skip-git-repo-check"));
        assert_eq!(value_after(&args, "-C"), target.display().to_string());

        let joined = args.join(" ");
        assert!(joined.contains("mcp_servers.quickfolder.command="));
        assert!(joined.contains("mcp_servers.quickfolder.args=[]"));
        assert!(joined.contains("mcp_servers.quickfolder.env.QF_MCP_ROOTS="));
        let _ = std::fs::remove_dir_all(&target);
    }

    #[test]
    fn codex_config_values_are_toml_literals() {
        // Windows 경로의 `\U` 등이 유니코드 이스케이프로 해석되면 안 된다
        assert_eq!(
            toml_literal("C:\\Users\\me\\qf-mcp.exe").unwrap(),
            "'C:\\Users\\me\\qf-mcp.exe'"
        );
        // 리터럴 문자열에 작은따옴표는 넣을 수 없으므로 조용히 깨지느니 거부한다
        assert!(toml_literal("C:\\it's\\qf.exe").is_err());
    }

    #[test]
    fn gemini_args_take_settings_from_env_not_flags() {
        let target = temp_target("gemini_args");
        let args = args_for("gemini-cli", &target);

        assert_eq!(value_after(&args, "--approval-mode"), "yolo");
        assert_eq!(value_after(&args, "--output-format"), "stream-json");
        // 작업 폴더를 workspace 로 넓히는 플래그가 붙으면 봉쇄가 무너진다
        assert!(!args.iter().any(|a| a == "--include-directories"));
        let _ = std::fs::remove_dir_all(&target);
    }

    #[test]
    fn gemini_settings_close_the_tool_surface() {
        let target = temp_target("gemini_settings");
        let json = gemini_settings(Path::new("/opt/qf-mcp"), &target).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        // 우리 서버만 허용
        assert_eq!(parsed["mcp"]["allowed"], serde_json::json!(["quickfolder"]));
        // 내장 도구는 allowlist
        let core = parsed["tools"]["core"].as_array().unwrap();
        let names: Vec<&str> = core.iter().map(|v| v.as_str().unwrap()).collect();
        assert!(names.contains(&"read_file") && names.contains(&"write_file"));
        for forbidden in ["run_shell_command", "web_fetch", "google_web_search", "save_memory"] {
            assert!(!names.contains(&forbidden), "{} 가 열렸다", forbidden);
        }
        let _ = std::fs::remove_dir_all(&target);
    }

    #[test]
    fn every_agent_narrows_roots_to_the_target_folder() {
        let target = temp_target("narrow_roots");
        let roots = narrowed_roots(&target).unwrap();

        assert!(roots.contains(target.file_name().unwrap().to_str().unwrap()));
        // 허용 루트 전체가 아니라 폴더 하나만 — PATH 구분자가 없어야 한다
        let separator = if cfg!(windows) { ';' } else { ':' };
        assert!(!roots.contains(separator), "루트가 하나가 아니다: {}", roots);

        // Claude 설정과 Gemini 설정 모두 같은 값을 쓴다
        for json in [
            claude_mcp_config(Path::new("/opt/qf-mcp"), &target).unwrap(),
            gemini_settings(Path::new("/opt/qf-mcp"), &target).unwrap(),
        ] {
            let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
            assert_eq!(
                parsed["mcpServers"]["quickfolder"]["env"][ROOTS_ENV]
                    .as_str()
                    .unwrap(),
                roots
            );
        }
        let _ = std::fs::remove_dir_all(&target);
    }

    #[test]
    fn target_folder_outside_allowed_roots_is_rejected() {
        let base = temp_target("roots_check");
        std::fs::create_dir_all(base.join("allowed").join("sub")).unwrap();
        std::fs::create_dir_all(base.join("other")).unwrap();
        let roots = vec![base.join("allowed")];

        assert!(resolve_target_folder(base.join("allowed").to_str().unwrap(), &roots).is_ok());
        assert!(
            resolve_target_folder(base.join("allowed").join("sub").to_str().unwrap(), &roots)
                .is_ok()
        );
        assert!(resolve_target_folder(base.join("other").to_str().unwrap(), &roots).is_err());
        // 허용 루트가 비어 있으면 무엇도 통과하지 못한다
        assert!(resolve_target_folder(base.join("allowed").to_str().unwrap(), &[]).is_err());

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn missing_folder_is_rejected_before_root_check() {
        let roots = vec![std::env::temp_dir()];
        let missing = std::env::temp_dir().join("qf_agent_nope_does_not_exist");
        assert!(resolve_target_folder(missing.to_str().unwrap(), &roots).is_err());
    }

    #[test]
    fn gemini_settings_path_is_per_request() {
        assert_ne!(gemini_settings_path("a"), gemini_settings_path("b"));
    }
}
