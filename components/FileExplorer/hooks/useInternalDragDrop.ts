import React, { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getFileName, sameVolume } from '../../../utils/pathUtils';

const TRAY_STAGE_WIDTH = 96;
const TRAY_EDGE_COMMIT_MARGIN = 4;

/** 드롭 중복 발생 시 상위(FileExplorer)로 전달되는 정보 — 덮어쓰기 확인 후 재시도 */
export interface PendingDrop {
  sources: string[];
  dest: string;
  action: 'copy' | 'move';
  duplicates: string[];
}

interface UseInternalDragDropOptions {
  selectedPaths: string[];
  currentPath: string;
  onMoveComplete: () => void;
  onAddToCategory?: (categoryId: string, path: string, name: string) => void;
  onStageFilesToTray?: (paths: string[]) => void;
  /** 중복 파일 감지 시 호출 — 사용자 확인 후 executeDrop로 재시도 */
  onDuplicateDetected?: (info: PendingDrop) => void;
}

// 드롭 대상 패널의 시각적 피드백 해제
function clearPaneHighlight() {
  document.querySelectorAll('[data-pane-drop-target]').forEach(p => {
    const el = p as HTMLElement;
    el.style.outline = '';
    el.style.outlineOffset = '';
  });
}

// 사이드바 카테고리 하이라이트 해제
function clearCategoryHighlight() {
  document.querySelectorAll('[data-category-id]').forEach(el => {
    (el as HTMLElement).style.outline = '';
    (el as HTMLElement).style.outlineOffset = '';
  });
}

function getSourceElement(path: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-file-path]'))) {
    if (el.getAttribute('data-file-path') === path) return el;
  }
  return null;
}

/**
 * 파일 드래그 → 폴더/패널 이동 또는 임시 트레이 등록 훅
 *
 * 내부 드래그: 폴더 카드 또는 다른 패널 위에 드롭 → move_items
 * 트레이 드래그: 우측 내부 레일에 드롭하거나 우측 경계까지 밀면 임시 트레이 등록
 *
 * 리스너를 handleMouseDown에서 동기적으로 등록하여
 * useEffect 재실행 의존 문제를 회피.
 */
