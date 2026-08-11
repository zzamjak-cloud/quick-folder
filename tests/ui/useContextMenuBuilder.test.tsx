import { renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { FileEntry } from '../../types';
import type { UseContextMenuBuilderConfig } from '../../components/FileExplorer/hooks/useContextMenuBuilder';
import { useContextMenuBuilder } from '../../components/FileExplorer/hooks/useContextMenuBuilder';

function entry(overrides: Partial<FileEntry> & Pick<FileEntry, 'name' | 'path'>): FileEntry {
  return {
    is_dir: false,
    size: 0,
    modified: 0,
    file_type: 'other',
    ...overrides,
  };
}

function createConfig(overrides: Partial<UseContextMenuBuilderConfig> = {}): UseContextMenuBuilderConfig {
  const config: UseContextMenuBuilderConfig = {
    contextMenu: { x: 10, y: 10, paths: [] },
    entries: [],
    folderTags: null,
    clipboardHook: {
      clipboard: null,
      handleCopy: vi.fn(),
      handleCut: vi.fn(),
      handlePaste: vi.fn(),
    },
    fileOps: {
      handleDuplicate: vi.fn(),
      handleRenameStart: vi.fn(),
      handleBulkRename: vi.fn(),
      handleConvertCase: vi.fn(),
      handleRecoverFileNames: vi.fn(),
      handleDelete: vi.fn(),
      handleCompressZip: vi.fn(),
      handleExtractZip: vi.fn(),
      handleCompressVideo: vi.fn(),
      handleVideoToGif: vi.fn(),
      handleGifToMp4: vi.fn(),
      handleCompressPdf: vi.fn(),
      handleInspectFolderSize: vi.fn(),
      handleCopyPath: vi.fn(),
      handleSpritePack: vi.fn(),
      handleCreateDirectory: vi.fn(),
      handleCreateMarkdown: vi.fn(),
      showCopyToast: vi.fn(),
    },
    modals: {
      setPixelatePath: vi.fn(),
      setMapMakerPath: vi.fn(),
      setRemoveWhiteBgPaths: vi.fn(),
      setSheetUnpackPath: vi.fn(),
      setFontPreviewPath: vi.fn(),
      setFontMergePaths: vi.fn(),
      setPdfPreviewPath: vi.fn(),
      setGifCompressPaths: vi.fn(),
      setTerminalPresetPath: vi.fn(),
      setTerminalPresetEditId: vi.fn(),
      setDuplicateFinderPath: vi.fn(),
      setDiffViewerPaths: vi.fn(),
    },
    preview: {
      handlePreviewImage: vi.fn(),
    },
    openEntry: vi.fn(),
    openInOsExplorer: vi.fn(),
    handleAddTag: vi.fn(),
    handleRemoveTag: vi.fn(),
    onAddToFavorites: vi.fn(),
    loadDirectory: vi.fn(),
    currentPath: '/work',
  };

  return {
    ...config,
    ...overrides,
    clipboardHook: { ...config.clipboardHook, ...overrides.clipboardHook },
    fileOps: { ...config.fileOps, ...overrides.fileOps },
    modals: { ...config.modals, ...overrides.modals },
    preview: { ...config.preview, ...overrides.preview },
  };
}

function itemIds(config: UseContextMenuBuilderConfig): string[] {
  const { result } = renderHook(() => useContextMenuBuilder(config));
  return result.current.contextMenuSections.flatMap(section => section.items.map(item => item.id));
}

describe('useContextMenuBuilder', () => {
  test('빈 공간 컨텍스트 메뉴는 생성 액션을 제공한다', () => {
    expect(itemIds(createConfig())).toContain('new-folder');
    expect(itemIds(createConfig())).toContain('new-markdown');
  });

  test('이미지 파일 컨텍스트 메뉴는 미리보기와 이미지 도구를 제공한다', () => {
    const imageEntry = entry({ name: 'photo.png', path: '/work/photo.png', file_type: 'image' });
    const config = createConfig({
      contextMenu: { x: 10, y: 10, paths: [imageEntry.path] },
      entries: [imageEntry],
    });
    const { result } = renderHook(() => useContextMenuBuilder(config));
    const ids = result.current.contextMenuSections.flatMap(section => section.items.map(item => item.id));
    const previewItem = result.current.contextMenuSections
      .flatMap(section => section.items)
      .find(item => item.id === 'preview');

    expect(ids).toContain('preview');
    expect(ids).toContain('pixelate');
    expect(ids).toContain('map-maker');
    expect(ids).toContain('remove-white-bg');

    previewItem?.onClick();
    expect(config.preview.handlePreviewImage).toHaveBeenCalledWith('/work/photo.png', false, undefined, 'mtime:0:size:0');
  });

  test('ZIP과 동영상 선택은 전용 도구 메뉴로 분기한다', () => {
    const zipEntry = entry({ name: 'bundle.zip', path: '/work/bundle.zip', file_type: 'archive' });
    expect(itemIds(createConfig({
      contextMenu: { x: 10, y: 10, paths: [zipEntry.path] },
      entries: [zipEntry],
    }))).toContain('extract-zip');

    const videoEntry = entry({ name: 'clip.mp4', path: '/work/clip.mp4', file_type: 'video' });
    const { result } = renderHook(() => useContextMenuBuilder(createConfig({
      contextMenu: { x: 10, y: 10, paths: [videoEntry.path] },
      entries: [videoEntry],
    })));
    const compressVideo = result.current.contextMenuSections
      .flatMap(section => section.items)
      .find(item => item.id === 'compress-video');

    expect(compressVideo?.submenu?.map(item => item.id)).toEqual([
      'compress-scale',
      'quality-low',
      'quality-medium',
      'quality-high',
    ]);
    // 크기 드롭다운은 custom 노드 항목이어야 한다 (클릭 시 메뉴 유지)
    expect(compressVideo?.submenu?.find(item => item.id === 'compress-scale')?.custom).toBeTruthy();
    expect(itemIds(createConfig({
      contextMenu: { x: 10, y: 10, paths: [videoEntry.path] },
      entries: [videoEntry],
    }))).toContain('video-to-gif');

    const secondVideoEntry = entry({ name: 'clip-2.webm', path: '/work/clip-2.webm', file_type: 'video' });
    const multiVideoConfig = createConfig({
      contextMenu: { x: 10, y: 10, paths: [videoEntry.path, secondVideoEntry.path] },
      entries: [videoEntry, secondVideoEntry],
    });
    const multiVideoMenu = renderHook(() => useContextMenuBuilder(multiVideoConfig));
    const videoToGif = multiVideoMenu.result.current.contextMenuSections
      .flatMap(section => section.items)
      .find(item => item.id === 'video-to-gif');

    videoToGif?.onClick();
    expect(multiVideoConfig.fileOps.handleVideoToGif).toHaveBeenCalledWith([
      '/work/clip.mp4',
      '/work/clip-2.webm',
    ]);
  });

  test('폴더 용량 확인 메뉴는 전달된 번역 함수를 사용한다', () => {
    const folderEntry = entry({ name: 'assets', path: '/work/assets', is_dir: true, file_type: 'directory' });
    const config = createConfig({
      contextMenu: { x: 10, y: 10, paths: [folderEntry.path] },
      entries: [folderEntry],
      t: key => (key === 'folderSize.menuLabel' ? 'Check folder size' : key),
    });
    const { result } = renderHook(() => useContextMenuBuilder(config));
    const folderSizeItem = result.current.contextMenuSections
      .flatMap(section => section.items)
      .find(item => item.id === 'folder-size-check');

    expect(folderSizeItem?.label).toBe('Check folder size');
  });

  test('폴더 용량 확인 메뉴는 기본 한글 라벨을 표시한다', () => {
    const folderEntry = entry({ name: 'assets', path: '/work/assets', is_dir: true, file_type: 'directory' });
    const config = createConfig({
      contextMenu: { x: 10, y: 10, paths: [folderEntry.path] },
      entries: [folderEntry],
    });
    const { result } = renderHook(() => useContextMenuBuilder(config));
    const folderSizeItem = result.current.contextMenuSections
      .flatMap(section => section.items)
      .find(item => item.id === 'folder-size-check');

    expect(folderSizeItem?.label).toBe('폴더 용량 확인');
  });
});
