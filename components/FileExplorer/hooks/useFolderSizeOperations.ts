import { useCallback, useState } from 'react';
import { getFileName, isArchiveVirtualPath } from '../../../utils/pathUtils';
import { tauriCommands } from '../../../utils/tauriCommands';
import { formatSize } from '../fileUtils';

type FolderSizeResponse = {
  bytes: string;
  file_count?: number;
  fileCount?: number;
  folder_count?: number;
  folderCount?: number;
  children?: FolderSizeChildResponse[];
};

type FolderSizeChildResponse = {
  name: string;
  path: string;
  is_dir?: boolean;
  isDir?: boolean;
  bytes: string;
  file_count?: number;
  fileCount?: number;
  folder_count?: number;
  folderCount?: number;
};

export type FolderSizeChildInfo = {
  name: string;
  path: string;
  isDir: boolean;
  bytes: number;
  bytesText: string;
  fileCount: number;
  folderCount: number;
  percent: number;
};

export type FolderSizeDialogState = {
  status: 'loading' | 'ready' | 'error';
  path: string;
  folderName: string;
  sizeText?: string;
  bytes?: string;
  fileCount?: number;
  folderCount?: number;
  children?: FolderSizeChildInfo[];
  error?: string;
};

interface UseFolderSizeOperationsConfig {
  archiveReadonlyMessage: string;
  showCopyToast: (message: string, duration?: number) => void;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useFolderSizeOperations({
  archiveReadonlyMessage,
  showCopyToast,
  setError,
}: UseFolderSizeOperationsConfig) {
  const [folderSizeDialog, setFolderSizeDialog] = useState<FolderSizeDialogState | null>(null);

  const closeFolderSizeDialog = useCallback(() => {
    setFolderSizeDialog(null);
  }, []);

  const handleInspectFolderSize = useCallback(async (path: string) => {
    if (isArchiveVirtualPath(path)) {
      showCopyToast(archiveReadonlyMessage, 2200);
      setError(archiveReadonlyMessage);
      return;
    }
    const folderName = getFileName(path) || path;
    setFolderSizeDialog({ status: 'loading', path, folderName });
    try {
      const info = await tauriCommands.calculateFolderSize<FolderSizeResponse>(path);
      const bytes = Number(info.bytes);
      const sizeText = Number.isFinite(bytes) ? formatSize(bytes, false) : `${info.bytes} bytes`;
      const fileCount = info.file_count ?? info.fileCount ?? 0;
      const folderCount = info.folder_count ?? info.folderCount ?? 0;
      const children = (info.children ?? [])
        .map((child): FolderSizeChildInfo => {
          const childBytes = Number(child.bytes);
          const normalizedBytes = Number.isFinite(childBytes) ? childBytes : 0;
          return {
            name: child.name,
            path: child.path,
            isDir: child.is_dir ?? child.isDir ?? false,
            bytes: normalizedBytes,
            bytesText: formatSize(normalizedBytes, false),
            fileCount: child.file_count ?? child.fileCount ?? 0,
            folderCount: child.folder_count ?? child.folderCount ?? 0,
            percent: Number.isFinite(bytes) && bytes > 0 ? Math.min(100, (normalizedBytes / bytes) * 100) : 0,
          };
        })
        .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
      setFolderSizeDialog({
        status: 'ready',
        path,
        folderName,
        sizeText,
        bytes: info.bytes,
        fileCount,
        folderCount,
        children,
      });
    } catch (error) {
      console.error('폴더 용량 확인 실패:', error);
      setFolderSizeDialog({
        status: 'error',
        path,
        folderName,
        error: String(error),
      });
    }
  }, [archiveReadonlyMessage, setError, showCopyToast]);

  return {
    folderSizeDialog,
    closeFolderSizeDialog,
    handleInspectFolderSize,
  };
}