export function useInternalDragDrop({ selectedPaths, currentPath, onMoveComplete, onAddToCategory, onStageFilesToTray, onDuplicateDetected }: UseInternalDragDropOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [isTrayTargetActive, setIsTrayTargetActive] = useState(false);
  const [activeDragPaths, setActiveDragPaths] = useState<string[]>([]);
  const ghostRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent, entryPath: string) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const paths = selectedPaths.includes(entryPath) && selectedPaths.length > 1
      ? selectedPaths
      : [entryPath];

    let dragging = false;
    let localDropTarget: string | null = null;
    let localCategoryTarget: string | null = null;
    let localTrayTarget = false;
    let stagedToTray = false;

    // --- 드래그 고스트 ---
    function createGhost(x: number, y: number) {
      const ghost = document.createElement('div');
      ghost.id = 'qf-drag-ghost';
      ghost.style.cssText = `
        position: fixed; pointer-events: none; z-index: 99999;
        left: ${x + 14}px; top: ${y + 14}px;
        width: 80px; height: 80px;
        opacity: 0.92;
      `;

      const sourceCard = getSourceElement(paths[0]);
      const iconImg = sourceCard?.querySelector('img');
      if (iconImg) {
        const iconClone = document.createElement('img');
        iconClone.src = iconImg.src;
        iconClone.style.cssText = 'width: 80px; height: 80px; object-fit: cover; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);';
        ghost.appendChild(iconClone);
      } else {
        const fallback = document.createElement('div');
        fallback.textContent = getFileName(paths[0]).slice(0, 1).toUpperCase();
        fallback.style.cssText = `
          width: 80px; height: 80px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          background: var(--qf-accent, #3b82f6); color: #fff;
          font-size: 24px; font-weight: 700;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        `;
        ghost.appendChild(fallback);
      }

      if (paths.length > 1) {
        const badge = document.createElement('span');
        badge.textContent = String(paths.length);
        badge.style.cssText = `
          position: absolute; right: 4px; bottom: 4px;
          background: var(--qf-accent, #3b82f6); color: #fff;
          min-width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
          border-radius: 9999px; font-size: 11px; font-weight: 700;
          box-shadow: 0 1px 4px rgba(0,0,0,0.45);
        `;
        ghost.appendChild(badge);
      }

      document.body.appendChild(ghost);
      ghostRef.current = ghost;
    }

    function moveGhost(x: number, y: number) {
      if (ghostRef.current) {
        ghostRef.current.style.left = `${x + 14}px`;
        ghostRef.current.style.top = `${y + 14}px`;
      }
    }

    function destroyGhost() {
      ghostRef.current?.remove();
      ghostRef.current = null;
    }

    function cleanup() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      clearPaneHighlight();
      clearCategoryHighlight();
      destroyGhost();
      localDropTarget = null;
      localCategoryTarget = null;
      localTrayTarget = false;
      setIsDragging(false);
      setActiveDragPaths([]);
      setDropTargetPath(null);
      setIsTrayTargetActive(false);
    }

    function stageToTray() {
      if (!onStageFilesToTray || stagedToTray) return;
      stagedToTray = true;
      cleanup();
      onStageFilesToTray(paths);
    }

    function onMouseMove(moveEvt: MouseEvent) {
      if (stagedToTray) return;

      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;

      // 임계값(6px) 초과 시 드래그 시작
      if (!dragging && Math.sqrt(dx * dx + dy * dy) >= 6) {
        dragging = true;
        setIsDragging(true);
        setActiveDragPaths(paths);
        createGhost(moveEvt.clientX, moveEvt.clientY);
      }
      if (!dragging) return;

      moveGhost(moveEvt.clientX, moveEvt.clientY);

      if (onStageFilesToTray) {
        localTrayTarget = moveEvt.clientX >= window.innerWidth - TRAY_STAGE_WIDTH;
        setIsTrayTargetActive(localTrayTarget);
        if (moveEvt.clientX >= window.innerWidth - TRAY_EDGE_COMMIT_MARGIN) {
          stageToTray();
          return;
        }
        if (localTrayTarget) {
          clearPaneHighlight();
          clearCategoryHighlight();
          localCategoryTarget = null;
          localDropTarget = null;
          setDropTargetPath(null);
          return;
        }
      }

      // 드롭 대상 감지 (고스트를 숨기고 elementFromPoint 호출)
      clearPaneHighlight();
      clearCategoryHighlight();
      if (ghostRef.current) ghostRef.current.style.display = 'none';
      const el = document.elementFromPoint(moveEvt.clientX, moveEvt.clientY);
      if (ghostRef.current) ghostRef.current.style.display = '';

      // 1. 사이드바 카테고리 감지 (즐겨찾기 등록)
      const categoryEl = el?.closest('[data-category-id]') as HTMLElement | null;
      const categoryId = categoryEl?.getAttribute('data-category-id') ?? null;

      if (categoryId) {
        localCategoryTarget = categoryId;
        localDropTarget = null;
        setDropTargetPath(null);
        categoryEl!.style.outline = '2px dashed var(--qf-accent, #3b82f6)';
        categoryEl!.style.outlineOffset = '-2px';
        return;
      }

      localCategoryTarget = null;

      // 2. 폴더 카드 감지 (파일 이동)
      const folderEl = el?.closest('[data-folder-drop-target]') as HTMLElement | null;
      const folderPath = folderEl?.getAttribute('data-folder-drop-target') ?? null;

      if (folderPath && paths.includes(folderPath)) {
        // 자기 자신 위에 드롭 방지
        localDropTarget = null;
        setDropTargetPath(null);
      } else if (folderPath) {
        // 폴더 카드 위에 드롭
        localDropTarget = folderPath;
        setDropTargetPath(folderPath);
      } else {
        // 3. 폴백: 다른 패널 영역 (패널의 현재 디렉토리로 이동)
        const paneEl = el?.closest('[data-pane-drop-target]') as HTMLElement | null;
        const panePath = paneEl?.getAttribute('data-pane-drop-target') ?? null;
        if (panePath && panePath !== currentPath) {
          localDropTarget = panePath;
          setDropTargetPath(panePath);
          paneEl!.style.outline = '2px dashed var(--qf-accent, #3b82f6)';
          paneEl!.style.outlineOffset = '-2px';
        } else {
          localDropTarget = null;
          setDropTargetPath(null);
        }
      }
    }

    async function onMouseUp() {
      const target = localDropTarget;
      const catTarget = localCategoryTarget;
      const shouldStageToTray = localTrayTarget;
      cleanup();

      if (!dragging || paths.length === 0) return;
      if (shouldStageToTray && onStageFilesToTray) {
        onStageFilesToTray(paths);
        return;
      }

      // 카테고리 드롭: 폴더만 즐겨찾기에 등록
      if (catTarget && onAddToCategory) {
        for (const p of paths) {
          const isDir = await invoke<boolean>('is_directory', { path: p }).catch(() => false);
          if (isDir) {
            const name = getFileName(p);
            onAddToCategory(catTarget, p, name);
          }
        }
        return;
      }

      // 폴더/패널 드롭: 파일 이동/복사
      if (target) {
        try {
          // 같은 볼륨(로컬-로컬, 동일 클라우드 계정-계정) → 이동, 다른 볼륨(볼륨 경계 넘음) → 복사
          const shouldCopy = paths.some(p => !sameVolume(p, target));

          // 중복 파일 감지 → 있으면 상위 핸들러에 위임
          const duplicates = await invoke<string[]>('check_duplicate_items', { sources: paths, dest: target });
          if (duplicates.length > 0 && onDuplicateDetected) {
            onDuplicateDetected({ sources: paths, dest: target, action: shouldCopy ? 'copy' : 'move', duplicates });
            return;
          }

          if (shouldCopy) {
            await invoke('copy_items', { sources: paths, dest: target });
          } else {
            await invoke('move_items', { sources: paths, dest: target });
          }
          onMoveComplete();
          // 모든 패널에 새로고침 이벤트 전파
          window.dispatchEvent(new CustomEvent('qf-files-changed'));
        } catch (err) {
          console.error('파일 이동/복사 실패:', err);
        }
      }
    }

    // 동기적으로 리스너 등록 (useEffect 의존 문제 회피)
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [selectedPaths, currentPath, onMoveComplete, onAddToCategory, onStageFilesToTray, onDuplicateDetected]);

  /**
   * 중복 확인 다이얼로그 이후 덮어쓰기 또는 스킵으로 재실행.
   * - overwrite=true: 모든 중복 파일을 덮어쓰기
   * - overwrite=false: 중복 파일은 스킵하고 나머지만 이동/복사
   */
  const executeDrop = useCallback(async (info: PendingDrop, overwrite: boolean) => {
    const { sources, dest, action } = info;
    try {
      if (action === 'copy') {
        await invoke('copy_items', { sources, dest, overwrite });
      } else {
        await invoke('move_items', { sources, dest, overwrite });
      }
      onMoveComplete();
      window.dispatchEvent(new CustomEvent('qf-files-changed'));
    } catch (err) {
      console.error('파일 이동/복사 실패:', err);
    }
  }, [onMoveComplete]);

  return {
    isDragging,
    activeDragPaths,
    isTrayTargetActive,
    dropTargetPath,
    handleDragMouseDown: handleMouseDown,
    executeDrop,
  };
}
