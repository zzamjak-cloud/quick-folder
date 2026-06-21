import test from 'node:test';
import assert from 'node:assert/strict';

import { getFolderSizeChildNavigationTarget, shouldOpenArchiveInCurrentPane } from '../utils/pathUtils.ts';

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

test('폴더 용량 분석의 폴더 항목은 해당 폴더로 이동한다', () => {
  assert.deepEqual(
    getFolderSizeChildNavigationTarget({
      path: 'C:\\Work\\Cache',
      isDir: true,
    }),
    {
      navigatePath: 'C:\\Work\\Cache',
      selectPath: null,
    },
  );
});

test('폴더 용량 분석의 파일 항목은 부모 폴더로 이동하고 파일을 선택한다', () => {
  assert.deepEqual(
    getFolderSizeChildNavigationTarget({
      path: 'C:\\Work\\Cache\\dump.bin',
      isDir: false,
    }),
    {
      navigatePath: 'C:\\Work\\Cache',
      selectPath: 'C:\\Work\\Cache\\dump.bin',
    },
  );
});
