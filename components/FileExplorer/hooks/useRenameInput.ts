import React, { useState, useEffect, useRef, useCallback } from 'react';

interface UseRenameInputOptions {
  name: string;
  isDir: boolean;
  isRenaming: boolean;
  onRenameCommit: (oldPath: string, newName: string) => void;
  path: string;
  /** true이면 확장자 앞까지만 선택 (FileCard 전용) */
  selectBeforeExtension?: boolean;
}

export function useRenameInput({
  name,
  isDir,
  isRenaming,
  onRenameCommit,
  path,
  selectBeforeExtension = false,
}: UseRenameInputOptions) {
  const [renameValue, setRenameValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // 이름 변경 시 입력 초기화
  useEffect(() => {
    setRenameValue(name);
  }, [name]);

  // 이름 변경 모드 진입 시 포커스
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      if (selectBeforeExtension) {
        inputRef.current.focus();
        const dotIdx = name.lastIndexOf('.');
        if (dotIdx > 0 && !isDir) {
          inputRef.current.setSelectionRange(0, dotIdx);
        } else {
          inputRef.current.select();
        }
      } else {
        inputRef.current.select();
      }
    }
  }, [isRenaming, name, isDir, selectBeforeExtension]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onRenameCommit(path, renameValue);
    } else if (e.key === 'Escape') {
      onRenameCommit(path, name);
    }
  }, [path, name, renameValue, onRenameCommit]);

  const handleBlur = useCallback(() => {
    onRenameCommit(path, renameValue);
  }, [path, renameValue, onRenameCommit]);

  return {
    renameValue,
    setRenameValue,
    inputRef,
    handleKeyDown,
    handleBlur,
  };
}
