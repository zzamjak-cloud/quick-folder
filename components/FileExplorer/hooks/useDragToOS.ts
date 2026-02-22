import React, { useCallback } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';

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
          const onEvent = new Channel<unknown>();
          await invoke('plugin:drag|start_drag', {
            item: dragPaths,
            image: { Raw: [] },
            onEvent,
          });
        } catch {
          // 드래그 실패 무시
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
