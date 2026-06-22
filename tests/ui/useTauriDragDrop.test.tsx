import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useTauriDragDrop } from '../../hooks/useTauriDragDrop';

const mocks = vi.hoisted(() => ({
  invokeTauriCommand: vi.fn(),
  isTauri: vi.fn(),
  onDragDropEvent: vi.fn(),
}));

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: mocks.onDragDropEvent,
  }),
}));

vi.mock('../../utils/isTauri', () => ({
  isTauri: mocks.isTauri,
}));

vi.mock('../../utils/tauriInvoke', () => ({
  invokeTauriCommand: mocks.invokeTauriCommand,
}));

type DragDropHandler = (event: {
  payload:
    | { type: 'over' | 'leave'; position: { x: number; y: number } }
    | { type: 'drop'; position: { x: number; y: number }; paths: string[] };
}) => Promise<void>;

describe('useTauriDragDrop', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mocks.isTauri.mockReturnValue(true);
    mocks.invokeTauriCommand.mockReset();
    mocks.onDragDropEvent.mockReset();
  });

  test('native drop 이벤트는 폴더만 현재 카테고리에 등록한다', async () => {
    let handler: DragDropHandler | undefined;
    const unlisten = vi.fn();
    mocks.onDragDropEvent.mockImplementation(async (callback: DragDropHandler) => {
      handler = callback;
      return unlisten;
    });

    const category = document.createElement('div');
    category.dataset.categoryId = 'favorites';
    document.body.append(category);

    const elementFromPoint = vi.fn(() => category);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    });
    const handleAddFolder = vi.fn();

    const { unmount } = renderHook(() => useTauriDragDrop(handleAddFolder));
    await waitFor(() => expect(mocks.onDragDropEvent).toHaveBeenCalledTimes(1));

    await act(async () => {
      await handler?.({
        payload: { type: 'over', position: { x: 10, y: 20 } },
      });
    });

    expect(category.style.outline).toBe('2px dashed var(--qf-accent, #3b82f6)');

    mocks.invokeTauriCommand.mockImplementation(async (_cmd: string, args: { path: string }) =>
      args.path.endsWith('/Folder')
    );

    await act(async () => {
      await handler?.({
        payload: {
          type: 'drop',
          position: { x: 10, y: 20 },
          paths: ['/Users/woody/Desktop/file.txt', '/Users/woody/Desktop/Folder'],
        },
      });
    });

    expect(mocks.invokeTauriCommand).toHaveBeenCalledWith('is_directory', {
      path: '/Users/woody/Desktop/file.txt',
    });
    expect(mocks.invokeTauriCommand).toHaveBeenCalledWith('is_directory', {
      path: '/Users/woody/Desktop/Folder',
    });
    expect(handleAddFolder).toHaveBeenCalledWith(
      'favorites',
      '/Users/woody/Desktop/Folder',
      'Folder',
    );
    expect(category.style.outline).toBe('');

    unmount();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  test('Tauri가 아니면 native drag/drop listener를 등록하지 않는다', () => {
    mocks.isTauri.mockReturnValue(false);

    renderHook(() => useTauriDragDrop(vi.fn()));

    expect(mocks.onDragDropEvent).not.toHaveBeenCalled();
  });
});
