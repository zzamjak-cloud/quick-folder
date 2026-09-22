//! MCP 클라이언트 등록
//!
//! `qf-mcp` 서버를 각 AI 클라이언트의 설정 파일에 등록·해제한다.
//! GUI 설정 팝업과 CLI가 같은 코드를 쓴다.
//!
//! **남의 앱 설정 파일을 수정하는 코드다.** 다음을 지킨다.
//! - 쓰기 전 `<파일>.qfbak` 으로 직전 상태를 백업한다
//! - 같은 이름 항목이 있으면 갱신한다 (중복 생성하지 않는다)
//! - 우리 항목 외의 내용은 건드리지 않는다
//!   (JSON은 `serde_json` preserve_order, TOML은 `toml_edit`으로 주석·서식 보존)
//!
//! 새 클라이언트 추가는 [`CLIENTS`] 테이블에 한 줄 더하는 것으로 끝난다.

use std::path::{Path, PathBuf};

use crate::error::{AppError, Result};

/// 등록되는 MCP 서버 이름
pub const SERVER_NAME: &str = "quickfolder";
/// 허용 루트를 전달하는 환경변수
pub const ROOTS_ENV: &str = "QF_MCP_ROOTS";

/// 설정 파일 형식
#[derive(Clone, Copy, PartialEq, Eq, Debug, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ConfigFormat {
    /// `{"mcpServers": {"<이름>": {command, args, env}}}`
    Json,
    /// `[mcp_servers.<이름>]` + `[mcp_servers.<이름>.env]`
    Toml,
}

/// 지원 클라이언트
pub struct McpClient {
    pub id: &'static str,
    pub label: &'static str,
    pub format: ConfigFormat,
}

/// 지원 목록. 새 클라이언트는 여기에 한 줄 추가하고 [`config_path`]에 경로만 더하면 된다.
pub const CLIENTS: &[McpClient] = &[
    McpClient {
        id: "claude-code",
        label: "Claude Code",
        format: ConfigFormat::Json,
    },
    McpClient {
        id: "claude-desktop",
        label: "Claude Desktop",
        format: ConfigFormat::Json,
    },
    McpClient {
        id: "cursor",
        label: "Cursor",
        format: ConfigFormat::Json,
    },
    McpClient {
        id: "gemini-cli",
        label: "Gemini CLI",
        format: ConfigFormat::Json,
    },
    McpClient {
        id: "codex-cli",
        label: "Codex CLI",
        format: ConfigFormat::Toml,
    },
];

pub fn find_client(id: &str) -> Result<&'static McpClient> {
    CLIENTS
        .iter()
        .find(|c| c.id == id)
        .ok_or_else(|| AppError::InvalidInput(format!("알 수 없는 MCP 클라이언트: {}", id)))
}

/// 클라이언트 설정 파일 경로
pub fn config_path(id: &str) -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    match id {
        "claude-code" => Some(home.join(".claude.json")),
        "claude-desktop" => {
            #[cfg(target_os = "macos")]
            {
                Some(
                    home.join("Library")
                        .join("Application Support")
                        .join("Claude")
                        .join("claude_desktop_config.json"),
                )
            }
            #[cfg(not(target_os = "macos"))]
            {
                Some(
                    dirs::config_dir()?
                        .join("Claude")
                        .join("claude_desktop_config.json"),
                )
            }
        }
        "cursor" => Some(home.join(".cursor").join("mcp.json")),
        "gemini-cli" => Some(home.join(".gemini").join("settings.json")),
        "codex-cli" => Some(home.join(".codex").join("config.toml")),
        _ => None,
    }
}

/// 등록 상태
#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RegistrationState {
    /// 우리 항목이 없다
    NotRegistered,
    /// 등록돼 있고 실행 경로도 현재 앱과 일치한다
    Registered,
    /// 등록돼 있으나 실행 경로가 다르다 (앱 이동·개발 빌드로 등록한 뒤 정식 앱으로 교체 등)
    Outdated,
}

#[derive(Debug, serde::Serialize)]
pub struct ClientStatus {
    pub id: String,
    pub label: String,
    pub format: ConfigFormat,
    pub config_path: String,
    pub config_exists: bool,
    pub state: RegistrationState,
    /// 현재 설정 파일에 적힌 실행 경로 (등록돼 있을 때만)
    pub registered_command: Option<String>,
    /// 현재 설정 파일에 적힌 허용 루트 (등록돼 있을 때만)
    pub registered_roots: Option<String>,
}

