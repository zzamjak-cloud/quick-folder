import { useState, useCallback, useRef } from 'react';
import { Layer } from '../types';

const MAX_HISTORY = 50;

export function useHistory(restoreLayers: (s: Layer[]) => void, getSnapshot: () => Layer[]) {
  const undoStack = useRef<Layer[][]>([]);
  const redoStack = useRef<Layer[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // 변경 전에 호출 — 현재 상태를 undo 스택에 저장
  const pushSnapshot = useCallback(() => {
    const snapshot = getSnapshot();
    undoStack.current.push(snapshot);
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [getSnapshot]);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const current = getSnapshot();
    redoStack.current.push(current);
    const prev = undoStack.current.pop()!;
    restoreLayers(prev);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  }, [getSnapshot, restoreLayers]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const current = getSnapshot();
    undoStack.current.push(current);
    const next = redoStack.current.pop()!;
    restoreLayers(next);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  }, [getSnapshot, restoreLayers]);

  return { pushSnapshot, undo, redo, canUndo, canRedo };
}
