import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { FileEntry } from '../../types';
import type { TranslationKey } from '../../utils/i18n';
import DuplicateFilesModal from '../../components/FileExplorer/DuplicateFilesModal';
import { deleteThumb, setThumb, thumbKey } from '../../components/FileExplorer/hooks/thumbnailCache';

const mocks = vi.hoisted(() => ({
  invokeTauriCommand: vi.fn(),
  queuedInvokeLow: vi.fn(),
}));

vi.mock('../../utils/tauriInvoke', () => ({
  invokeTauriCommand: mocks.invokeTauriCommand,
  queuedInvokeLow: mocks.queuedInvokeLow,
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));

function fileEntry(overrides: Partial<FileEntry> & Pick<FileEntry, 'name' | 'path'>): FileEntry {
  return {
    name: overrides.name,
    path: overrides.path,
    is_dir: false,
    size: 10,
    modified: 1,
    file_type: 'other',
    ...overrides,
  };
}

const koMessages: Partial<Record<TranslationKey, string>> = {
  'duplicateFinder.title': '중복 파일 찾기',
  'duplicateFinder.loading': '하위 폴더를 검색하는 중...',
  'duplicateFinder.empty': '중복된 파일이 없습니다',
  'duplicateFinder.summary': '{groups}개 그룹 · 총 {files}개 파일',
  'duplicateFinder.groupLabel': '동일 파일 {count}개 · {size}',
  'duplicateFinder.delete': '삭제',
  'duplicateFinder.confirmDelete': '"{name}" 파일을 휴지통으로 이동할까요?',
  'duplicateFinder.deleteFailed': '삭제 실패: {message}',
};

const enMessages: Partial<Record<TranslationKey, string>> = {
  'duplicateFinder.title': 'Find duplicate files',
  'duplicateFinder.loading': 'Searching subfolders...',
  'duplicateFinder.empty': 'No duplicate files found.',
  'duplicateFinder.summary': '{groups} groups · {files} files total',
  'duplicateFinder.groupLabel': '{count} matching files · {size}',
  'duplicateFinder.delete': 'Delete',
  'duplicateFinder.confirmDelete': 'Move "{name}" to Trash?',
  'duplicateFinder.deleteFailed': 'Delete failed: {message}',
};

function renderModal(t: (key: TranslationKey) => string = key => koMessages[key] ?? key) {
  return render(
    <DuplicateFilesModal
      rootPath="/work"
      onClose={vi.fn()}
      onSelect={vi.fn()}
      onDelete={vi.fn()}
      themeVars={null}
      t={t}
    />,
  );
}

afterEach(() => {
  cleanup();
  mocks.invokeTauriCommand.mockReset();
  mocks.queuedInvokeLow.mockReset();
  vi.unstubAllGlobals();
});

describe('DuplicateFilesModal', () => {
  test('중복 결과 썸네일은 IntersectionObserver 없이도 화면 오류 없이 렌더된다', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    mocks.invokeTauriCommand.mockResolvedValue([
      {
        size: 10,
        files: [
          fileEntry({ name: 'a.txt', path: '/work/a.txt' }),
          fileEntry({ name: 'copy/a.txt', path: '/work/copy/a.txt' }),
        ],
      },
    ]);

    renderModal();

    expect(await screen.findByText('1개 그룹 · 총 2개 파일')).toBeInTheDocument();
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    expect(screen.getByText('copy/a.txt')).toBeInTheDocument();
  });

  test('중복 이미지 파일은 썸네일 경로를 생성해 이미지로 표시한다', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    mocks.invokeTauriCommand.mockResolvedValue([
      {
        size: 10,
        files: [
          fileEntry({ name: 'a.png', path: '/work/a.png', file_type: 'image' }),
          fileEntry({ name: 'copy/a.png', path: '/work/copy/a.png', file_type: 'image' }),
        ],
      },
    ]);
    mocks.queuedInvokeLow.mockReturnValue({
      promise: Promise.resolve('/tmp/qf-thumb-a.png'),
      cancel: vi.fn(),
    });

    renderModal();

    const image = await screen.findByRole('img', { name: 'a.png' });
    expect(image).toHaveAttribute('src', 'asset:///tmp/qf-thumb-a.png');
    expect(mocks.queuedInvokeLow).toHaveBeenCalledWith('get_file_thumbnail_path', {
      path: '/work/a.png',
      size: 80,
    });
  });

  test('빈 썸네일 캐시가 있어도 이미지 확장자 파일은 다시 썸네일을 생성한다', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const target = fileEntry({ name: 'shot.png', path: '/work/shot.png', file_type: 'other' });
    const cacheKey = thumbKey(target.path, 80, target.modified, target.size, target.identity);
    setThumb(cacheKey, '');
    mocks.invokeTauriCommand.mockResolvedValue([
      {
        size: 10,
        files: [
          target,
          fileEntry({ name: 'copy/shot.png', path: '/work/copy/shot.png', file_type: 'other' }),
        ],
      },
    ]);
    mocks.queuedInvokeLow.mockReturnValue({
      promise: Promise.resolve('/tmp/qf-shot-thumb.png'),
      cancel: vi.fn(),
    });

    renderModal();

    const image = await screen.findByRole('img', { name: 'shot.png' });
    expect(image).toHaveAttribute('src', 'asset:///tmp/qf-shot-thumb.png');
    expect(mocks.queuedInvokeLow).toHaveBeenCalledWith('get_file_thumbnail_path', {
      path: '/work/shot.png',
      size: 80,
    });
    deleteThumb(cacheKey);
  });

  test('네이티브 썸네일 negative cache가 있으면 무효화 후 다시 생성한다', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    mocks.invokeTauriCommand.mockImplementation(async (cmd: string) => {
      if (cmd === 'find_duplicate_files') {
        return [
          {
            size: 10,
            files: [
              fileEntry({ name: 'stale.jpg', path: '/work/stale.jpg', file_type: 'image' }),
              fileEntry({ name: 'copy/stale.jpg', path: '/work/copy/stale.jpg', file_type: 'image' }),
            ],
          },
        ];
      }
      return undefined;
    });
    mocks.queuedInvokeLow
      .mockReturnValueOnce({
        promise: Promise.resolve(null),
        cancel: vi.fn(),
      })
      .mockReturnValueOnce({
        promise: Promise.resolve(null),
        cancel: vi.fn(),
      })
      .mockReturnValueOnce({
        promise: Promise.resolve('/tmp/qf-stale-thumb.png'),
        cancel: vi.fn(),
      });

    renderModal();

    const image = await screen.findByRole('img', { name: 'stale.jpg' });
    expect(image).toHaveAttribute('src', 'asset:///tmp/qf-stale-thumb.png');
    expect(mocks.invokeTauriCommand).toHaveBeenCalledWith('invalidate_thumbnail_cache', {
      paths: ['/work/stale.jpg'],
    }, { priority: 'normal' });
  });

  test('중복 탐색 응답이 배열이 아니면 빈 결과로 처리한다', async () => {
    mocks.invokeTauriCommand.mockResolvedValue({ groups: [] });

    renderModal();

    expect(await screen.findByText('중복된 파일이 없습니다')).toBeInTheDocument();
  });

  test('전달된 번역 함수로 팝업 문구를 렌더한다', async () => {
    mocks.invokeTauriCommand.mockResolvedValue({ groups: [] });

    renderModal(key => enMessages[key] ?? key);

    expect(await screen.findByText('No duplicate files found.')).toBeInTheDocument();
    expect(screen.getByText('Find duplicate files')).toBeInTheDocument();
  });
});
