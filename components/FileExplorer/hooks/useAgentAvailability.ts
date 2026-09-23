import { useCallback, useEffect, useState } from 'react';
import { agentCommands, type AgentStatus } from '../../../utils/tauriCommandDomains/agentCommands';

/**
 * "AI Agent 요청하기" 메뉴를 띄울지 판단한다.
 *
 * 앱 실행 중 MCP 설정 모달에서 등록·해제가 일어나므로, 상태는 메뉴를 그릴 때마다가 아니라
 * 한 번 읽어 두고 `qf:mcp-changed` 이벤트로 갱신한다.
 */

/** MCP 설정이 바뀌었음을 알리는 앱 내부 이벤트 이름 */
export const MCP_CHANGED_EVENT = 'qf:mcp-changed';

/**
 * 경로가 허용 루트 안인지 어림잡는다.
 *
 * 메뉴를 보여 줄지 정하는 용도일 뿐이다. 실제 차단은 Rust 쪽에서 심볼릭 링크와 `..` 까지
 * 해소해 다시 검사한다 (`agent_launch::resolve_target_folder`).
 */
export function isUnderRoot(path: string, roots: string[]): boolean {
  if (roots.length === 0) return false;
  // Windows 는 대소문자를 구분하지 않고 구분자도 섞여 들어온다
  const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const target = normalize(path);
  return roots.some(root => {
    const base = normalize(root);
    return target === base || target.startsWith(`${base}/`);
  });
}

export interface AgentAvailability {
  /** 등록됐고 CLI 도 있는 에이전트가 하나라도 있는가 */
  hasUsableAgent: boolean;
  /** 이 폴더에 요청을 보낼 수 있는가 */
  canRequest: (path: string) => boolean;
}

export function useAgentAvailability(): AgentAvailability {
  const [agents, setAgents] = useState<AgentStatus[]>([]);

  const refresh = useCallback(() => {
    agentCommands
      .agentStatus()
      .then(setAgents)
      // 조회 실패는 메뉴를 감추는 것으로 충분하다 — 사용자에게 알릴 것이 없다
      .catch(() => setAgents([]));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(MCP_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(MCP_CHANGED_EVENT, refresh);
  }, [refresh]);

  const usable = agents.filter(agent => agent.registered && agent.cliAvailable);

  return {
    hasUsableAgent: usable.length > 0,
    canRequest: useCallback(
      (path: string) => usable.some(agent => isUnderRoot(path, agent.roots)),
      // usable 은 매 렌더 새 배열이지만 내용이 바뀌는 건 agents 가 바뀔 때뿐이다
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [agents],
    ),
  };
}
