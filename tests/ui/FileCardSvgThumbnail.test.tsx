import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FileEntry } from '../../types';
import FileCard from '../../components/FileExplorer/FileCard';
import { deleteThumb, setThumb, thumbKey } from '../../components/FileExplorer/hooks/thumbnailCache';

const mocks = vi.hoisted(() => ({
  queuedInvokeLow: vi.fn(),
  getFileIcon: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

vi.mock('../../components/FileExplorer/hooks/invokeQueue', () => ({
  queuedInvokeLow: mocks.queuedInvokeLow,
  isTauriCommandCancelled: () => false,
}));

vi.mock('../../utils/tauriCommands', () => ({
  tauriCommands: { getFileIcon: mocks.getFileIcon },
}));

// jsdom에는 IntersectionObserver가 없다. 카드가 즉시 '보임' 상태가 되도록 stub.
class ImmediateIntersectionObserver {
  constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() {
    this.callback([{ isIntersecting: true }]);
  }
  disconnect() {}
  unobserve() {}
}

const THUMB_SIZE = 160;

function svgEntry(): FileEntry {
  return {
    name: 'logo.svg',
    path: '/work/logo.svg',
    is_dir: false,
    size: 512,
    modified: 1700000000,
    file_type: 'image',
  };
}

function renderCard(entry: FileEntry) {
  return render(
    <FileCard
      entry={entry}
      isSelected={false}
      isFocused={false}
      isRenaming={false}
      isCut={false}
      isDropTarget={false}
      thumbnailSize={THUMB_SIZE}
      onDragMouseDown={vi.fn()}
      onSelect={vi.fn()}
      onOpen={vi.fn()}
      onContextMenu={vi.fn()}
      onRenameCommit={vi.fn()}
      themeVars={null}
    />
  );
}

describe('FileCard SVG 썸네일', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
    mocks.queuedInvokeLow.mockReturnValue({ promise: Promise.resolve(null), cancel: vi.fn() });
    mocks.getFileIcon.mockResolvedValue('');
    deleteThumb(thumbKey('/work/logo.svg', THUMB_SIZE, 1700000000, 512, undefined));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  test('SVG는 Rust 썸네일 대신 원본 asset URL을 그대로 사용한다', async () => {
    const entry = svgEntry();
    renderCard(entry);

    const img = await screen.findByAltText('logo.svg');
    expect(img.getAttribute('src')).toContain('asset://localhost//work/logo.svg');
    // SVG는 Rust 썸네일 명령을 호출하지 않는다
    expect(mocks.queuedInvokeLow).not.toHaveBeenCalledWith(
      expect.stringContaining('thumbnail'),
      expect.anything()
    );
  });

  test("구버전이 캐시한 '' (썸네일 없음)이 있어도 asset URL로 자가 치유한다", async () => {
    // 회귀 방지: 1.27.70 이전 빌드는 SVG 썸네일 실패를 ''로 캐시했고 localStorage에 영속된다.
    // 캐시를 먼저 읽으면 업데이트 후에도 썸네일이 뜨지 않고 로딩 스피너가 무한히 돈다.
    const entry = svgEntry();
    const key = thumbKey(entry.path, THUMB_SIZE, entry.modified, entry.size, entry.identity);
    setThumb(key, '');

    renderCard(entry);

    await waitFor(() => {
      const img = screen.getByAltText('logo.svg');
      expect(img.getAttribute('src')).toContain('asset://localhost//work/logo.svg');
    });
  });
});
