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
    expect(config.preview.handlePreviewImage).toHaveBeenCalledWith('/work/photo.png');
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
      'quality-low',
      'quality-medium',
      'quality-high',
    ]);
  });
});