/// 허용 루트 목록을 환경변수 값으로 만든다 (OS 표준 구분자).
pub fn join_roots(roots: &[PathBuf]) -> Result<String> {
    std::env::join_paths(roots)
        .map_err(|e| AppError::InvalidInput(format!("허용 루트 경로 결합 실패: {}", e)))?
        .into_string()
        .map_err(|_| AppError::InvalidInput("허용 루트 경로에 사용할 수 없는 문자가 있습니다".to_string()))
}

/// 번들된 `qf-mcp` 실행 파일 경로를 찾는다.
///
/// 탐색 순서는 ffmpeg(`tool_ops::ffmpeg::find_ffmpeg_path`)와 같은 방식이다.
/// 1) 실행 파일과 같은 디렉토리 — 개발 빌드(`target/debug|release/`)가 여기 걸린다
/// 2) 앱 리소스 (macOS `Contents/Resources/binaries/`, Windows `binaries/`)
pub fn find_qf_mcp_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    const BIN: &str = "qf-mcp.exe";
    #[cfg(not(target_os = "windows"))]
    const BIN: &str = "qf-mcp";

    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;

    let sibling = dir.join(BIN);
    if sibling.is_file() {
        return Some(sibling);
    }

    #[cfg(target_os = "macos")]
    let bundled = dir
        .parent()
        .map(|contents| contents.join("Resources").join("binaries").join(BIN));
    #[cfg(target_os = "windows")]
    let bundled = Some(dir.join("binaries").join(BIN));
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let bundled: Option<PathBuf> = None;

    let bundled = bundled?;
    if !bundled.is_file() {
        return None;
    }
    // 리소스 복사 과정에서 실행 권한이 유실될 수 있어 복구를 시도한다
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&bundled, std::fs::Permissions::from_mode(0o755));
    }
    Some(bundled)
}

// ───────────────────────── 상태 조회 ─────────────────────────

/// 전체 클라이언트의 등록 상태. `expected_command`는 현재 앱이 쓰는 qf-mcp 경로다.
pub fn client_statuses(expected_command: &Path) -> Vec<ClientStatus> {
    CLIENTS
        .iter()
        .map(|client| client_status(client, expected_command))
        .collect()
}

fn client_status(client: &McpClient, expected_command: &Path) -> ClientStatus {
    let path = config_path(client.id);
    let (config_path_str, exists) = match &path {
        Some(p) => (p.display().to_string(), p.is_file()),
        None => (String::new(), false),
    };

    let entry = path.as_ref().and_then(|p| read_entry(client.format, p).ok().flatten());
    let (state, command, roots) = match entry {
        None => (RegistrationState::NotRegistered, None, None),
        Some(entry) => {
            let matches = Path::new(&entry.command) == expected_command;
            let state = if matches {
                RegistrationState::Registered
            } else {
                RegistrationState::Outdated
            };
            (state, Some(entry.command), entry.roots)
        }
    };

    ClientStatus {
        id: client.id.to_string(),
        label: client.label.to_string(),
        format: client.format,
        config_path: config_path_str,
        config_exists: exists,
        state,
        registered_command: command,
        registered_roots: roots,
    }
}

struct Entry {
    command: String,
    roots: Option<String>,
}

fn read_entry(format: ConfigFormat, path: &Path) -> Result<Option<Entry>> {
    if !path.is_file() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(path)?;
    match format {
        ConfigFormat::Json => {
            let root: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| AppError::Internal(format!("{} 파싱 실패: {}", path.display(), e)))?;
            let Some(entry) = root.get("mcpServers").and_then(|m| m.get(SERVER_NAME)) else {
                return Ok(None);
            };
            Ok(Some(Entry {
                command: entry
                    .get("command")
                    .and_then(|c| c.as_str())
                    .unwrap_or_default()
                    .to_string(),
                roots: entry
                    .get("env")
                    .and_then(|e| e.get(ROOTS_ENV))
                    .and_then(|r| r.as_str())
                    .map(|s| s.to_string()),
            }))
        }
        ConfigFormat::Toml => {
            let doc: toml_edit::DocumentMut = text
                .parse()
                .map_err(|e| AppError::Internal(format!("{} 파싱 실패: {}", path.display(), e)))?;
            let Some(entry) = doc
                .get("mcp_servers")
                .and_then(|m| m.get(SERVER_NAME))
            else {
                return Ok(None);
            };
            Ok(Some(Entry {
                command: entry
                    .get("command")
                    .and_then(|c| c.as_str())
                    .unwrap_or_default()
                    .to_string(),
                roots: entry
                    .get("env")
                    .and_then(|e| e.get(ROOTS_ENV))
                    .and_then(|r| r.as_str())
                    .map(|s| s.to_string()),
            }))
        }
    }
}

