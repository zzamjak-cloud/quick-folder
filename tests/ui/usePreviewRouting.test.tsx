import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { FileEntry } from '../../types';
import type { PreviewState } from '../../components/FileExplorer/hooks/usePreview';
import { usePreviewAutoRefresh, usePreviewRouting } from '../../components/FileExplorer/hooks/usePreviewRouting';

function entry(overrides: Partial<FileEntry> & Pick<FileEntry, 'name' | 'path'>): FileEntry {
  return {
    is_dir: false,
    size: 0,
    modified: 0,
    file_type: 'other',
    ...overrides,
  };
}

function createPreview(overrides: Partial<PreviewState> = {}): PreviewState {
  return {
    videoPlayerPath: null,
    setVideoPlayerPath: vi.fn(),
    previewImagePath: null,
    previewImageData: null,
    previewLoading: false,
    previewImageEditRequest: 0,
    handlePreviewImage: vi.fn(),
    closeImagePreview: vi.fn(),
    previewTextPath: null,
    previewTextContent: null,
    handlePreviewText: vi.fn(),
    closeTextPreview: vi.fn(),
    previewJsonPath: null,
    previewJsonData: null,
    previewJsonEditRequest: 0,
    handlePreviewJson: vi.fn(),
    closeJsonPreview: vi.fn(),
    previewMdPath: null,
    previewMdContent: null,
    previewMdError: null,
    previewMdLoading: false,
    handlePreviewMd: vi.fn(),
    closeMdPreview: vi.fn(),
    codePreviewPath: null,
    setCodePreviewPath: vi.fn(),
    codePreviewEditRequest: 0,
    handleCodePreview: vi.fn(),
    fbxPreviewPath: null,
    setFbxPreviewPath: vi.fn(),
    hwpPreviewPath: null,
    setHwpPreviewPath: vi.fn(),
    closeAllPreviews: vi.fn(),
    isAnyPreviewOpen: false,
    ...overrides,
  };
}

function renderRouting(preview = createPreview()) {
  const onNavigateTo = vi.fn();
  const onOpenArchiveEntry = vi.fn();
  const hook = renderHook(() => usePreviewRouting({
    preview,
    isMac: false,
    thumbnailSize: 120,
    onNavigateTo,
    onOpenArchiveEntry,
  }));

  return { ...hook, preview, onNavigateTo, onOpenArchiveEntry };
}

describe('usePreviewRouting', () => {
  test('previewFile은 파일 종류별 미리보기 핸들러로 라우팅한다', () => {
    const jsonPreview = createPreview();
    const jsonHook = renderRouting(jsonPreview);
    act(() => {
      jsonHook.result.current.previewFile(entry({ name: 'data.json', path: '/tmp/data.json' }));
    });
    expect(jsonPreview.closeAllPreviews).toHaveBeenCalledOnce();
    expect(jsonPreview.handlePreviewJson).toHaveBeenCalledWith('/tmp/data.json');

    const imagePreview = createPreview();
    const imageHook = renderRouting(imagePreview);
    act(() => {
      imageHook.result.current.previewFile(entry({ name: 'photo.png', path: '/tmp/photo.png', file_type: 'image' }));
    });
    expect(imagePreview.closeAllPreviews).toHaveBeenCalledOnce();
    expect(imagePreview.handlePreviewImage).toHaveBeenCalledWith('/tmp/photo.png', false, undefined);

    const fbxPreview = createPreview();
    const fbxHook = renderRouting(fbxPreview);
    act(() => {
      fbxHook.result.current.previewFile(entry({ name: 'scene.fbx', path: '/tmp/scene.fbx' }));
    });
    expect(fbxPreview.closeAllPreviews).toHaveBeenCalledOnce();
    expect(fbxPreview.setFbxPreviewPath).toHaveBeenCalledWith('/tmp/scene.fbx');
  });

  test('openEntry는 폴더, 압축 파일, 동영상, JSON을 별도 경로로 라우팅한다', async () => {
    const { result, preview, onNavigateTo, onOpenArchiveEntry } = renderRouting();

    await act(async () => {
      await result.current.openEntry(entry({ name: 'folder', path: '/tmp/folder', is_dir: true, file_type: 'directory' }));
    });
    expect(onNavigateTo).toHaveBeenCalledWith('/tmp/folder');

    await act(async () => {
      await result.current.openEntry(entry({ name: 'bundle.zip', path: '/tmp/bundle.zip', file_type: 'archive' }));
    });
    expect(onOpenArchiveEntry).toHaveBeenCalledWith('/tmp/bundle.zip');

    await act(async () => {
      await result.current.openEntry(entry({ name: 'clip.mp4', path: '/tmp/clip.mp4', file_type: 'video' }));
    });
    expect(preview.setVideoPlayerPath).toHaveBeenCalledWith('/tmp/clip.mp4');

    await act(async () => {
      await result.current.openEntry(entry({ name: 'data.json', path: '/tmp/data.json' }));
    });
    expect(preview.handlePreviewJson).toHaveBeenCalledWith('/tmp/data.json');
  });
});

describe('usePreviewAutoRefresh', () => {
  test('미리보기 중 선택 항목이 폴더가 되면 열린 미리보기를 닫는다', async () => {
    const preview = createPreview({ isAnyPreviewOpen: true });
    const previewFile = vi.fn();

    renderHook(() => usePreviewAutoRefresh({
      preview,
      selectedPaths: ['/tmp/folder'],
      entries: [entry({ name: 'folder', path: '/tmp/folder', is_dir: true, file_type: 'directory' })],
      previewFile,
    }));

    await waitFor(() => {
      expect(preview.closeAllPreviews).toHaveBeenCalledOnce();
    });
    expect(previewFile).not.toHaveBeenCalled();
  });
});
