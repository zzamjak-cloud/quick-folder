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

import { getPersistentThumbUrl } from '../../components/FileExplorer/hooks/thumbnailCache';

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
});

