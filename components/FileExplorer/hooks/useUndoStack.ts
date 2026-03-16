import { useState, useCallback, useRef } from 'react';
import { UndoAction } from '../../../types';

const MAX_UNDO = 10;

export function useUndoStack() {
  // ref로 관리하여 deps 변경 없이 최신 스택 접근
  const stackRef = useRef<UndoAction[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const push = useCallback((action: UndoAction) => {
    const next = [...stackRef.current.slice(-(MAX_UNDO - 1)), action];
    stackRef.current = next;
    setCanUndo(true);
  }, []);

  const pop = useCallback((): UndoAction | undefined => {
    const stack = stackRef.current;
    if (stack.length === 0) return undefined;
    const action = stack[stack.length - 1];
    stackRef.current = stack.slice(0, -1);
    setCanUndo(stackRef.current.length > 0);
    return action;
  }, []);

  return { push, pop, canUndo };
}
