import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FileEntry } from '../../../types';

interface UseExplorerSelectionOptions {
  isFocused: boolean;
  splitMode?: 'single' | 'horizontal' | 'vertical';
  displayEntries: FileEntry[];
  selectedPaths: string[];
  setSelectedPaths: Dispatch<SetStateAction<string[]>>;
  focusedIndex: number;
  setFocusedIndex: Dispatch<SetStateAction<number>>;
}

export function useExplorerSelection({
  isFocused,
  splitMode,
  displayEntries,
  selectedPaths,
  setSelectedPaths,
  focusedIndex,
  setFocusedIndex,
}: UseExplorerSelectionOptions) {
  const selectionAnchorRef = useRef<number>(-1);
  const displayPathSet = useMemo(() => new Set(displayEntries.map(entry => entry.path)), [displayEntries]);

  useEffect(() => {
    if (!isFocused && splitMode !== 'single') {
      setSelectedPaths([]);
      setFocusedIndex(-1);
    }
  }, [isFocused, splitMode, setFocusedIndex, setSelectedPaths]);

  useEffect(() => {
    const nextSelectedPaths = selectedPaths.filter(path => displayPathSet.has(path));
    if (nextSelectedPaths.length !== selectedPaths.length) {
      setSelectedPaths(nextSelectedPaths);
    }

    const nextFocusedIndex = nextSelectedPaths.length > 0
      ? displayEntries.findIndex(entry => entry.path === nextSelectedPaths[nextSelectedPaths.length - 1])
      : -1;

    if (focusedIndex !== nextFocusedIndex) {
      setFocusedIndex(nextFocusedIndex);
    }
    selectionAnchorRef.current = -1;
  }, [displayEntries, displayPathSet]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectEntry = useCallback((path: string, multi: boolean, range: boolean) => {
    const clickedIndex = displayEntries.findIndex(entry => entry.path === path);
    if (clickedIndex >= 0) setFocusedIndex(clickedIndex);

    if (multi) {
      setSelectedPaths(prev =>
        prev.includes(path) ? prev.filter(selectedPath => selectedPath !== path) : [...prev, path]
      );
    } else if (range) {
      const paths = displayEntries.map(entry => entry.path);
      const lastSelected = selectedPaths[selectedPaths.length - 1];
      const lastIndex = paths.indexOf(lastSelected);
      const currentIndex = paths.indexOf(path);
      if (lastIndex === -1 || currentIndex === -1) {
        setSelectedPaths([path]);
      } else {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        setSelectedPaths(paths.slice(start, end + 1));
      }
    } else {
      setSelectedPaths([path]);
    }
  }, [displayEntries, selectedPaths, setFocusedIndex, setSelectedPaths]);

  const selectAll = useCallback(() => {
    setSelectedPaths(displayEntries.map(entry => entry.path));
  }, [displayEntries, setSelectedPaths]);

  const deselectAll = useCallback(() => {
    setSelectedPaths([]);
    setFocusedIndex(-1);
  }, [setFocusedIndex, setSelectedPaths]);

  const handleSelectPaths = useCallback((paths: string[]) => {
    const nextPaths = paths.filter(path => displayPathSet.has(path));
    setSelectedPaths(nextPaths);
    setFocusedIndex(nextPaths.length > 0
      ? displayEntries.findIndex(entry => entry.path === nextPaths[nextPaths.length - 1])
      : -1);
  }, [displayEntries, displayPathSet, setFocusedIndex, setSelectedPaths]);

  return {
    selectionAnchorRef,
    selectEntry,
    selectAll,
    deselectAll,
    handleSelectPaths,
  };
}
