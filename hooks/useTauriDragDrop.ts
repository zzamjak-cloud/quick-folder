import React, { useEffect, useRef, useCallback } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

// 외부(탐색기) 드래그 이벤트 감지
export function isExternalFileDragEvent(e: React.DragEvent) {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}

export function useTauriDragDrop(
  handleAddFolder: (catId: string, path?: string, name?: string) => void,
) {
  const hoveredCategoryIdRef = useRef<string | null>(null);

  // 외부(탐색기) 드래그 시 호버된 카테고리를 DOM 타겟 기반으로 추적
  const updateHoveredCategoryFromDragEvent = useCallback((e: React.DragEvent) => {
    if (!isExternalFileDragEvent(e)) return;
    const target = e.target as HTMLElement | null;
    const categoryEl = target?.closest?.('[data-category-id]') as HTMLElement | null;
    const id = categoryEl?.getAttribute('data-category-id') ?? null;
    hoveredCategoryIdRef.current = id;
  }, []);

  const clearHoveredCategoryIfLeftMain = useCallback((e: React.DragEvent) => {
    if (!isExternalFileDragEvent(e)) return;
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    hoveredCategoryIdRef.current = null;
  }, []);

  // Tauri 드래그앤드롭 리스너
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isMounted = true;

    const setupDragDrop = async () => {
      const unlistenFn = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === 'drop') {
          const paths = event.payload.paths;
          const position = event.payload.position;

          if (paths && paths.length > 0) {
            const path = paths[0];
            const name = path.split(/[\\/]/).pop() || 'Unknown';

            // 1) DOM 타겟 기반 카테고리
            let categoryId: string | null = hoveredCategoryIdRef.current;

            // 2) 폴백: 좌표 기반
            if (!categoryId) {
              const element1 = document.elementFromPoint(position.x, position.y);
              categoryId = element1?.closest('[data-category-id]')?.getAttribute('data-category-id') ?? null;
            }
            if (!categoryId) {
              const dpr = window.devicePixelRatio || 1;
              const element2 = document.elementFromPoint(position.x / dpr, position.y / dpr);
              categoryId = element2?.closest('[data-category-id]')?.getAttribute('data-category-id') ?? null;
            }

            if (categoryId) {
              handleAddFolder(categoryId, path, name);
            }
            // 카테고리를 찾지 못한 경우는 App.tsx에서 처리

            hoveredCategoryIdRef.current = null;
          }
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
