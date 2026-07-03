import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveSpaceDiffPaths,
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

test('macOS Backspace는 빈 hidden fuzzy input에서 탐색기 뒤로가기로 전달된다', () => {
  assert.equal(
    shouldForwardFuzzyFilterKeyToExplorer({
      key: 'Backspace',
      query: '',
      isMac: true,
    }),
    true,
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

test('IME 조합 중인 hidden fuzzy input 키는 탐색기 shortcut으로 전달하지 않는다', () => {
  assert.equal(
    shouldForwardFuzzyFilterKeyToExplorer({
      key: 'Delete',
      query: '',
      isMac: false,
      isComposing: true,
    }),
    false,
  );
  assert.equal(
    shouldForwardFuzzyFilterKeyToExplorer({
      key: 'Backspace',
      query: '',
      isMac: true,
      keyCode: 229,
    }),
    false,
  );
});

test('수정키 조합은 hidden fuzzy input에서 전역 shortcut으로 전달된다', () => {
  assert.equal(
    shouldForwardFuzzyFilterKeyToExplorer({
      key: 'f',
      query: 'abc',
      isMac: false,
      ctrlKey: true,
    }),
    true,
  );
  assert.equal(
    shouldForwardFuzzyFilterKeyToExplorer({
      key: 'k',
      query: 'abc',
      isMac: true,
      metaKey: true,
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

test('Windows Ctrl+Backspace는 hidden fuzzy input에서 탐색기 삭제 shortcut으로 전달되지 않는다', () => {
  assert.equal(
    shouldSuppressDeleteLikeExplorerShortcut({
      key: 'Backspace',
      isFuzzyFilterInput: true,
      isFiltering: false,
      isSearchActive: false,
      ctrlKey: true,
    }),
    true,
  );
});

test('macOS Cmd+Backspace는 hidden fuzzy input 포커스 중에도 탐색기 shortcut으로 전달된다', () => {
  assert.equal(
    shouldSuppressDeleteLikeExplorerShortcut({
      key: 'Backspace',
      isFuzzyFilterInput: true,
      isFiltering: false,
      isSearchActive: false,
      metaKey: true,
    }),
    false,
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

test('Space는 비교 가능한 파일 2개를 diff 경로로 해석한다', () => {
  const paths = resolveSpaceDiffPaths(
    ['left.md', 'right.md'],
    [
      { path: 'left.md', name: 'left.md', is_dir: false },
      { path: 'right.md', name: 'right.md', is_dir: false },
    ],
    name => name.endsWith('.md'),
  );

  assert.deepEqual(paths, ['left.md', 'right.md']);
});
