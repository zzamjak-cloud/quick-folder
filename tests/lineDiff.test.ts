import test from 'node:test';
import assert from 'node:assert/strict';

import { computeSideBySideDiff, summarizeDiff } from '../utils/lineDiff.ts';

test('동일 텍스트는 equal 행만 반환한다', () => {
  const rows = computeSideBySideDiff('a\nb\nc', 'a\nb\nc');
  assert.equal(rows.length, 3);
  assert.ok(rows.every(r => r.kind === 'equal'));
});

test('추가·삭제·변경 줄을 구분한다', () => {
  const left = 'keep\nold\nremove';
  const right = 'keep\nnew\nadd';
  const rows = computeSideBySideDiff(left, right);

  assert.equal(rows[0].kind, 'equal');
  assert.equal(rows[0].left?.text, 'keep');
  assert.ok(rows.some(r => r.kind === 'change' && r.left?.text === 'old' && r.right?.text === 'new'));

  const summary = summarizeDiff(rows);
  assert.ok(summary.changed >= 1);
  assert.ok(summary.changed + summary.added + summary.removed >= 2);
});

test('마크다운 목록 기호 차이는 anchor를 깨뜨리지 않는다', () => {
  const left = '# 목록\n\n* 첫 번째\n* 기존 설명\n* 세 번째\n\n다음 문단';
  const right = '# 목록\n\n- 첫 번째\n- 바뀐 설명\n- 세 번째\n\n다음 문단';

  const rows = computeSideBySideDiff(left, right, { mode: 'markdown' });
  const changedRows = rows.filter(r => r.kind !== 'equal');

  assert.equal(changedRows.length, 1);
  assert.equal(changedRows[0].kind, 'change');
  assert.equal(changedRows[0].left?.text, '- 기존 설명');
  assert.equal(changedRows[0].right?.text, '- 바뀐 설명');
});

test('마크다운 formatter 차이는 같은 표시 텍스트로 비교한다', () => {
  const left = '## 1. 제목\n\n1. 첫 번째\n2. 두 번째\n   - 하위 항목\n\n- 완료';
  const right = '## 1\\. 제목\n\n1.  첫 번째\n    \n2.  두 번째\n    \n    *   하위 항목\n        \n\n*   완료\n    ';

  const rows = computeSideBySideDiff(left, right, { mode: 'markdown' });

  assert.ok(rows.every(r => r.kind === 'equal'));
  assert.deepEqual(rows.map(r => r.left?.text), [
    '## 1. 제목',
    '1. 첫 번째',
    '2. 두 번째',
    '- 하위 항목',
    '- 완료',
  ]);
  assert.deepEqual(rows.map(r => r.right?.text), [
    '## 1. 제목',
    '1. 첫 번째',
    '2. 두 번째',
    '- 하위 항목',
    '- 완료',
  ]);
});

test('마크다운 fenced code block 내부 목록 기호는 exact 비교한다', () => {
  const left = '~~~\n```\n* literal\n~~~';
  const right = '~~~\n```\n- literal\n~~~';

  const rows = computeSideBySideDiff(left, right, { mode: 'markdown' });

  assert.ok(rows.some(r => (
    r.kind === 'change'
    && r.left?.text === '* literal'
    && r.right?.text === '- literal'
  )));
});
