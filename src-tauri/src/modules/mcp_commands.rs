//! MCP 등록 command
//!
//! 실제 로직은 `quickfolder_core::mcp_setup`에 있다. 여기서는 프론트엔드가 주는
//! 문자열 경로를 검증해 넘기기만 한다.

use std::path::PathBuf;

use quickfolder_core::error::{AppError, Result};
use quickfolder_core::mcp_setup::{self, ClientStatus, WriteOutcome};

#[derive(serde::Serialize)]
pub struct McpSetupStatus {
    /// 번들된 qf-mcp 경로. 없으면 등록 자체가 불가능하다.
    pub server_path: Option<String>,
    pub clients: Vec<ClientStatus>,
}

/// 등록 화면에 필요한 상태 일괄 조회
#[tauri::command]
pub async fn mcp_setup_status() -> Result<McpSetupStatus> {
    let server_path = mcp_setup::find_qf_mcp_path();
    let clients = match &server_path {
        Some(path) => mcp_setup::client_statuses(path),
        // 서버 바이너리가 없으면 "일치 여부"를 판정할 기준이 없다.
        // 존재하지 않는 경로를 기준으로 두면 등록된 항목이 전부 불일치로 보이므로 빈 경로를 쓴다.
        None => mcp_setup::client_statuses(std::path::Path::new("")),
    };
    Ok(McpSetupStatus {
        server_path: server_path.map(|p| p.display().to_string()),
        clients,
    })
}

fn resolve_roots(roots: Vec<String>) -> Result<Vec<PathBuf>> {
    let resolved: Vec<PathBuf> = roots.into_iter().map(PathBuf::from).collect();
    for root in &resolved {
        if !root.is_dir() {
            return Err(AppError::InvalidInput(format!(
                "폴더가 아닙니다: {}",
                root.display()
            )));
        }
    }
    Ok(resolved)
}

fn server_path() -> Result<PathBuf> {
    mcp_setup::find_qf_mcp_path().ok_or_else(|| {
        AppError::NotFound("qf-mcp 실행 파일을 찾을 수 없습니다. 앱을 다시 설치해 주세요.".to_string())
    })
}

#[tauri::command]
pub async fn mcp_register(client_id: String, roots: Vec<String>) -> Result<WriteOutcome> {
    let roots = resolve_roots(roots)?;
    let command = server_path()?;
    tokio::task::spawn_blocking(move || mcp_setup::register(&client_id, &command, &roots))
        .await
        .map_err(|e| AppError::Internal(format!("MCP 등록 작업 실패: {}", e)))?
}

#[tauri::command]
pub async fn mcp_unregister(client_id: String) -> Result<WriteOutcome> {
    tokio::task::spawn_blocking(move || mcp_setup::unregister(&client_id))
        .await
        .map_err(|e| AppError::Internal(format!("MCP 해제 작업 실패: {}", e)))?
}

/// 수동 등록용 설정 조각 (파일 쓰기가 막혔을 때 클립보드로 넘긴다)
#[tauri::command]
pub async fn mcp_config_snippet(client_id: String, roots: Vec<String>) -> Result<String> {
    let roots = resolve_roots(roots)?;
    let command = server_path()?;
    mcp_setup::config_snippet(&client_id, &command, &roots)
}
