import { runDirectCommand } from '../tauriCommandRunner.ts';

/** 지원 클라이언트 식별자 */
export type McpClientId =
  | 'claude-code'
  | 'claude-desktop'
  | 'cursor'
  | 'gemini-cli'
  | 'codex-cli';

/** 등록 상태 — outdated는 등록돼 있으나 실행 경로가 현재 앱과 다른 경우 */
export type McpRegistrationState = 'not_registered' | 'registered' | 'outdated';

export interface McpClientStatus {
  id: McpClientId;
  label: string;
  format: 'json' | 'toml';
  configPath: string;
  configExists: boolean;
  state: McpRegistrationState;
  registeredCommand: string | null;
  registeredRoots: string | null;
}

export interface McpSetupStatus {
  /** 번들된 qf-mcp 경로. null이면 등록할 수 없다. */
  serverPath: string | null;
  clients: McpClientStatus[];
}

export interface McpWriteOutcome {
  configPath: string;
  /** 변경 직전 상태를 담은 백업 파일 (기존 설정이 있었을 때만) */
  backupPath: string | null;
}

// Rust는 snake_case로 직렬화하므로 경계에서 camelCase로 바꾼다
interface RawClientStatus {
  id: McpClientId;
  label: string;
  format: 'json' | 'toml';
  config_path: string;
  config_exists: boolean;
  state: McpRegistrationState;
  registered_command: string | null;
  registered_roots: string | null;
}

interface RawSetupStatus {
  server_path: string | null;
  clients: RawClientStatus[];
}

interface RawWriteOutcome {
  config_path: string;
  backup_path: string | null;
}

function toClientStatus(raw: RawClientStatus): McpClientStatus {
  return {
    id: raw.id,
    label: raw.label,
    format: raw.format,
    configPath: raw.config_path,
    configExists: raw.config_exists,
    state: raw.state,
    registeredCommand: raw.registered_command,
    registeredRoots: raw.registered_roots,
  };
}

function toWriteOutcome(raw: RawWriteOutcome): McpWriteOutcome {
  return { configPath: raw.config_path, backupPath: raw.backup_path };
}

export const mcpCommands = {
  async mcpSetupStatus(): Promise<McpSetupStatus> {
    const raw = await runDirectCommand<RawSetupStatus>('mcp_setup_status');
    return {
      serverPath: raw.server_path,
      clients: raw.clients.map(toClientStatus),
    };
  },
  async mcpRegister(clientId: McpClientId, roots: string[]): Promise<McpWriteOutcome> {
    const raw = await runDirectCommand<RawWriteOutcome>('mcp_register', { clientId, roots });
    return toWriteOutcome(raw);
  },
  async mcpUnregister(clientId: McpClientId): Promise<McpWriteOutcome> {
    const raw = await runDirectCommand<RawWriteOutcome>('mcp_unregister', { clientId });
    return toWriteOutcome(raw);
  },
  mcpConfigSnippet(clientId: McpClientId, roots: string[]) {
    return runDirectCommand<string>('mcp_config_snippet', { clientId, roots });
  },
};
