import test from 'node:test';
import assert from 'node:assert/strict';

import { computeSideBySideDiff, summarizeDiff } from '../utils/lineDiff';

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
