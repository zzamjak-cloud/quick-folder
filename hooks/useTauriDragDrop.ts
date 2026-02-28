import React, { useEffect, useRef, useCallback } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { invoke } from '@tauri-apps/api/core';

// 좌표에서 카테고리 요소 찾기 (Tauri v2 논리 좌표 기반)
function findCategoryAtPosition(position: { x: number; y: number }): { id: string; el: HTMLElement } | null {
  const el = document.elementFromPoint(position.x, position.y);
  const catEl = el?.closest?.('[data-category-id]') as HTMLElement | null;
  if (catEl) {
    const id = catEl.getAttribute('data-category-id');
    if (id) return { id, el: catEl };
  }
  return null;
}

// 사이드바 카테고리 드래그 하이라이트 해제
function clearCategoryDragHighlight() {
  document.querySelectorAll('[data-category-id]').forEach(el => {
    (el as HTMLElement).style.outline = '';
    (el as HTMLElement).style.outlineOffset = '';
  });
}

// 특정 카테고리에 드래그 하이라이트 적용
function applyCategoryDragHighlight(el: HTMLElement) {
  clearCategoryDragHighlight();
  el.style.outline = '2px dashed var(--qf-accent, #3b82f6)';
  el.style.outlineOffset = '-2px';
}

export function useTauriDragDrop(
  handleAddFolder: (catId: string, path?: string, name?: string) => void,
) {
  // Tauri over 이벤트로 추적하는 호버 카테고리
  const hoveredCategoryIdRef = useRef<string | null>(null);

  // HTML5 dragover에서도 카테고리 추적 + 시각적 피드백
  const updateHoveredCategoryFromDragEvent = useCallback((e: React.DragEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const categoryEl = el?.closest?.('[data-category-id]') as HTMLElement | null;
    const catId = categoryEl?.getAttribute('data-category-id') ?? null;
    hoveredCategoryIdRef.current = catId;

    if (categoryEl && catId) {
      applyCategoryDragHighlight(categoryEl);
    } else {
      clearCategoryDragHighlight();
    }
  }, []);

  const clearHoveredCategoryIfLeftMain = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    hoveredCategoryIdRef.current = null;
    clearCategoryDragHighlight();
  }, []);

  // Tauri 드래그앤드롭 리스너
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isMounted = true;

    const setupDragDrop = async () => {
      const unlistenFn = await getCurrentWebview().onDragDropEvent(async (event) => {
        const { type } = event.payload;

        // over: 카테고리 추적 + 시각적 피드백
        if (type === 'over') {
          const position = event.payload.position;
          const found = findCategoryAtPosition(position);
          hoveredCategoryIdRef.current = found?.id ?? null;
          if (found) {
            applyCategoryDragHighlight(found.el);
          } else {
            clearCategoryDragHighlight();
          }
          return;
        }

        // leave: 하이라이트 해제
        if (type === 'leave') {
          hoveredCategoryIdRef.current = null;
          clearCategoryDragHighlight();
          return;
        }

        // drop: 폴더를 카테고리에 등록
        if (type === 'drop') {
          const categoryId = hoveredCategoryIdRef.current;
          clearCategoryDragHighlight();
          hoveredCategoryIdRef.current = null;

          // 드롭 위치로 카테고리 재확인 (ref가 부정확할 경우 대비)
          const position = event.payload.position;
          const finalCategoryId = categoryId ?? findCategoryAtPosition(position)?.id ?? null;
          if (!finalCategoryId) return;

          const paths = event.payload.paths;
          if (!paths || paths.length === 0) return;

          // 폴더만 즐겨찾기에 등록 가능 (파일은 무시)
          const dirPaths: string[] = [];
          for (const p of paths) {
            const isDir = await invoke<boolean>('is_directory', { path: p }).catch(() => false);
            if (isDir) dirPaths.push(p);
          }
          if (dirPaths.length === 0) return;

          const path = dirPaths[0];
          const name = path.split(/[\\/]/).pop() || 'Unknown';
          handleAddFolder(finalCategoryId, path, name);
        }
      });

      if (isMounted) {
        unlisten = unlistenFn;
      } else {
        unlistenFn();
      }
    };

    setupDragDrop();

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, [handleAddFolder]);

  return {
    hoveredCategoryIdRef,
    updateHoveredCategoryFromDragEvent,
    clearHoveredCategoryIfLeftMain,
  };
}
