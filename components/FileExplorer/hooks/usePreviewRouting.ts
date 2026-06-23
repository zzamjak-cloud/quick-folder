import { useCallback, useEffect, useMemo } from 'react';
import type { FileEntry } from '../../../types';
import { tauriCommands } from '../../../utils/tauriCommands';
import { isArchiveVirtualPath, isBrowsableArchiveFilePath } from '../../../utils/pathUtils';
import { queuedInvokeLow } from './invokeQueue';
import { getThumb, thumbKey } from './thumbnailCache';
import type { PreviewState } from './usePreview';

interface UsePreviewRoutingOptions {
  preview: PreviewState;
  isMac: boolean;
  thumbnailSize: number;
  onNavigateTo: (path: string) => void;
  onOpenArchiveEntry: (path: string) => void;
}

interface UsePreviewAutoRefreshOptions {
  preview: PreviewState;
  selectedPaths: string[];
  entries: FileEntry[];
  previewFile: (entry: FileEntry) => void;
}

const KNOWN_TEXT_FILES = new Set([
  'license', 'licence', 'readme', 'makefile', 'dockerfile',
  'gemfile', 'rakefile', 'procfile', 'vagrantfile',
  '.gitignore', '.gitattributes', '.editorconfig', '.env',
  '.npmrc', '.prettierrc', '.eslintrc', '.dockerignore',
]);

export function usePreviewRouting({
  preview,
  isMac,
  thumbnailSize,
  onNavigateTo,
  onOpenArchiveEntry,
}: UsePreviewRoutingOptions) {
  const textPreviewExts = useMemo(() => new Set([
    'txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'py', 'rs', 'go',
    'java', 'c', 'cpp', 'h', 'yaml', 'yml', 'toml', 'xml', 'csv', 'log',
    'cs', 'shader', 'glsl', 'hlsl', 'lua', 'rb', 'php', 'swift', 'kt', 'sh', 'bat',
    'ps1', 'r', 'sql', 'scala', 'dart', 'zig',
  ]), []);

  const codePreviewExts = useMemo(() => new Set([
    'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h',
    'yaml', 'yml', 'toml', 'xml', 'cs', 'shader', 'glsl', 'hlsl', 'lua', 'rb', 'php',
    'swift', 'kt', 'sh', 'bat', 'ps1', 'r', 'sql', 'scala', 'dart', 'zig',
  ]), []);

  const previewFile = useCallback((entry: FileEntry) => {
    if (entry.is_dir) return;

    // 그리드에 이미 로드된 썸네일(메모리 캐시)을 미리보기 즉시 placeholder로 사용 → '로딩중' 제거.
    // '' = 썸네일 없음 확정이므로 제외. 없으면 undefined → 기존 동작.
    const cachedThumb = getThumb(thumbKey(entry.path, thumbnailSize, entry.modified));
    const placeholder = cachedThumb ? cachedThumb : undefined;

    const isVideo = entry.file_type === 'video';
    const isImage = entry.file_type === 'image' || /\.psd$/i.test(entry.name);
    const isPsb = /\.psb$/i.test(entry.name);
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    const isJson = ext === 'json';
    const isMd = ext === 'md';
    const hasNoExt = !entry.name.includes('.') || entry.name.startsWith('.');
    const isKnownText = hasNoExt && KNOWN_TEXT_FILES.has(entry.name.toLowerCase());
    const isText = (textPreviewExts.has(ext) && !isJson && !isMd) || isKnownText;

    if (isVideo) {
      if (!preview.videoPlayerPath) preview.closeAllPreviews();
      preview.setVideoPlayerPath(entry.path);
    } else if (isImage) {
      if (!preview.previewImagePath) preview.closeAllPreviews();
      preview.handlePreviewImage(entry.path, false, placeholder);
    } else if (isPsb) {
      preview.closeAllPreviews();
      if (isMac) {
        tauriCommands.quickLook(entry.path).catch(console.error);
      } else {
        preview.handlePreviewImage(entry.path, false, placeholder);
      }
    } else if (isJson) {
      if (!preview.previewJsonPath) preview.closeAllPreviews();
      preview.handlePreviewJson(entry.path);
    } else if (isMd) {
      if (!preview.previewMdPath) preview.closeAllPreviews();
      preview.handlePreviewMd(entry.path);
    } else if (/\.fbx$/i.test(entry.name)) {
      preview.closeAllPreviews();
      preview.setFbxPreviewPath(entry.path);
    } else if (/\.(hwp|hwpx)$/i.test(entry.name)) {
      if (!preview.hwpPreviewPath) preview.closeAllPreviews();
      preview.setHwpPreviewPath(entry.path);
    } else if (codePreviewExts.has(ext)) {
      preview.closeAllPreviews();
      preview.setCodePreviewPath(entry.path);
    } else if (isText) {
      if (!preview.previewTextPath) preview.closeAllPreviews();
      preview.handlePreviewText(entry.path);
    } else if (isMac && !entry.is_dir) {
      preview.closeAllPreviews();
      tauriCommands.quickLook(entry.path).catch(console.error);
    }
  }, [codePreviewExts, isMac, preview, textPreviewExts, thumbnailSize]);

  const openEntry = useCallback(async (entry: FileEntry) => {
    if (entry.is_dir) {
      onNavigateTo(entry.path);
      return;
    }

    if (entry.file_type === 'archive' && isBrowsableArchiveFilePath(entry.path)) {
      onOpenArchiveEntry(entry.path);
      return;
    }

    const isVirtualArchiveEntry = isArchiveVirtualPath(entry.path);
    if (entry.file_type === 'video' && !isVirtualArchiveEntry) {
      preview.setVideoPlayerPath(entry.path);
      return;
    }

    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'json') {
      preview.handlePreviewJson(entry.path);
      return;
    }

    try {
      await tauriCommands.openFolder(entry.path);
    } catch (error) {
      console.error('파일 열기 실패:', error);
    }
  }, [onNavigateTo, onOpenArchiveEntry, preview]);

  return {
    previewFile,
    openEntry,
  };
}

