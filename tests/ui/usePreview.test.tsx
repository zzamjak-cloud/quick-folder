import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { usePreview } from '../../components/FileExplorer/hooks/usePreview';

const { convertFileSrcMock } = vi.hoisted(() => ({
  convertFileSrcMock: vi.fn((path: string) => `asset://${path}`),
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: convertFileSrcMock,
  invoke: vi.fn(),
}));

describe('usePreview', () => {
  test('전체 닫기 후 같은 이미지를 다시 미리보기할 수 있다', async () => {
    const { result } = renderHook(() => usePreview());
    const path = '/tmp/photo.png';

    await act(async () => {
      await result.current.handlePreviewImage(path, false, undefined, 'mtime:1:size:10');
    });
    expect(result.current.previewImagePath).toBe(path);

    act(() => {
      result.current.closeAllPreviews();
    });
    expect(result.current.previewImagePath).toBeNull();

    await act(async () => {
      await result.current.handlePreviewImage(path, false, undefined, 'mtime:1:size:10');
    });

    expect(result.current.previewImagePath).toBe(path);
    expect(convertFileSrcMock).toHaveBeenCalledTimes(2);
  });
});
