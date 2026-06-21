import { FolderMergeRequest } from '../types';
import { getFileName, getPathSeparator } from './pathUtils';
import { invokeTauriCommand as invoke } from './tauriInvoke';

/**
 * 단일 폴더가 같은 이름의 기존 폴더와 병합되는 경우인지 판별.
 * 해당하면 FolderMergeRequest 반환, 아니면 null.
 */
export async function detectFolderMergeScenario(
  sources: string[],
  destParent: string,
  duplicates: string[],
  action: 'copy' | 'cut' | 'move',
): Promise<FolderMergeRequest | null> {
  if (sources.length !== 1 || duplicates.length !== 1) return null;

  const sourcePath = sources[0];
  const folderName = duplicates[0];
  if (getFileName(sourcePath) !== folderName) return null;

  const sep = getPathSeparator(destParent);
  const destFolder = `${destParent}${sep}${folderName}`;

  try {
    const [isSourceDir, isDestDir] = await Promise.all([
      invoke<boolean>('is_directory', { path: sourcePath }),
      invoke<boolean>('is_directory', { path: destFolder }),
    ]);
    if (!isSourceDir || !isDestDir) return null;
  } catch {
    return null;
  }

  return { sourcePath, destParent, action };
}
