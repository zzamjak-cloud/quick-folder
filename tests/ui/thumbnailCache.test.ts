import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appCacheDir: vi.fn(),
  convertFileSrc: vi.fn(),
}));

vi.mock('@tauri-apps/api/path', () => ({
  appCacheDir: mocks.appCacheDir,
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: mocks.convertFileSrc,
}));

import {
  deleteThumbsForPaths,
  getPersistentThumbUrl,
  getThumb,
  setThumb,
  thumbKey,
} from '../../components/FileExplorer/hooks/thumbnailCache';

describe('thumbnailCache', () => {
  test('cloud path는 path 기반 persistent thumbnail URL을 선반영하지 않는다', async () => {
    const url = await getPersistentThumbUrl(
      '/Users/test/Library/CloudStorage/GoogleDrive-user@example.com/My Drive/photo.png',
      'image',
      160,
      Date.now(),
      1024,
    );

    expect(url).toBeNull();
    expect(mocks.appCacheDir).not.toHaveBeenCalled();
    expect(mocks.convertFileSrc).not.toHaveBeenCalled();
  });

  test('같은 경로와 수정시각이라도 파일 identity가 다르면 메모리 캐시 키가 분리된다', () => {
    const first = thumbKey('/tmp/Screenshot_0.png', 160, 123456, 1000, 'unix:1:10:100:1:123456:1000');
    const second = thumbKey('/tmp/Screenshot_0.png', 160, 123456, 1000, 'unix:1:11:101:1:123456:1000');

    expect(first).not.toBe(second);
  });

  test('path 단위 썸네일 캐시 삭제는 같은 파일의 모든 key만 제거한다', () => {
    vi.useFakeTimers();
    const path = '/tmp/Screenshot_0.png';
    const first = thumbKey(path, 160, 123456, 1000, 'unix:1:10:100:1:123456:1000');
    const second = thumbKey(path, 320, 123457, 1000, 'unix:1:10:100:2:123457:1000');
    const other = thumbKey('/tmp/Other.png', 160, 123456, 1000, 'unix:1:11:100:1:123456:1000');

    try {
      setThumb(first, 'asset://first.png');
      setThumb(second, 'asset://second.png');
      setThumb(other, 'asset://other.png');

      deleteThumbsForPaths([path]);

      expect(getThumb(first)).toBeUndefined();
      expect(getThumb(second)).toBeUndefined();
      expect(getThumb(other)).toBe('asset://other.png');
    } finally {
      deleteThumbsForPaths(['/tmp/Other.png']);
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });
});
