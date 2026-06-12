import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldOpenArchiveInCurrentPane } from '../utils/pathUtils';

test('중첩 압축 파일은 현재 압축 pane 안에서 열린다', () => {
  assert.equal(
    shouldOpenArchiveInCurrentPane('C:\\Work\\outer.zip\\', 'C:\\Work\\outer.zip\\inner.7z'),
    true,
  );
});

test('일반 폴더의 압축 파일은 별도 압축 pane 대상으로 열린다', () => {
  assert.equal(
    shouldOpenArchiveInCurrentPane('C:\\Work', 'C:\\Work\\outer.zip'),
    false,
  );
});