interface UsePreviewPrewarmOptions {
  selectedPaths: string[];
  entries: FileEntry[];
  isMac: boolean;
}

// 선택된 PSD의 미리보기 composite(끝부분 부분 읽기, ~0.5MB)를 백그라운드로 미리 데움.
// → 스페이스바 미리보기를 캐시 HIT로 즉시 표시. 저우선 큐라 폴더 이동 시 자동 취소된다.
export function usePreviewPrewarm({ selectedPaths, entries, isMac }: UsePreviewPrewarmOptions) {
  useEffect(() => {
    if (selectedPaths.length !== 1) return;
    const path = selectedPaths[0];
    const isPsd = /\.psd$/i.test(path);
    const isPsb = /\.psb$/i.test(path);
    // 맥에서 PSB는 QuickLook으로 미리보기하므로 composite 프리워밍이 불필요.
    if (!isPsd && !(isPsb && !isMac)) return;
    const entry = entries.find(e => e.path === path);
    if (!entry || entry.is_dir) return;

    let cancelFn: (() => void) | null = null;
    // 화살표로 빠르게 넘길 때 매 항목 프리워밍하지 않도록 짧게 디바운스.
    const timer = setTimeout(() => {
      const { promise, cancel } = queuedInvokeLow<boolean>('prewarm_psd_preview', { path, size: 1280 });
      cancelFn = cancel;
      promise.catch(() => {});
    }, 250);

    return () => {
      clearTimeout(timer);
      if (cancelFn) cancelFn();
    };
  }, [selectedPaths, entries, isMac]);
}

export function usePreviewAutoRefresh({
  preview,
  selectedPaths,
  entries,
  previewFile,
}: UsePreviewAutoRefreshOptions) {
  useEffect(() => {
    if (!preview.isAnyPreviewOpen || selectedPaths.length !== 1) return;
    if (preview.videoPlayerPath) return;
    const entry = entries.find(item => item.path === selectedPaths[0]);
    if (!entry) return;
    if (entry.is_dir) {
      preview.closeAllPreviews();
      return;
    }
    previewFile(entry);
  }, [entries, preview, previewFile, selectedPaths]);
}
