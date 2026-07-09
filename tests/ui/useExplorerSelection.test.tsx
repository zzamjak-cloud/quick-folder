import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useState } from 'react';
import type { FileEntry } from '../../types';
import { useExplorerSelection } from '../../components/FileExplorer/hooks/useExplorerSelection';

function entry(path: string, name = path): FileEntry {
  return {
    path,
    name,
    is_dir: false,
    size: 0,
    modified: 0,
    file_type: 'other',
  };
}

function useSelectionHarness(displayEntries: FileEntry[], initialSelectedPaths: string[] = []) {
  const [selectedPaths, setSelectedPaths] = useState(initialSelectedPaths);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const selection = useExplorerSelection({
    isFocused: true,
    splitMode: 'single',
    displayEntries,
    selectedPaths,
    setSelectedPaths,
    focusedIndex,
    setFocusedIndex,
  });

  return {
    ...selection,
    selectedPaths,
    focusedIndex,
    applyKeyboardSelection(paths: string[], focusIndex: number) {
      setSelectedPaths(paths);
      setFocusedIndex(focusIndex);
    },
  };
}

function applyShiftArrowRange(
  current: ReturnType<typeof useSelectionHarness>,
  entries: FileEntry[],
  currentIndex: number,
  nextIndex: number,
) {
  if (current.selectionAnchorRef.current < 0) current.selectionAnchorRef.current = currentIndex;
  const from = Math.min(current.selectionAnchorRef.current, nextIndex);
  const to = Math.max(current.selectionAnchorRef.current, nextIndex);
  current.applyKeyboardSelection(entries.slice(from, to + 1).map(entry => entry.path), nextIndex);
}

describe('useExplorerSelection', () => {
  test('단일 선택 시 선택 경로와 포커스 인덱스를 동기화한다', () => {
    const entries = [entry('/a'), entry('/b'), entry('/c')];
    const { result } = renderHook(() => useSelectionHarness(entries));

    act(() => {
      result.current.selectEntry('/b', false, false);
    });

    expect(result.current.selectedPaths).toEqual(['/b']);
    expect(result.current.focusedIndex).toBe(1);
  });

  test('range 선택은 마지막 선택 항목부터 현재 항목까지 확장한다', () => {
    const entries = [entry('/a'), entry('/b'), entry('/c'), entry('/d')];
    const { result } = renderHook(() => useSelectionHarness(entries));

    act(() => {
      result.current.selectEntry('/b', false, false);
    });
    act(() => {
      result.current.selectEntry('/d', false, true);
    });

    expect(result.current.selectedPaths).toEqual(['/b', '/c', '/d']);
    expect(result.current.focusedIndex).toBe(3);
  });

  test('필터로 사라진 선택 경로는 선택과 포커스에서 제거한다', async () => {
    const initialEntries = [entry('/a'), entry('/b')];
    const filteredEntries = [entry('/a')];
    const { result, rerender } = renderHook(
      ({ displayEntries }) => useSelectionHarness(displayEntries, ['/b']),
      { initialProps: { displayEntries: initialEntries } },
    );

    expect(result.current.selectedPaths).toEqual(['/b']);

    rerender({ displayEntries: filteredEntries });

    await waitFor(() => {
      expect(result.current.selectedPaths).toEqual([]);
      expect(result.current.focusedIndex).toBe(-1);
    });
  });

  test('Shift+Arrow 반복 입력은 첫 anchor부터 선택 범위를 확장한다', async () => {
    const entries = [entry('/a'), entry('/b'), entry('/c'), entry('/d')];
    const { result } = renderHook(() => useSelectionHarness(entries));

    act(() => {
      result.current.selectEntry('/b', false, false);
    });

    act(() => {
      applyShiftArrowRange(result.current, entries, 1, 2);
    });

    await waitFor(() => {
      expect(result.current.selectedPaths).toEqual(['/b', '/c']);
      expect(result.current.focusedIndex).toBe(2);
    });

    act(() => {
      applyShiftArrowRange(result.current, entries, 2, 3);
    });

    expect(result.current.selectedPaths).toEqual(['/b', '/c', '/d']);
    expect(result.current.focusedIndex).toBe(3);
  });
});