// ───────────────────────── 등록 / 해제 ─────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct WriteOutcome {
    pub config_path: String,
    /// 백업 파일 경로 (기존 설정이 있었을 때만)
    pub backup_path: Option<String>,
}

/// 클라이언트 설정에 qf-mcp를 등록한다. 이미 있으면 갱신한다.
pub fn register(client_id: &str, command: &Path, roots: &[PathBuf]) -> Result<WriteOutcome> {
    if roots.is_empty() {
        return Err(AppError::InvalidInput(
            "허용 폴더를 하나 이상 선택해야 합니다. 비어 있으면 MCP 서버가 아무 경로도 열지 못합니다."
                .to_string(),
        ));
    }
    if !command.is_file() {
        return Err(AppError::NotFound(format!(
            "qf-mcp 실행 파일을 찾을 수 없습니다: {}",
            command.display()
        )));
    }
    let client = find_client(client_id)?;
    let path = config_path(client_id)
        .ok_or_else(|| AppError::Internal("홈 디렉토리를 찾을 수 없습니다".to_string()))?;
    register_at(&path, client.format, command, roots)
}

/// 경로를 직접 받는 등록 (테스트·비표준 위치용)
pub fn register_at(
    path: &Path,
    format: ConfigFormat,
    command: &Path,
    roots: &[PathBuf],
) -> Result<WriteOutcome> {
    let roots_value = join_roots(roots)?;
    let original = read_existing(path)?;
    let updated = match format {
        ConfigFormat::Json => json_with_entry(original.as_deref(), command, &roots_value, path)?,
        ConfigFormat::Toml => toml_with_entry(original.as_deref(), command, &roots_value, path)?,
    };
    write_with_backup(path, original.as_deref(), &updated)
}

/// 등록을 해제한다. 항목이 없으면 조용히 성공한다.
pub fn unregister(client_id: &str) -> Result<WriteOutcome> {
    let client = find_client(client_id)?;
    let path = config_path(client_id)
        .ok_or_else(|| AppError::Internal("홈 디렉토리를 찾을 수 없습니다".to_string()))?;
    unregister_at(&path, client.format)
}

/// 경로를 직접 받는 해제 (테스트·비표준 위치용)
pub fn unregister_at(path: &Path, format: ConfigFormat) -> Result<WriteOutcome> {
    let Some(original) = read_existing(path)? else {
        return Ok(WriteOutcome {
            config_path: path.display().to_string(),
            backup_path: None,
        });
    };

    let updated = match format {
        ConfigFormat::Json => {
            let mut root: serde_json::Value = serde_json::from_str(&original)
                .map_err(|e| AppError::Internal(format!("{} 파싱 실패: {}", path.display(), e)))?;
            if let Some(servers) = root.get_mut("mcpServers").and_then(|m| m.as_object_mut()) {
                servers.remove(SERVER_NAME);
            }
            format!("{}\n", to_json_text(&root)?)
        }
        ConfigFormat::Toml => {
            let mut doc: toml_edit::DocumentMut = original
                .parse()
                .map_err(|e| AppError::Internal(format!("{} 파싱 실패: {}", path.display(), e)))?;
            if let Some(servers) = doc.get_mut("mcp_servers").and_then(|m| m.as_table_like_mut()) {
                servers.remove(SERVER_NAME);
            }
            doc.to_string()
        }
    };
    write_with_backup(path, Some(&original), &updated)
}

fn to_json_text(value: &serde_json::Value) -> Result<String> {
    serde_json::to_string_pretty(value)
        .map_err(|e| AppError::Internal(format!("JSON 직렬화 실패: {}", e)))
}

