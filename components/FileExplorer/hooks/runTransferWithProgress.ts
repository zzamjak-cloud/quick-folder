import { Channel } from '@tauri-apps/api/core';
import {
  applyTransferProgress,
  failTransferJob,
  startTransferJob,
  type TransferOperation,
  type TransferQueueProgress,
} from '../../../stores/taskQueueStore';
import { invokeTauriCommand as invoke } from '../../../utils/tauriInvoke';

/**
 * 작업 큐 패널과 연동되는 복사/이동 (파일별 진행률 + 전체 카운트).
 * Rust spawn_blocking에서 백그라운드 처리.
 */
export async function runTransferWithProgress(
  operation: TransferOperation,
  sources: string[],
  dest: string,
  overwrite: boolean,
  label: string,
): Promise<void> {
  const jobId = startTransferJob(operation, label);
  const channel = new Channel<TransferQueueProgress>();
  channel.onmessage = (msg) => {
    applyTransferProgress(jobId, msg);
  };
  try {
    await invoke('transfer_items_with_progress', {
      operation,
      sources,
      dest,
      overwrite,
      onProgress: channel,
    });
  } catch (e) {
    failTransferJob(jobId, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** 하위 호환: 복사 전용 래퍼 */
export async function runCopyWithProgress(
  sources: string[],
  dest: string,
  overwrite: boolean,
  label: string,
): Promise<void> {
  return runTransferWithProgress('copy', sources, dest, overwrite, label);
}
