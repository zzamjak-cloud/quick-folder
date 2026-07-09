import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useInternalDragDrop } from '../../components/FileExplorer/hooks/useInternalDragDrop';

vi.mock('../../utils/tauriCommands', () => ({
  tauriCommands: {
    checkDuplicateItems: vi.fn(),
    isDirectory: vi.fn(),
    materializeArchivePaths: vi.fn(),
    startFileDrag: vi.fn(),
  },
}));

vi.mock('../../components/FileExplorer/hooks/runTransferWithProgress', () => ({
  runTransferWithProgress: vi.fn(),
}));

function createMouseEvent(
  clientX: number,
  clientY: number,
): React.MouseEvent {
  return {
    button: 0,
    detail: 1,
    clientX,
    clientY,
    preventDefault: vi.fn(),
  } as unknown as React.MouseEvent;
}

describe('useInternalDragDrop', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => null),
    });
  });

  test('currentPath 변경 시 진행 중인 내부 drag ghost를 정리한다', () => {
    const source = document.createElement('div');
    source.dataset.filePath = '/source/photo.png';
    document.body.append(source);

    const { result, rerender } = renderHook(
      ({ currentPath }) =>
        useInternalDragDrop({
          selectedPaths: ['/source/photo.png'],
          currentPath,
          onMoveComplete: vi.fn(),
        }),
      { initialProps: { currentPath: '/source' } },
    );

    act(() => {
      result.current.handleDragMouseDown(createMouseEvent(10, 10), '/source/photo.png');
      window.dispatchEvent(new MouseEvent('mousemove', {
        clientX: 24,
        clientY: 24,
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(document.querySelector('#qf-drag-ghost')).not.toBeNull();
    expect(result.current.isDragging).toBe(true);

    act(() => {
      rerender({ currentPath: '/other' });
    });

    expect(document.querySelector('#qf-drag-ghost')).toBeNull();
    expect(document.body).not.toHaveClass('qf-internal-file-dragging');
    expect(result.current.isDragging).toBe(false);
  });

  test('unmount 시 진행 중인 내부 drag ghost를 정리한다', () => {
    const { result, unmount } = renderHook(() =>
      useInternalDragDrop({
        selectedPaths: ['/source/photo.png'],
        currentPath: '/source',
        onMoveComplete: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleDragMouseDown(createMouseEvent(10, 10), '/source/photo.png');
      window.dispatchEvent(new MouseEvent('mousemove', {
        clientX: 24,
        clientY: 24,
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(document.querySelector('#qf-drag-ghost')).not.toBeNull();

    act(() => {
      unmount();
    });

    expect(document.querySelector('#qf-drag-ghost')).toBeNull();
    expect(document.body).not.toHaveClass('qf-internal-file-dragging');
  });
});
