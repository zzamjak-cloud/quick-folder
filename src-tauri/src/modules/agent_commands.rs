//! AI 에이전트 요청 command
//!
//! 폴더 우클릭 → "AI Agent 요청하기". 에이전트 CLI 를 자식 프로세스로 띄우고
//! stdout/stderr 를 줄 단위로 프론트엔드 Channel 에 흘린다.
//!
//! 인자 조립과 폴더 봉쇄는 전부 [`quickfolder_core::agent_launch`] 에 있다.
//! 여기서는 프로세스 수명(실행·스트리밍·취소)만 다룬다.
//!
//! **허용 폴더 판정 기준은 클라이언트 설정 파일이다.** 프론트엔드가 보낸 목록을
//! 믿지 않는다 — 실제로 등록된 `QF_MCP_ROOTS` 를 읽어서 검사한다. 등록을 해제하면
//! 그 순간부터 이 기능도 막힌다.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;

use quickfolder_core::agent_launch::{self, LAUNCHERS};
use quickfolder_core::error::{AppError, Result};
use quickfolder_core::mcp_setup::{self, RegistrationState};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// 실행 중인 요청들. 취소할 때 여기서 찾아 죽인다.
static RUNNING: Mutex<Option<HashMap<String, u32>>> = Mutex::new(None);

fn remember(request_id: &str, pid: u32) {
    let mut guard = RUNNING.lock().unwrap();
    guard.get_or_insert_with(HashMap::new).insert(request_id.to_string(), pid);
}

fn forget(request_id: &str) {
    if let Some(map) = RUNNING.lock().unwrap().as_mut() {
        map.remove(request_id);
    }
}

fn take_pid(request_id: &str) -> Option<u32> {
    RUNNING.lock().unwrap().as_mut()?.remove(request_id)
}

/// 드롭다운에 보여 줄 에이전트 상태
#[derive(serde::Serialize)]
pub struct AgentStatus {
    pub id: String,
    pub label: String,
    /// MCP 클라이언트로 등록돼 있는가 (경로 불일치도 등록으로 본다 — 실행에는 지장 없다)
    pub registered: bool,
    /// CLI 실행 파일을 PATH 에서 찾았는가
    pub cli_available: bool,
    /// 설정 파일에 실제로 등록된 허용 폴더. 메뉴 노출 판단에 쓴다.
    pub roots: Vec<String>,
    /// 에이전트 자신의 도구가 대상 폴더 안에 갇히는가.
    /// false 면 UI 가 경고와 추가 확인 단계를 띄운다.
    pub confines_to_folder: bool,
}

/// 스트리밍 이벤트 1건
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvent {
    /// `stdout` | `stderr` | `exit`
    pub kind: String,
    pub line: String,
    /// `exit` 일 때만 채워진다
    pub exit_code: Option<i32>,
}

impl AgentEvent {
    fn out(line: String) -> Self {
        Self { kind: "stdout".into(), line, exit_code: None }
    }
    fn err(line: String) -> Self {
        Self { kind: "stderr".into(), line, exit_code: None }
    }
    fn exit(code: Option<i32>) -> Self {
        Self { kind: "exit".into(), line: String::new(), exit_code: code }
    }
}

/// 클라이언트 설정 파일에 실제로 등록된 허용 루트
fn registered_roots(mcp_client_id: &str) -> Result<Vec<PathBuf>> {
    let server = mcp_setup::find_qf_mcp_path().unwrap_or_default();
    let status = mcp_setup::client_statuses(&server)
        .into_iter()
        .find(|c| c.id == mcp_client_id)
        .ok_or_else(|| AppError::NotFound(format!("MCP 클라이언트 없음: {}", mcp_client_id)))?;

    if status.state == RegistrationState::NotRegistered {
        return Err(AppError::InvalidInput(
            "MCP 연동이 등록돼 있지 않습니다. 설정 → AI 에이전트 연동(MCP)에서 먼저 등록해 주세요."
                .to_string(),
        ));
    }
    let roots = status.registered_roots.unwrap_or_default();
    Ok(std::env::split_paths(&roots)
        .filter(|p| !p.as_os_str().is_empty())
        .collect())
}

/// 실행 가능한 에이전트 목록과 각 상태
#[tauri::command]
pub async fn agent_status() -> Result<Vec<AgentStatus>> {
    let server = mcp_setup::find_qf_mcp_path().unwrap_or_default();
    let clients = mcp_setup::client_statuses(&server);

    Ok(LAUNCHERS
        .iter()
        .map(|launcher| AgentStatus {
            id: launcher.id.to_string(),
            label: launcher.label.to_string(),
            registered: clients
                .iter()
                .any(|c| c.id == launcher.mcp_client_id && c.state != RegistrationState::NotRegistered),
            cli_available: agent_launch::find_program(launcher.program).is_some(),
            confines_to_folder: launcher.confines_to_folder,
            roots: clients
                .iter()
                .find(|c| c.id == launcher.mcp_client_id)
                .and_then(|c| c.registered_roots.clone())
                .map(|roots| {
                    std::env::split_paths(&roots)
                        .filter(|p| !p.as_os_str().is_empty())
                        .map(|p| p.display().to_string())
                        .collect()
                })
                .unwrap_or_default(),
        })
        .collect())
}

