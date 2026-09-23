/**
 * 에이전트 stdout 을 사람이 읽을 줄로 바꾼다.
 *
 * Rust 쪽(`agent_commands.rs`)은 줄을 그대로 흘려보내기만 한다. 파싱을 여기 두면
 * CLI 가 형식을 바꿔도 프런트만 고치면 되고, 순수 함수라 테스트로 고정할 수 있다.
 *
 * 세 CLI 가 형식이 전부 다르다. 자세한 내용은 각 파서 주석 참고.
 */

import type { AgentId } from '../../utils/tauriCommandDomains/agentCommands';

export type AgentLineKind = 'text' | 'tool' | 'result' | 'error';

export interface AgentLine {
  kind: AgentLineKind;
  text: string;
  /**
   * 직전 줄에 이어 붙일 조각인가 (Gemini 는 본문을 delta 로 흘린다).
   * true 면 호출부가 새 줄을 만들지 않고 마지막 줄 뒤에 붙인다.
   */
  append?: boolean;
}

/** MCP 도구 이름(`mcp__quickfolder__qf_image_batch`)에서 보여 줄 부분만 뽑는다 */
export function shortToolName(name: string): string {
  const parts = name.split('__');
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Claude Code `--output-format stream-json`
 *
 * - `{"type":"system", ...}` — 세션 시작 등. 노이즈라 버린다.
 * - `{"type":"assistant","message":{"content":[{"type":"text"|"tool_use", ...}]}}`
 * - `{"type":"user","message":{"content":[{"type":"tool_result", ...}]}}` — 결과 에코. 버린다.
 * - `{"type":"result","subtype":"success"|..., "result":"...", "is_error":bool}` — 마지막 요약
 */
function formatClaude(record: Record<string, unknown>): AgentLine[] {
  if (record.type === 'assistant') {
    const message = record.message as { content?: unknown } | undefined;
    const content = Array.isArray(message?.content) ? message.content : [];
    const lines: AgentLine[] = [];
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const item = block as Record<string, unknown>;
      if (item.type === 'text' && typeof item.text === 'string' && item.text.trim()) {
        lines.push({ kind: 'text', text: item.text.trim() });
      } else if (item.type === 'tool_use' && typeof item.name === 'string') {
        lines.push({ kind: 'tool', text: shortToolName(item.name) });
      }
    }
    return lines;
  }

  if (record.type === 'result') {
    const failed = record.is_error === true || record.subtype !== 'success';
    const text =
      typeof record.result === 'string' && record.result.trim()
        ? record.result.trim()
        : String(record.subtype ?? '');
    return text ? [{ kind: failed ? 'error' : 'result', text }] : [];
  }

  return [];
}

/**
 * Codex CLI `--json`
 *
 * - `{"type":"thread.started"|"turn.started"}` — 버린다
 * - `{"type":"item.started","item":{"type":"mcp_tool_call","tool":"qf_..."}}` — 도구 호출 시작
 * - `{"type":"item.completed","item":{"type":"agent_message","text":"..."}}` — 본문
 * - `{"type":"item.completed","item":{"type":"mcp_tool_call","status":"failed","error":{"message":...}}}`
 * - `{"type":"turn.completed"|"turn.failed"}`
 *
 * 도구 줄은 `item.started` 에서만 만든다. `item.completed` 에서 또 만들면 두 번 찍힌다.
 */
function formatCodex(record: Record<string, unknown>): AgentLine[] {
  const item = record.item as Record<string, unknown> | undefined;
  if (!item) {
    if (record.type === 'turn.failed') {
      const error = record.error as { message?: unknown } | undefined;
      const message = typeof error?.message === 'string' ? error.message : 'turn failed';
      return [{ kind: 'error', text: message }];
    }
    return [];
  }

  if (record.type === 'item.started') {
    if (item.type === 'mcp_tool_call' && typeof item.tool === 'string') {
      return [{ kind: 'tool', text: item.tool }];
    }
    if (item.type === 'command_execution' && typeof item.command === 'string') {
      return [{ kind: 'tool', text: item.command }];
    }
    return [];
  }

  if (record.type === 'item.completed') {
    if (item.type === 'agent_message' && typeof item.text === 'string' && item.text.trim()) {
      return [{ kind: 'text', text: item.text.trim() }];
    }
    if (item.status === 'failed') {
      const error = item.error as { message?: unknown } | undefined;
      if (typeof error?.message === 'string') {
        return [{ kind: 'error', text: error.message }];
      }
    }
  }

  return [];
}

/**
 * Gemini CLI `--output-format stream-json`
 *
 * - `{"type":"init", ...}` — 버린다
 * - `{"type":"message","role":"user"|"assistant","content":"...","delta":true}`
 *   본문이 **조각(delta)으로 흘러온다.** 조각마다 새 줄을 만들면 한 글자씩 끊겨 보이므로
 *   `append` 를 달아 호출부가 이어 붙이게 한다.
 * - `{"type":"tool_use","tool_name":"...","tool_id":"...","parameters":{...}}`
 * - `{"type":"error","severity":"...","message":"..."}`
 * - `{"type":"result", ...}`
 */
function formatGemini(record: Record<string, unknown>): AgentLine[] {
  if (record.type === 'message') {
    // 사용자 메시지는 우리가 보낸 프롬프트 그대로라 되돌려 보여 줄 필요가 없다
    if (record.role !== 'assistant') return [];
    const content = typeof record.content === 'string' ? record.content : '';
    if (!content) return [];
    return [{ kind: 'text', text: content, append: record.delta === true }];
  }

  if (record.type === 'tool_use' && typeof record.tool_name === 'string') {
    return [{ kind: 'tool', text: shortToolName(record.tool_name) }];
  }

  if (record.type === 'error') {
    const message = typeof record.message === 'string' ? record.message : '';
    return message ? [{ kind: 'error', text: message }] : [];
  }

  return [];
}

/**
 * stdout 한 줄을 표시용 줄들로 바꾼다. 보여 줄 것이 없으면 빈 배열.
 *
 * JSON 이 아닌 줄(CLI 가 직접 찍는 경고 등)은 그대로 통과시킨다 — 삼키면 디버깅이 불가능해진다.
 */
export function formatAgentStdout(line: string, agentId: AgentId): AgentLine[] {
  const record = parseJsonLine(line);
  if (!record) {
    const trimmed = line.trim();
    return trimmed ? [{ kind: 'text', text: trimmed }] : [];
  }

  switch (agentId) {
    case 'claude-code':
      return formatClaude(record);
    case 'codex-cli':
      return formatCodex(record);
    case 'gemini-cli':
      return formatGemini(record);
    default:
      return [];
  }
}

/**
 * 새 줄들을 기존 목록에 합친다. `append` 조각은 마지막 줄 뒤에 이어 붙인다.
 *
 * 화면 갱신 로직과 이어 붙이기 규칙을 한곳에 두려고 여기 둔다 — 모달에서 직접
 * 하면 delta 처리가 렌더 코드에 섞인다.
 */
export function appendAgentLines(previous: AgentLine[], incoming: AgentLine[]): AgentLine[] {
  if (incoming.length === 0) return previous;
  const next = [...previous];

  for (const line of incoming) {
    const last = next[next.length - 1];
    if (line.append && last && last.kind === line.kind) {
      next[next.length - 1] = { ...last, text: last.text + line.text };
    } else {
      // append 조각인데 이어 붙일 줄이 없으면 새 줄로 시작한다
      next.push({ kind: line.kind, text: line.text });
    }
  }
  return next;
}
