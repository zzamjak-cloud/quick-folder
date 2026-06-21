import { useCallback, useEffect, useMemo } from 'react';
import type { FileEntry } from '../../../types';
import { tauriCommands } from '../../../utils/tauriCommands';
import { isArchiveVirtualPath, isBrowsableArchiveFilePath } from '../../../utils/pathUtils';
import type { PreviewState } from './usePreview';

interface UsePreviewRoutingOptions {
  preview: PreviewState;
  isMac: boolean;
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
      preview.handlePreviewImage(entry.path);
    } else if (isPsb) {
      preview.closeAllPreviews();
      if (isMac) {
        tauriCommands.quickLook(entry.path).catch(console.error);
      } else {
        preview.handlePreviewImage(entry.path);
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
  }, [codePreviewExts, isMac, preview, textPreviewExts]);

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