/// 에이전트에게 요청을 보내고 출력을 스트리밍한다. 프로세스가 끝나야 반환된다.
#[tauri::command]
pub async fn agent_run(
    request_id: String,
    agent_id: String,
    folder: String,
    prompt: String,
    on_event: tauri::ipc::Channel<AgentEvent>,
) -> Result<i32> {
    let launcher = agent_launch::find_launcher(&agent_id)?;
    let roots = registered_roots(launcher.mcp_client_id)?;
    let server = mcp_setup::find_qf_mcp_path().ok_or_else(|| {
        AppError::NotFound("qf-mcp 실행 파일을 찾을 수 없습니다. 앱을 다시 설치해 주세요.".to_string())
    })?;

    let invocation =
        agent_launch::build_invocation(&agent_id, &folder, &prompt, &server, &roots, &request_id)?;

    // Gemini 처럼 설정을 파일로만 받는 CLI 가 있다. spawn 전에 쓰고 끝나면 지운다.
    for (path, contents) in &invocation.temp_files {
        std::fs::write(path, contents).map_err(|e| {
            AppError::Io(format!("에이전트 임시 설정 파일 쓰기 실패 {}: {}", path.display(), e))
        })?;
    }
    let temp_paths: Vec<PathBuf> = invocation.temp_files.iter().map(|(p, _)| p.clone()).collect();

    let mut command = Command::new(&invocation.program);
    command
        .args(&invocation.args)
        .current_dir(&invocation.cwd)
        .envs(invocation.env.iter().cloned())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    // 콘솔 창이 깜빡이지 않게 한다 (GUI 앱에서 CLI 를 띄우는 것이라 창이 뜰 이유가 없다)
    #[cfg(target_os = "windows")]
    {
        // tokio 의 Command 는 Windows 에서 creation_flags 를 직접 노출한다
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let child = command.spawn().map_err(|e| {
        // spawn 이 실패해도 임시 설정 파일은 남기지 않는다
        remove_temp_files(&temp_paths);
        AppError::ToolExecution {
            tool: launcher.label.to_string(),
            reason: format!("실행 실패: {}", e),
        }
    });
    let mut child = child?;

    if let Some(pid) = child.id() {
        remember(&request_id, pid);
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let out_channel = on_event.clone();
    let out_task = tokio::spawn(async move {
        if let Some(stdout) = stdout {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = out_channel.send(AgentEvent::out(line));
            }
        }
    });

    let err_channel = on_event.clone();
    let err_task = tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = err_channel.send(AgentEvent::err(line));
            }
        }
    });

    let status = child.wait().await;
    let _ = out_task.await;
    let _ = err_task.await;
    forget(&request_id);
    remove_temp_files(&temp_paths);

    let code = status
        .map_err(|e| AppError::ToolExecution {
            tool: launcher.label.to_string(),
            reason: format!("종료 상태 확인 실패: {}", e),
        })?
        .code()
        // 시그널로 죽었으면 종료 코드가 없다 — 취소가 여기로 온다
        .unwrap_or(-1);

    let _ = on_event.send(AgentEvent::exit(Some(code)));
    Ok(code)
}

/// 임시 설정 파일 정리. 지우지 못해도 실행 결과에는 영향이 없으므로 조용히 넘어간다.
fn remove_temp_files(paths: &[PathBuf]) {
    for path in paths {
        let _ = std::fs::remove_file(path);
    }
}

/// 실행 중인 요청을 중단한다.
#[tauri::command]
pub async fn agent_cancel(request_id: String) -> Result<()> {
    let Some(pid) = take_pid(&request_id) else {
        // 이미 끝난 요청을 취소해도 에러는 아니다
        return Ok(());
    };
    kill_process_tree(pid)
}

/// 자식만 죽이면 에이전트가 띄운 MCP 서버가 남는다. 프로세스 트리째 정리한다.
fn kill_process_tree(pid: u32) -> Result<()> {
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    #[cfg(not(target_os = "windows"))]
    let result = std::process::Command::new("kill")
        .args(["-TERM", &format!("-{}", pid)])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .or_else(|_| {
            // 프로세스 그룹이 없으면 자식 하나만이라도 정리한다
            std::process::Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .status()
        });

    result
        .map(|_| ())
        .map_err(|e| AppError::Internal(format!("요청 중단 실패: {}", e)))
}
