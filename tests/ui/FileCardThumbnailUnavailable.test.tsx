import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FileEntry } from '../../types';
import FileCard from '../../components/FileExplorer/FileCard';
import { deleteThumb, thumbKey } from '../../components/FileExplorer/hooks/thumbnailCache';

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

class ImmediateIntersectionObserver {
  constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() {
    this.callback([{ isIntersecting: true }]);
  }
  disconnect() {}
  unobserve() {}
}

const THUMB_SIZE = 160;

const entry: FileEntry = {
  name: 'albedo.png',
  path: '/work/albedo.png',
  is_dir: false,
  size: 2048,
  modified: 1700000000,
  file_type: 'image',
};

function renderCard() {
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

describe('FileCard 이미지 썸네일 없음/실패 처리', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
    mocks.getFileIcon.mockResolvedValue('');
    deleteThumb(thumbKey(entry.path, THUMB_SIZE, entry.modified, entry.size, entry.identity));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  test('썸네일 없음(null) 확정 시 로딩 스피너를 거둔다', async () => {
    mocks.queuedInvokeLow.mockReturnValue({ promise: Promise.resolve(null), cancel: vi.fn() });
    renderCard();

    await waitFor(() => expect(mocks.queuedInvokeLow).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText('썸네일 로딩 중')).toBeNull());
  });

  test('재시도까지 실패하면 스피너 대신 아이콘으로 폴백한다', async () => {
    mocks.queuedInvokeLow.mockImplementation(() => ({
      promise: Promise.reject(new Error('io_error')),
      cancel: vi.fn(),
    }));
    renderCard();

    // 첫 실패 → 800ms 뒤 1회 재시도 → 재실패 시 아이콘
    await waitFor(() => expect(mocks.queuedInvokeLow).toHaveBeenCalledTimes(2), { timeout: 2000 });
    await waitFor(() => expect(screen.queryByLabelText('썸네일 로딩 중')).toBeNull());
  });
});
