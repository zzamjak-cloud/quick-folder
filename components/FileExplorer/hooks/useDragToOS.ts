import React, { useCallback } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { DRAG_IMAGE } from '../fileUtils';
import { setInternalDragPaths, clearInternalDragPaths } from '../../../hooks/internalDragState';

// 외부 앱으로 파일 드래그 (마우스 6px 이동 시 OS 드래그 시작)
export function useDragToOS(dragPaths: string[]) {
  const startDrag = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;

    const onMouseMove = async (moveEvt: MouseEvent) => {
      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;
      if (Math.sqrt(dx * dx + dy * dy) > 6) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        try {
          // 내부 드래그 상태 설정 (같은 창 드롭 감지용)
          setInternalDragPaths(dragPaths);
          const onEvent = new Channel<unknown>();
          await invoke('plugin:drag|start_drag', {
            item: dragPaths,
            image: DRAG_IMAGE,
            onEvent,
          });
          // OS 드래그 완료 → 같은 창에 드롭된 경우 처리
          window.dispatchEvent(new Event('qf-internal-drag-end'));
        } catch (err) {
          console.error('OS 드래그 실패:', err);
        } finally {
          clearInternalDragPaths();
        }
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [dragPaths]);

  return startDrag;
}
