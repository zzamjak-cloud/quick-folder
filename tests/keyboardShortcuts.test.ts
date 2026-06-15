import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldForwardFuzzyFilterKeyToExplorer,
  shouldSuppressDeleteLikeExplorerShortcut,
} from '../utils/keyboardShortcuts.ts';

test('Windows Delete는 hidden fuzzy input에서 탐색기 삭제 shortcut으로 전달된다', () => {
  assert.equal(
    shouldForwardFuzzyFilterKeyToExplorer({
      key: 'Delete',
      query: '',
      isMac: false,
    }),
    true,
  );
});

test('Windows Backspace는 hidden fuzzy input에서 탐색기로 전달되지 않는다', () => {
  assert.equal(
    shouldForwardFuzzyFilterKeyToExplorer({
      key: 'Backspace',
      query: '',
      isMac: false,
    }),
    false,
  );
});

test('Space는 검색어가 있어도 hidden fuzzy input에서 미리보기 shortcut으로 전달된다', () => {
  assert.equal(
    shouldForwardFuzzyFilterKeyToExplorer({
      key: ' ',
      query: 'abc',
      isMac: false,
    }),
    true,
  );
});

test('inline fuzzy filter 중 Delete는 탐색기 삭제 shortcut에서 차단하지 않는다', () => {
  assert.equal(
    shouldSuppressDeleteLikeExplorerShortcut({
      key: 'Delete',
      isFuzzyFilterInput: true,
      isFiltering: true,
      isSearchActive: false,
    }),
    false,
  );
});

test('inline fuzzy filter 중 Backspace는 탐색기 뒤로가기와 삭제로 해석하지 않는다', () => {
  assert.equal(
    shouldSuppressDeleteLikeExplorerShortcut({
      key: 'Backspace',
      isFuzzyFilterInput: true,
      isFiltering: true,
      isSearchActive: false,
    }),
    true,
  );
});

test('명시적 검색 모드에서는 Delete도 파일 삭제로 해석하지 않는다', () => {
  assert.equal(
    shouldSuppressDeleteLikeExplorerShortcut({
      key: 'Delete',
      isFuzzyFilterInput: false,
      isFiltering: false,
      isSearchActive: true,
    }),
    true,
  );
});
