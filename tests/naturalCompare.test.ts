import test from 'node:test';
import assert from 'node:assert/strict';

import { naturalCompare } from '../utils/naturalCompare.ts';

test('파일명 숫자 청크를 자연 정렬한다', () => {
  const names = ['file111.txt', 'file011.txt', 'file9.txt', 'file11.txt'];

  assert.deepEqual(
    [...names].sort(naturalCompare),
    ['file9.txt', 'file11.txt', 'file011.txt', 'file111.txt'],
  );
});

test('숫자가 아닌 문자열은 locale 비교를 유지한다', () => {
  assert.equal(Math.sign(naturalCompare('alpha.txt', 'beta.txt')), -1);
});
