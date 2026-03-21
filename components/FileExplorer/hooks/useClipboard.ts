import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ClipboardData } from '../../../types';
import { getFileName, getPathSeparator } from '../../../utils/pathUtils';

export interface UseClipboardConfig {
  selectedPaths: string[];
  currentPath: string | null;
  loadDirectory: (path: string) => Promise<void>;
  setSelectedPaths: React.Dispatch<React.SetStateAction<string[]>>;
  sharedClipboard?: ClipboardData | null;
  onClipboardChange?: (cb: ClipboardData | null) => void;
}

/**
 * 클립보드 복사/잘라내기/붙여넣기 + 중복 확인 다이얼로그를 관리하는 훅.
 * 분할 뷰에서는 sharedClipboard/onClipboardChange로 공유, 단일 뷰에서는 내부 상태 사용.
 */
export function useClipboard({
  selectedPaths,
  currentPath,
  loadDirectory,
  setSelectedPaths,
  sharedClipboard,
  onClipboardChange,
}: UseClipboardConfig) {
  // 분할 뷰: 공유 클립보드 사용, 단일 뷰: 내부 상태 사용
  const [internalClipboard, setInternalClipboard] = useState<ClipboardData | null>(null);
  const clipboard = sharedClipboard !== undefined ? sharedClipboard : internalClipboard;
  const setClipboard = onClipboardChange ?? setInternalClipboard;

  // 중복 파일 확인 다이얼로그 상태
  const [duplicateConfirm, setDuplicateConfirm] = useState<{
    duplicates: string[];
    paths: string[];
    action: 'copy' | 'cut';
  } | null>(null);

  // 붙여넣기 후 선택할 파일 경로를 저장하는 ref
  const pendingPasteSelectRef = useRef<string[]>([]);

  const handleCopy = useCallback(async () => {
    if (selectedPaths.length === 0) return;
    setClipboard({ paths: selectedPaths, action: 'copy' });
    // OS 클립보드에도 파일 경로 등록 (외부 앱에서 Ctrl+V 가능)
    try { await invoke('write_files_to_clipboard', { paths: selectedPaths }); } catch { /* 무시 */ }
  }, [selectedPaths, setClipboard]);

  const handleCut = useCallback(async () => {
    if (selectedPaths.length === 0) return;
    setClipboard({ paths: selectedPaths, action: 'cut' });
    // OS 클립보드에도 파일 경로 등록
    try { await invoke('write_files_to_clipboard', { paths: selectedPaths }); } catch { /* 무시 */ }
  }, [selectedPaths, setClipboard]);

  const executePaste = useCallback(async (paths: string[], action: 'copy' | 'cut', overwrite: boolean) => {
    if (!currentPath) return;
    try {
      if (action === 'copy') {
        await invoke('copy_items', { sources: paths, dest: currentPath, overwrite });
      } else {
        await invoke('move_items', { sources: paths, dest: currentPath, overwrite });
        setClipboard(null);
      }
      // 붙여넣기된 파일명으로 대상 경로 생성 (선택용)
      const sep = getPathSeparator(currentPath);
      const pastedPaths = paths.map(p => {
        return currentPath + sep + getFileName(p);
      });
      pendingPasteSelectRef.current = pastedPaths;
      loadDirectory(currentPath);
    } catch (e) {
      console.error('붙여넣기 실패:', e);
    }
  }, [currentPath, loadDirectory, setClipboard]);

  const handlePaste = useCallback(async () => {
    if (!currentPath) return;
    try {
      // 내부 클립보드 우선, 없으면 OS 클립보드에서 읽기
      let paths: string[];
      let action: 'copy' | 'cut';
      if (clipboard) {
        paths = clipboard.paths;
        action = clipboard.action;
      } else {
        const osPaths = await invoke<string[]>('read_files_from_clipboard');
        if (osPaths && osPaths.length > 0) {
          paths = osPaths;
          action = 'copy'; // 외부에서 복사한 파일은 항상 copy
        } else {
          // 파일 경로 없으면 이미지 데이터 붙여넣기 시도
          const savedPath = await invoke<string | null>('paste_image_from_clipboard', { destDir: currentPath });
          if (savedPath) {
            loadDirectory(currentPath);
            setSelectedPaths([savedPath]);
          }
          return;
        }
      }

      // 중복 파일 체크
      const duplicates = await invoke<string[]>('check_duplicate_items', { sources: paths, dest: currentPath });
      if (duplicates.length > 0) {
        setDuplicateConfirm({ duplicates, paths, action });
        return;
      }

      await executePaste(paths, action, false);
    } catch (e) {
      console.error('붙여넣기 실패:', e);
    }
  }, [clipboard, currentPath, loadDirectory, executePaste, setSelectedPaths]);

  return {
    clipboard,
    setClipboard,
    duplicateConfirm, setDuplicateConfirm,
    pendingPasteSelectRef,
    handleCopy, handleCut, handlePaste, executePaste,
  };
}
