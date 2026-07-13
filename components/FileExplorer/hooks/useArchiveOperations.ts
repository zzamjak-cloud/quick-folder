import { useCallback, useRef, useState } from 'react';
import type { FileEntry } from '../../../types';
import type { TranslationKey } from '../../../utils/i18n';
import { getFileName, getPathSeparator } from '../../../utils/pathUtils';
import { tauriCommands } from '../../../utils/tauriCommands';

interface UseArchiveOperationsConfig {
  currentPath: string | null;
  entries: FileEntry[];
  ensureWritableContext: (paths?: string[]) => boolean;
  loadDirectory: (path: string) => Promise<void>;
  showCopyToast: (message: string, duration?: number) => void;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: TranslationKey) => string;
  formatToast: (key: TranslationKey, values: Record<string, string | number>) => string;
}

export function useArchiveOperations({
  currentPath,
  entries,
  ensureWritableContext,
  loadDirectory,
  showCopyToast,
  setError,
  t,
  formatToast,
}: UseArchiveOperationsConfig) {
  const [extractingZipPaths, setExtractingZipPaths] = useState<Set<string>>(() => new Set());
  const pendingExtractSelectRef = useRef<string[]>([]);

  const handleCompressZip = useCallback(async (paths: string[]) => {
    if (paths.length === 0 || !currentPath) return;
    if (!ensureWritableContext(paths)) return;
    const sep = getPathSeparator(currentPath);
    const firstName = getFileName(paths[0]);
    const base = paths.length === 1 ? firstName.replace(/\.[^.]+$/, '') : (getFileName(currentPath) || 'archive');
    const zipPath = `${currentPath}${sep}${base}.zip`;
    try {
      await tauriCommands.compressToZip(paths, zipPath);
      loadDirectory(currentPath);
    } catch (error) {
      console.error('압축 실패:', error);
    }
  }, [currentPath, ensureWritableContext, loadDirectory]);

  const handleExtractZip = useCallback(async (paths: string[]) => {
    if (paths.length === 0 || !currentPath) return;
    if (!ensureWritableContext(paths)) return;
    const sep = getPathSeparator(currentPath);
    setExtractingZipPaths(prev => {
      const next = new Set(prev);
      paths.forEach(path => next.add(path));
      return next;
    });
    showCopyToast(paths.length === 1
      ? formatToast('toast.extractingZipSingle', { fileName: getFileName(paths[0]) })
      : formatToast('toast.extractingZipMulti', { count: paths.length }), 3000);
    try {
      const createdDirs: string[] = [];
      const existingNames = new Set(entries.map(entry => entry.name));
      let totalFailed = 0;
      for (const zipPath of paths) {
        const fileName = getFileName(zipPath);
        const baseName = fileName.replace(/\.zip$/i, '');
        let counter = 2;
        let folderName = baseName;
        while (existingNames.has(folderName)) {
          folderName = `${baseName} (${counter})`;
          counter++;
        }
        existingNames.add(folderName);
        const destDir = `${currentPath}${sep}${folderName}`;
        const result = await tauriCommands.extractZip(zipPath, destDir);
        createdDirs.push(result.destDir || destDir);
        if (result.failed.length > 0) {
          totalFailed += result.failed.length;
          console.warn(`압축 해제 일부 실패 (${fileName}):`, result.failed);
        }
        setExtractingZipPaths(prev => {
          const next = new Set(prev);
          next.delete(zipPath);
          return next;
        });
      }
      pendingExtractSelectRef.current = createdDirs;
      await loadDirectory(currentPath);
      showCopyToast(totalFailed > 0
        ? formatToast('toast.extractZipCompleteWithFailed', { count: totalFailed })
        : t('toast.extractZipComplete'));
    } catch (error) {
      pendingExtractSelectRef.current = [];
      console.error('압축 풀기 실패:', error);
      setError(`압축 풀기 실패: ${error}`);
    } finally {
      setExtractingZipPaths(prev => {
        const next = new Set(prev);
        let changed = false;
        paths.forEach(path => {
          if (next.delete(path)) changed = true;
        });
        return changed ? next : prev;
      });
    }
  }, [currentPath, entries, ensureWritableContext, loadDirectory, setError, showCopyToast, formatToast, t]);

  return {
    handleCompressZip,
    handleExtractZip,
    extractingZipPaths,
    pendingExtractSelectRef,
  };
}
