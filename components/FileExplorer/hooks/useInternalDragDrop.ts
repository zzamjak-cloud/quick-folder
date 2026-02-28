import { useState, useCallback, useRef } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { DRAG_IMAGE } from '../fileUtils';
import { isCloudPath } from '../../../utils/pathUtils';

interface UseInternalDragDropOptions {
  selectedPaths: string[];
  currentPath: string;
  onMoveComplete: () => void;
  onAddToCategory?: (categoryId: string, path: string, name: string) => void;
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

/**
 * 파일 드래그 → 폴더/패널 이동 훅 (내부 드래그 + OS 드래그 통합)
 *
 * 내부 드래그: 폴더 카드 또는 다른 패널 위에 드롭 → move_items
 * OS 드래그: 윈도우 가장자리에 도달하면 네이티브 OS 드래그로 전환
 *
 * 리스너를 handleMouseDown에서 동기적으로 등록하여
 * useEffect 재실행 의존 문제를 회피.
 */
export function useInternalDragDrop({ selectedPaths, currentPath, onMoveComplete, onAddToCategory }: UseInternalDragDropOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent, entryPath: string) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const paths = selectedPaths.includes(entryPath) && selectedPaths.length > 1
      ? selectedPaths
      : [entryPath];

    let dragging = false;
    let osStarted = false;
    let localDropTarget: string | null = null;
    let localCategoryTarget: string | null = null;

    // --- 드래그 고스트 ---
    function createGhost(x: number, y: number) {
      const ghost = document.createElement('div');
      ghost.id = 'qf-drag-ghost';
      ghost.style.cssText = `
        position: fixed; pointer-events: none; z-index: 99999;
        left: ${x + 14}px; top: ${y + 14}px;
        display: flex; align-items: center; gap: 8px;
        padding: 6px 10px; border-radius: 8px;
        background: var(--qf-surface-2, #1f2937);
        border: 1px solid var(--qf-border, #334155);
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        font-size: 12px; color: var(--qf-text, #e5e7eb);
        max-width: 220px; opacity: 0.92;
      `;

      // 소스 카드에서 아이콘 복제
      const escapedPath = paths[0].replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const sourceCard = document.querySelector(`[data-file-path="${escapedPath}"]`);
      const iconImg = sourceCard?.querySelector('img');
      if (iconImg) {
        const iconClone = document.createElement('img');
        iconClone.src = iconImg.src;
        iconClone.style.cssText = 'width: 24px; height: 24px; object-fit: contain; flex-shrink: 0;';
        ghost.appendChild(iconClone);
      }

      // 파일명
      const nameEl = document.createElement('span');
      nameEl.textContent = paths[0].split(/[/\\]/).pop() ?? '';
      nameEl.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;';
      ghost.appendChild(nameEl);

      // 다중 선택 배지
      if (paths.length > 1) {
        const badge = document.createElement('span');
        badge.textContent = String(paths.length);
        badge.style.cssText = `
          background: var(--qf-accent, #3b82f6); color: #fff;
          padding: 1px 6px; border-radius: 9999px;
          font-size: 10px; font-weight: 600; flex-shrink: 0;
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
      setIsDragging(false);
      setDropTargetPath(null);
    }

    function onMouseMove(moveEvt: MouseEvent) {
      if (osStarted) return;

      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;

      // 임계값(6px) 초과 시 드래그 시작
      if (!dragging && Math.sqrt(dx * dx + dy * dy) >= 6) {
        dragging = true;
        setIsDragging(true);
        createGhost(moveEvt.clientX, moveEvt.clientY);
      }
      if (!dragging) return;

      moveGhost(moveEvt.clientX, moveEvt.clientY);

      // 윈도우 가장자리 감지 → OS 드래그로 전환
      const margin = 5;
      if (
        moveEvt.clientX <= margin ||
        moveEvt.clientY <= margin ||
        moveEvt.clientX >= window.innerWidth - margin ||
        moveEvt.clientY >= window.innerHeight - margin
      ) {
        osStarted = true;
        cleanup();
        const onEvent = new Channel<unknown>();
        invoke('plugin:drag|start_drag', { item: paths, image: DRAG_IMAGE, onEvent })
          .catch(err => console.error('OS 드래그 실패:', err));
        return;
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
      cleanup();

      if (!dragging || paths.length === 0) return;

      // 카테고리 드롭: 폴더만 즐겨찾기에 등록
      if (catTarget && onAddToCategory) {
        for (const p of paths) {
          const isDir = await invoke<boolean>('is_directory', { path: p }).catch(() => false);
          if (isDir) {
            const name = p.split(/[/\\]/).pop() ?? p;
            onAddToCategory(catTarget, p, name);
          }
        }
        return;
      }

      // 폴더/패널 드롭: 파일 이동/복사
      if (target) {
        try {
          // 클라우드 경로 ↔ 로컬 = 복사, 로컬 ↔ 로컬 = 이동
          const srcCloud = paths.some(p => isCloudPath(p));
          const destCloud = isCloudPath(target);
          if (srcCloud || destCloud) {
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
  }, [selectedPaths, currentPath, onMoveComplete, onAddToCategory]);

  return {
    isDragging,
    dropTargetPath,
    handleDragMouseDown: handleMouseDown,
  };
}