fn read_existing(path: &Path) -> Result<Option<String>> {
    if path.is_file() {
        Ok(Some(std::fs::read_to_string(path)?))
    } else {
        Ok(None)
    }
}

/// 백업을 남기고 설정 파일을 쓴다.
fn write_with_backup(path: &Path, original: Option<&str>, updated: &str) -> Result<WriteOutcome> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let backup = match original {
        Some(original) => {
            let backup = backup_path(path);
            std::fs::write(&backup, original)?;
            Some(backup.display().to_string())
        }
        None => None,
    };
    std::fs::write(path, updated)?;
    Ok(WriteOutcome {
        config_path: path.display().to_string(),
        backup_path: backup,
    })
}

/// 직전 상태 백업 경로. 변경할 때마다 덮어써서 "되돌리기 1단계"를 항상 보장한다.
fn backup_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".qfbak");
    path.with_file_name(name)
}

fn json_with_entry(
    original: Option<&str>,
    command: &Path,
    roots: &str,
    path: &Path,
) -> Result<String> {
    let mut root: serde_json::Value = match original {
        Some(text) if !text.trim().is_empty() => serde_json::from_str(text)
            .map_err(|e| AppError::Internal(format!("{} 파싱 실패: {}", path.display(), e)))?,
        _ => serde_json::json!({}),
    };
    if !root.is_object() {
        return Err(AppError::Internal(format!(
            "{} 최상위가 객체가 아닙니다",
            path.display()
        )));
    }
    let servers = root
        .as_object_mut()
        .expect("위에서 객체 확인함")
        .entry("mcpServers")
        .or_insert_with(|| serde_json::json!({}));
    if !servers.is_object() {
        *servers = serde_json::json!({});
    }
    servers.as_object_mut().expect("객체로 보정함").insert(
        SERVER_NAME.to_string(),
        serde_json::json!({
            "command": command.display().to_string(),
            "args": [],
            "env": { ROOTS_ENV: roots },
        }),
    );
    Ok(format!("{}\n", to_json_text(&root)?))
}

fn toml_with_entry(
    original: Option<&str>,
    command: &Path,
    roots: &str,
    path: &Path,
) -> Result<String> {
    let mut doc: toml_edit::DocumentMut = match original {
        Some(text) => text
            .parse()
            .map_err(|e| AppError::Internal(format!("{} 파싱 실패: {}", path.display(), e)))?,
        None => toml_edit::DocumentMut::new(),
    };

    if doc.get("mcp_servers").is_none() {
        doc["mcp_servers"] = toml_edit::Item::Table(toml_edit::Table::new());
    }
    let servers = doc["mcp_servers"]
        .as_table_mut()
        .ok_or_else(|| AppError::Internal("mcp_servers가 테이블이 아닙니다".to_string()))?;
    // 최상위 [mcp_servers] 헤더는 출력하지 않고 [mcp_servers.quickfolder] 만 남긴다
    servers.set_implicit(true);

    let mut entry = toml_edit::Table::new();
    entry["command"] = toml_edit::value(command.display().to_string());
    entry["args"] = toml_edit::Item::Value(toml_edit::Array::new().into());
    let mut env = toml_edit::Table::new();
    env[ROOTS_ENV] = toml_edit::value(roots);
    entry["env"] = toml_edit::Item::Table(env);
    servers[SERVER_NAME] = toml_edit::Item::Table(entry);

    Ok(doc.to_string())
}

