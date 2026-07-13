import { useCallback, useState } from 'react';
import { getFileName } from '../../../utils/pathUtils';
import { tauriCommands } from '../../../utils/tauriCommands';
import type { useUndoStack } from './useUndoStack';
import type { TranslationKey } from '../../../utils/i18n';

type OperationProgress = { type: string; current: number; total: number; itemLabel?: string };

interface UseDeleteOperationsConfig {
  currentPath: string | null;
  ensureWritableContext: (paths?: string[]) => boolean;
  loadDirectory: (path: string) => Promise<void>;
  undoStack: ReturnType<typeof useUndoStack>;
  setSelectedPaths: React.Dispatch<React.SetStateAction<string[]>>;
  setOperationProgress: React.Dispatch<React.SetStateAction<OperationProgress | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  showCopyToast: (message: string, duration?: number) => void;
  formatToast: (key: TranslationKey, values: Record<string, string | number>) => string;
  t: (key: TranslationKey) => string;
}

function getDeleteItemLabel(paths: string[]) {
  return paths.length === 1
    ? getFileName(paths[0])
    : `${getFileName(paths[0])} 외 ${paths.length - 1}개`;
}

export function useDeleteOperations({
  currentPath,
  ensureWritableContext,
  loadDirectory,
  undoStack,
  setSelectedPaths,
  setOperationProgress,
  setError,
  showCopyToast,
  formatToast,
  t,
}: UseDeleteOperationsConfig) {
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState<{ paths: string[] } | null>(null);
  const [elevatedDeleteConfirm, setElevatedDeleteConfirm] = useState<{ paths: string[] } | null>(null);

  const handleDelete = useCallback(async (paths: string[], permanent = false) => {
    if (paths.length === 0) return;
    if (!ensureWritableContext(paths)) return;
    if (permanent) {
      setPermanentDeleteConfirm({ paths: [...paths] });
      return;
    }
    try {
      setOperationProgress({
        type: t('toast.operation.delete'),
        current: 0,
        total: paths.length,
        itemLabel: getDeleteItemLabel(paths),
      });
      await tauriCommands.deleteItems(paths, true);
      setOperationProgress(null);
      undoStack.push({ type: 'delete', paths: [...paths], directory: currentPath ?? '', useTrash: true });
      setSelectedPaths(prev => prev.filter(path => !paths.includes(path)));
      window.dispatchEvent(new CustomEvent('qf-tab-delete', { detail: { paths } }));
      if (currentPath) loadDirectory(currentPath);
    } catch (error) {
      setOperationProgress(null);
      const errMsg = String(error);
      if (errMsg.includes('Access is denied') || errMsg.includes('액세스가 거부') || errMsg.includes('Permission denied')) {
        setElevatedDeleteConfirm({ paths: [...paths] });
      } else {
        console.error('삭제 실패:', error);
        showCopyToast(formatToast('toast.deleteFailed', { message: String(error) }), 3000);
      }
    }
  }, [currentPath, ensureWritableContext, loadDirectory, setError, setOperationProgress, setSelectedPaths, showCopyToast, formatToast, undoStack, t]);

  const executePermanentDelete = useCallback(async () => {
    if (!permanentDeleteConfirm) return;
    const { paths } = permanentDeleteConfirm;
    if (!ensureWritableContext(paths)) {
      setPermanentDeleteConfirm(null);
      return;
    }
    setPermanentDeleteConfirm(null);
    try {
      setOperationProgress({
        type: t('toast.operation.permanentDelete'),
        current: 0,
        total: paths.length,
        itemLabel: getDeleteItemLabel(paths),
      });
      await tauriCommands.deleteItems(paths, false);
      setOperationProgress(null);
      setSelectedPaths(prev => prev.filter(path => !paths.includes(path)));
      window.dispatchEvent(new CustomEvent('qf-tab-delete', { detail: { paths } }));
      if (currentPath) loadDirectory(currentPath);
    } catch (error) {
      setOperationProgress(null);
      const errMsg = String(error);
      if (errMsg.includes('Access is denied') || errMsg.includes('액세스가 거부') || errMsg.includes('Permission denied')) {
        setElevatedDeleteConfirm({ paths: [...paths] });
      } else {
        console.error('영구삭제 실패:', error);
        showCopyToast(formatToast('toast.permanentDeleteFailed', { message: String(error) }), 3000);
      }
    }
  }, [currentPath, ensureWritableContext, loadDirectory, permanentDeleteConfirm, setError, setOperationProgress, setSelectedPaths, showCopyToast, formatToast, t]);

  const executeElevatedDelete = useCallback(async () => {
    if (!elevatedDeleteConfirm) return;
    const { paths } = elevatedDeleteConfirm;
    if (!ensureWritableContext(paths)) {
      setElevatedDeleteConfirm(null);
      return;
    }
    setElevatedDeleteConfirm(null);
    try {
      await tauriCommands.deleteItemsElevated(paths);
      setSelectedPaths(prev => prev.filter(path => !paths.includes(path)));
      window.dispatchEvent(new CustomEvent('qf-tab-delete', { detail: { paths } }));
      if (currentPath) loadDirectory(currentPath);
    } catch (error) {
      console.error('관리자 권한 삭제 실패:', error);
      showCopyToast(formatToast('toast.elevatedDeleteFailed', { message: String(error) }), 3000);
    }
  }, [currentPath, elevatedDeleteConfirm, ensureWritableContext, loadDirectory, showCopyToast, formatToast, setSelectedPaths]);

  return {
    handleDelete,
    permanentDeleteConfirm,
    setPermanentDeleteConfirm,
    executePermanentDelete,
    elevatedDeleteConfirm,
    setElevatedDeleteConfirm,
    executeElevatedDelete,
  };
}
