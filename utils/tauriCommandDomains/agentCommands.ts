import { Channel } from '@tauri-apps/api/core';
import { runDirectCommand } from '../tauriCommandRunner.ts';

/** 앱이 띄울 수 있는 에이전트 식별자 */
export type AgentId = 'claude-code' | 'codex-cli' | 'gemini-cli';

export interface AgentStatus {
  id: AgentId;
  label: string;
  /** MCP 클라이언트로 등록돼 있는가 */
  registered: boolean;
  /** CLI 실행 파일을 PATH 에서 찾았는가 */
  cliAvailable: boolean;
  /** 설정 파일에 실제로 등록된 허용 폴더 */
  roots: string[];
  /**
   * 이 에이전트 자신의 도구가 대상 폴더 안에 갇히는가.
   * false 면 봉쇄가 보장되지 않아 모달이 경고와 추가 확인을 띄운다.
   */
  confinesToFolder: boolean;
}

/** 에이전트 프로세스가 내보내는 줄 단위 이벤트 */
export interface AgentEvent {
  kind: 'stdout' | 'stderr' | 'exit';
  line: string;
  exitCode: number | null;
}

// Rust는 snake_case로 직렬화하므로 경계에서 camelCase로 바꾼다
interface RawAgentStatus {
  id: AgentId;
  label: string;
  registered: boolean;
  cli_available: boolean;
  roots: string[];
  confines_to_folder: boolean;
}

export const agentCommands = {
  /** 드롭다운에 채울 에이전트 목록과 각 상태 */
  async agentStatus(): Promise<AgentStatus[]> {
    const raw = await runDirectCommand<RawAgentStatus[]>('agent_status');
    return raw.map(item => ({
      id: item.id,
      label: item.label,
      registered: item.registered,
      cliAvailable: item.cli_available,
      roots: item.roots,
      confinesToFolder: item.confines_to_folder,
    }));
  },

  /**
   * 요청을 보내고 출력을 스트리밍한다. 프로세스가 끝나야 resolve 되고 종료 코드를 돌려준다.
   * `requestId`는 취소할 때 같은 값을 넘겨야 한다.
   */
  agentRun(
    requestId: string,
    agentId: AgentId,
    folder: string,
    prompt: string,
    onEvent: (event: AgentEvent) => void,
  ): Promise<number> {
    const channel = new Channel<AgentEvent>();
    channel.onmessage = onEvent;
    return runDirectCommand<number>('agent_run', {
      requestId,
      agentId,
      folder,
      prompt,
      onEvent: channel,
    });
  },

  /** 실행 중인 요청 중단. 이미 끝난 요청이어도 에러가 아니다. */
  agentCancel(requestId: string): Promise<void> {
    return runDirectCommand<void>('agent_cancel', { requestId });
  },
};