/// 수동 등록용 설정 조각. 파일 쓰기가 실패했을 때 클립보드로 넘긴다.
pub fn config_snippet(client_id: &str, command: &Path, roots: &[PathBuf]) -> Result<String> {
    let client = find_client(client_id)?;
    let roots_value = join_roots(roots)?;
    Ok(match client.format {
        ConfigFormat::Json => to_json_text(&serde_json::json!({
            "mcpServers": {
                SERVER_NAME: {
                    "command": command.display().to_string(),
                    "args": [],
                    "env": { ROOTS_ENV: roots_value },
                }
            }
        }))?,
        // 직접 문자열을 조립하지 않는다. TOML 기본 문자열은 백슬래시를 이스케이프로
        // 읽으므로 Windows 경로(`C:\Users\...`)를 그대로 끼워 넣으면 `\U` 를 유니코드
        // 이스케이프로 해석해 파싱이 깨진다. 실제 파일에 쓸 때와 같은 toml_edit 경로를 쓴다.
        ConfigFormat::Toml => toml_with_entry(None, command, &roots_value, Path::new("snippet"))?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("qf_mcpsetup_{}_{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 실행 파일이 있어야 register()가 통과하므로 더미를 만든다
    fn fake_binary(dir: &Path) -> PathBuf {
        let path = dir.join("qf-mcp");
        std::fs::write(&path, b"#!/bin/sh\n").unwrap();
        path
    }

    #[test]
    fn json_registration_preserves_unrelated_keys_and_other_servers() {
        let dir = temp_dir("json_preserve");
        let cfg = dir.join("claude.json");
        std::fs::write(
            &cfg,
            r#"{"numStartups":42,"mcpServers":{"blender":{"command":"/usr/bin/blender-mcp"}},"tipsHistory":{"a":1}}"#,
        )
        .unwrap();
        let bin = fake_binary(&dir);

        register_at(&cfg, ConfigFormat::Json, &bin, &[dir.join("roots")]).unwrap();

        let v: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&cfg).unwrap()).unwrap();
        assert_eq!(v["numStartups"], 42, "관련 없는 최상위 키 보존");
        assert_eq!(v["tipsHistory"]["a"], 1, "중첩 키 보존");
        assert_eq!(
            v["mcpServers"]["blender"]["command"], "/usr/bin/blender-mcp",
            "다른 MCP 서버 항목 보존"
        );
        assert_eq!(v["mcpServers"][SERVER_NAME]["command"], bin.display().to_string());
        assert!(v["mcpServers"][SERVER_NAME]["env"][ROOTS_ENV]
            .as_str()
            .unwrap()
            .contains("roots"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn repeated_registration_updates_in_place_without_duplicating() {
        let dir = temp_dir("json_idempotent");
        let cfg = dir.join("mcp.json");
        let bin = fake_binary(&dir);

        register_at(&cfg, ConfigFormat::Json, &bin, &[dir.join("a")]).unwrap();
        register_at(&cfg, ConfigFormat::Json, &bin, &[dir.join("b")]).unwrap();

        let v: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&cfg).unwrap()).unwrap();
        let servers = v["mcpServers"].as_object().unwrap();
        assert_eq!(servers.len(), 1, "항목이 중복 생성되면 안 된다");
        assert!(
            v["mcpServers"][SERVER_NAME]["env"][ROOTS_ENV]
                .as_str()
                .unwrap()
                .ends_with("b"),
            "두 번째 등록 값으로 갱신돼야 한다"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn backup_holds_state_immediately_before_the_change() {
        let dir = temp_dir("backup");
        let cfg = dir.join("mcp.json");
        std::fs::write(&cfg, r#"{"mcpServers":{}}"#).unwrap();
        let bin = fake_binary(&dir);

        let outcome = register_at(&cfg, ConfigFormat::Json, &bin, &[dir.clone()]).unwrap();
        let backup = outcome.backup_path.expect("기존 파일이 있으면 백업이 남아야 한다");
        assert_eq!(
            std::fs::read_to_string(&backup).unwrap(),
            r#"{"mcpServers":{}}"#,
            "백업은 변경 직전 상태여야 한다"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn toml_registration_keeps_comments_and_other_sections() {
        let dir = temp_dir("toml_preserve");
        let cfg = dir.join("config.toml");
        std::fs::write(
            &cfg,
            "# 사용자 주석은 보존돼야 한다\nmodel = \"gpt-5\"\n\n[mcp_servers.unityMCP]\ncommand = \"uv\"\n",
        )
        .unwrap();
        let bin = fake_binary(&dir);

        register_at(&cfg, ConfigFormat::Toml, &bin, &[dir.join("pics")]).unwrap();
        let text = std::fs::read_to_string(&cfg).unwrap();

        assert!(text.contains("# 사용자 주석은 보존돼야 한다"), "주석 보존");
        assert!(text.contains("model = \"gpt-5\""), "다른 최상위 키 보존");
        assert!(text.contains("[mcp_servers.unityMCP]"), "다른 서버 항목 보존");
        assert!(text.contains(&format!("[mcp_servers.{}]", SERVER_NAME)));
        assert!(text.contains(&format!("[mcp_servers.{}.env]", SERVER_NAME)));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn unregister_removes_only_our_entry() {
        let dir = temp_dir("unregister");
        let cfg = dir.join("config.toml");
        std::fs::write(&cfg, "[mcp_servers.other]\ncommand = \"x\"\n").unwrap();
        let bin = fake_binary(&dir);

        register_at(&cfg, ConfigFormat::Toml, &bin, &[dir.clone()]).unwrap();
        unregister_at(&cfg, ConfigFormat::Toml).unwrap();

        let text = std::fs::read_to_string(&cfg).unwrap();
        assert!(text.contains("[mcp_servers.other]"), "남의 항목은 남아야 한다");
        assert!(
            !text.contains(&format!("mcp_servers.{}", SERVER_NAME)),
            "우리 항목만 제거돼야 한다"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn registration_requires_at_least_one_root() {
        let dir = temp_dir("no_roots");
        let bin = fake_binary(&dir);
        // 허용 폴더가 비면 서버가 아무것도 못 여는 상태로 등록되므로 막는다
        let err = register("claude-code", &bin, &[]).unwrap_err();
        assert!(err.to_string().contains("허용 폴더"), "실제 메시지: {}", err);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn registration_requires_existing_binary() {
        let dir = temp_dir("no_binary");
        let missing = dir.join("nope");
        let err = register("claude-code", &missing, &[dir.clone()]).unwrap_err();
        assert!(err.to_string().contains("qf-mcp"), "실제 메시지: {}", err);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn status_flags_outdated_when_command_path_differs() {
        let dir = temp_dir("status");
        let cfg = dir.join("mcp.json");
        let bin = fake_binary(&dir);
        register_at(&cfg, ConfigFormat::Json, &bin, &[dir.clone()]).unwrap();

        let entry = read_entry(ConfigFormat::Json, &cfg).unwrap().unwrap();
        assert_eq!(Path::new(&entry.command), bin, "등록된 경로를 읽어야 한다");
        assert_ne!(
            Path::new(&entry.command),
            dir.join("other-location/qf-mcp"),
            "다른 경로면 불일치로 판정된다"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn every_client_has_a_resolvable_config_path() {
        for client in CLIENTS {
            assert!(
                config_path(client.id).is_some(),
                "{} 의 설정 경로가 없다",
                client.id
            );
        }
    }

    #[test]
    fn snippet_is_valid_for_both_formats() {
        let dir = temp_dir("snippet");
        let bin = fake_binary(&dir);
        let json = config_snippet("claude-code", &bin, &[dir.clone()]).unwrap();
        serde_json::from_str::<serde_json::Value>(&json).expect("JSON 조각이 파싱돼야 한다");

        let toml = config_snippet("codex-cli", &bin, &[dir.clone()]).unwrap();
        toml.parse::<toml_edit::DocumentMut>()
            .expect("TOML 조각이 파싱돼야 한다");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn snippet_escapes_backslash_paths() {
        // Windows 경로는 백슬래시를 품는다. TOML 기본 문자열에서 `\U`·`\x` 같은 조합은
        // 이스케이프로 해석돼 파싱이 깨진다 — 리눅스 CI에서도 잡히도록 경로를 직접 만든다.
        let bin = PathBuf::from(r"C:\Users\Loadcomplete\AppData\Local\qf-mcp.exe");
        let root = PathBuf::from(r"D:\0_Client\quick-folder");

        let toml = config_snippet("codex-cli", &bin, &[root.clone()]).unwrap();
        let doc = toml
            .parse::<toml_edit::DocumentMut>()
            .expect("TOML 조각이 파싱돼야 한다");
        // 파싱만이 아니라 경로가 원래 값 그대로 돌아와야 한다
        assert_eq!(
            doc["mcp_servers"][SERVER_NAME]["command"].as_str(),
            Some(bin.display().to_string().as_str()),
        );
        assert_eq!(
            doc["mcp_servers"][SERVER_NAME]["env"][ROOTS_ENV].as_str(),
            Some(root.display().to_string().as_str()),
        );

        let json = config_snippet("claude-code", &bin, &[root.clone()]).unwrap();
        let parsed: serde_json::Value =
            serde_json::from_str(&json).expect("JSON 조각이 파싱돼야 한다");
        assert_eq!(
            parsed["mcpServers"][SERVER_NAME]["command"].as_str(),
            Some(bin.display().to_string().as_str()),
        );
    }
}
