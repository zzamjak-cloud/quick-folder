import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendAgentLines,
  formatAgentStdout,
  shortToolName,
} from '../components/FileExplorer/agentStreamFormat.ts';

test('MCP 도구 이름은 마지막 조각만 보여준다', () => {
  assert.equal(shortToolName('mcp__quickfolder__qf_image_batch'), 'qf_image_batch');
  assert.equal(shortToolName('Read'), 'Read');
});

// ===== Claude Code: stream-json =====

test('claude: assistant 메시지에서 본문과 도구 호출을 뽑는다', () => {
  const line = JSON.stringify({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: '  이미지를 찾아볼게요.  ' },
        { type: 'tool_use', name: 'mcp__quickfolder__qf_list_directory', input: {} },
      ],
    },
  });

  assert.deepEqual(formatAgentStdout(line, 'claude-code'), [
    { kind: 'text', text: '이미지를 찾아볼게요.' },
    { kind: 'tool', text: 'qf_list_directory' },
  ]);
});

test('claude: system·tool_result 줄은 화면에 올리지 않는다', () => {
  assert.deepEqual(formatAgentStdout(JSON.stringify({ type: 'system', subtype: 'init' }), 'claude-code'), []);
  assert.deepEqual(
    formatAgentStdout(
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: '...' }] } }),
      'claude-code',
    ),
    [],
  );
});

test('claude: subtype 이 success 라도 is_error 면 오류로 본다', () => {
  assert.deepEqual(
    formatAgentStdout(
      JSON.stringify({ type: 'result', subtype: 'success', result: '이상함', is_error: true }),
      'claude-code',
    ),
    [{ kind: 'error', text: '이상함' }],
  );
  assert.deepEqual(
    formatAgentStdout(
      JSON.stringify({ type: 'result', subtype: 'success', result: '3개 완료', is_error: false }),
      'claude-code',
    ),
    [{ kind: 'result', text: '3개 완료' }],
  );
});

// ===== Codex CLI: --json =====

test('codex: 도구 줄은 item.started 에서만 만든다 (중복 방지)', () => {
  const started = JSON.stringify({
    type: 'item.started',
    item: { id: 'item_1', type: 'mcp_tool_call', server: 'quickfolder', tool: 'qf_list_directory', status: 'in_progress' },
  });
  const completed = JSON.stringify({
    type: 'item.completed',
    item: { id: 'item_1', type: 'mcp_tool_call', tool: 'qf_list_directory', status: 'completed' },
  });

  assert.deepEqual(formatAgentStdout(started, 'codex-cli'), [{ kind: 'tool', text: 'qf_list_directory' }]);
  assert.deepEqual(formatAgentStdout(completed, 'codex-cli'), [], '완료 이벤트가 같은 줄을 또 찍으면 안 된다');
});

test('codex: agent_message 는 본문, 실패한 도구 호출은 오류', () => {
  assert.deepEqual(
    formatAgentStdout(
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: ' 목록입니다. ' } }),
      'codex-cli',
    ),
    [{ kind: 'text', text: '목록입니다.' }],
  );
  assert.deepEqual(
    formatAgentStdout(
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'mcp_tool_call', status: 'failed', error: { message: '허용 루트 밖의 경로입니다' } },
      }),
      'codex-cli',
    ),
    [{ kind: 'error', text: '허용 루트 밖의 경로입니다' }],
  );
});

test('codex: thread/turn 시작 이벤트는 버린다', () => {
  assert.deepEqual(formatAgentStdout(JSON.stringify({ type: 'thread.started', thread_id: 'x' }), 'codex-cli'), []);
  assert.deepEqual(formatAgentStdout(JSON.stringify({ type: 'turn.started' }), 'codex-cli'), []);
  assert.deepEqual(
    formatAgentStdout(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1 } }), 'codex-cli'),
    [],
  );
});

// ===== Gemini CLI: stream-json =====

test('gemini: 본문 delta 는 append 로 표시한다', () => {
  const line = JSON.stringify({ type: 'message', role: 'assistant', content: '안녕', delta: true });
  assert.deepEqual(formatAgentStdout(line, 'gemini-cli'), [{ kind: 'text', text: '안녕', append: true }]);
});

test('gemini: 사용자 메시지 에코는 되돌려 보여주지 않는다', () => {
  const line = JSON.stringify({ type: 'message', role: 'user', content: '정리해줘' });
  assert.deepEqual(formatAgentStdout(line, 'gemini-cli'), []);
});

test('gemini: tool_use 와 error 를 구분한다', () => {
  assert.deepEqual(
    formatAgentStdout(JSON.stringify({ type: 'tool_use', tool_name: 'quickfolder__qf_info', tool_id: 'x' }), 'gemini-cli'),
    [{ kind: 'tool', text: 'qf_info' }],
  );
  assert.deepEqual(
    formatAgentStdout(JSON.stringify({ type: 'error', severity: 'warning', message: 'Loop detected' }), 'gemini-cli'),
    [{ kind: 'error', text: 'Loop detected' }],
  );
  assert.deepEqual(formatAgentStdout(JSON.stringify({ type: 'init', model: 'x' }), 'gemini-cli'), []);
});

// ===== 공통 =====

test('JSON 이 아닌 줄은 삼키지 않고 그대로 보여준다', () => {
  // CLI 가 직접 찍는 경고가 여기 걸린다 — 삼키면 디버깅이 불가능해진다
  for (const agent of ['claude-code', 'codex-cli', 'gemini-cli'] as const) {
    assert.deepEqual(formatAgentStdout('npm warn deprecated something', agent), [
      { kind: 'text', text: 'npm warn deprecated something' },
    ]);
    assert.deepEqual(formatAgentStdout('   ', agent), []);
  }
});

test('appendAgentLines: delta 조각을 같은 종류의 마지막 줄에 이어 붙인다', () => {
  let lines = appendAgentLines([], [{ kind: 'text', text: '안녕', append: true }]);
  lines = appendAgentLines(lines, [{ kind: 'text', text: '하세요', append: true }]);
  assert.deepEqual(lines, [{ kind: 'text', text: '안녕하세요' }]);
});

test('appendAgentLines: 종류가 다르면 이어 붙이지 않는다', () => {
  const lines = appendAgentLines(
    [{ kind: 'tool', text: 'qf_info' }],
    [{ kind: 'text', text: '결과입니다', append: true }],
  );
  assert.deepEqual(lines, [
    { kind: 'tool', text: 'qf_info' },
    { kind: 'text', text: '결과입니다' },
  ]);
});

test('appendAgentLines: append 가 없으면 항상 새 줄', () => {
  const lines = appendAgentLines(
    [{ kind: 'text', text: '첫째' }],
    [{ kind: 'text', text: '둘째' }],
  );
  assert.deepEqual(lines, [
    { kind: 'text', text: '첫째' },
    { kind: 'text', text: '둘째' },
  ]);
});
