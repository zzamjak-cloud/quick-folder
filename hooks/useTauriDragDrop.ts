import React, { useEffect, useRef, useCallback } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { invoke } from '@tauri-apps/api/core';

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
      const unlistenFn = await getCurrentWebview().onDragDropEvent(async (event) => {
        if (event.payload.type === 'drop') {
          const paths = event.payload.paths;
          const position = event.payload.position;

          if (paths && paths.length > 0) {
            // 폴더만 즐겨찾기에 등록 가능 (파일은 무시)
            const dirPaths: string[] = [];
            for (const p of paths) {
              const isDir = await invoke<boolean>('is_directory', { path: p }).catch(() => false);
              if (isDir) dirPaths.push(p);
            }
            if (dirPaths.length === 0) return;

            const path = dirPaths[0];
            const name = path.split(/[\\/]/).pop() || 'Unknown';

            // 1) 가장 안정적인 방식: 외부 드래그 중 DOM 타겟 기반으로 추적해 둔 카테고리 사용
            let categoryId: string | null = hoveredCategoryIdRef.current;

            // 2) 폴백: 모든 카테고리 요소의 바운딩 렉트와 드롭 좌표 비교
            if (!categoryId) {
              const catEls = document.querySelectorAll('[data-category-id]');
              for (const el of catEls) {
                const rect = el.getBoundingClientRect();
                if (position.x >= rect.left && position.x <= rect.right &&
                    position.y >= rect.top && position.y <= rect.bottom) {
                  categoryId = el.getAttribute('data-category-id');
                  break;
                }
              }
            }
            // 3) DPR 보정 폴백
            if (!categoryId) {
              const dpr = window.devicePixelRatio || 1;
              if (dpr !== 1) {
                const catEls = document.querySelectorAll('[data-category-id]');
                const px = position.x / dpr;
                const py = position.y / dpr;
                for (const el of catEls) {
                  const rect = el.getBoundingClientRect();
                  if (px >= rect.left && px <= rect.right &&
                      py >= rect.top && py <= rect.bottom) {
                    categoryId = el.getAttribute('data-category-id');
                    break;
                  }
                }
              }
            }

            // 카테고리 영역에 드롭된 경우에만 등록 (무차별 폴백 제거)
            if (categoryId) {
              handleAddFolder(categoryId, path, name);
            }

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
