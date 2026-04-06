import { invoke, Channel } from '@tauri-apps/api/core';

/** Rust copy_items_with_progress → WebView (camelCase) */
export type CopyProgressInfo = {
  percent: number;
  doneFiles: number;
  totalFiles: number;
  currentName: string;
};

/**
 * 파일 단위 진행률(0~100%)을 수신하는 복사 (클라우드 드라이브 등).
 * 남은 시간 추정은 네트워크 변동으로 부정확해 제공하지 않음.
 */
export async function runCopyWithProgress(
  sources: string[],
  dest: string,
  overwrite: boolean,
  onProgress: (info: CopyProgressInfo) => void,
): Promise<void> {
  const channel = new Channel<CopyProgressInfo>();
  channel.onmessage = (msg: CopyProgressInfo) => {
    const m = msg as CopyProgressInfo & { done_files?: number; total_files?: number; current_name?: string };
    onProgress({
      percent: m.percent,
      doneFiles: m.doneFiles ?? m.done_files ?? 0,
      totalFiles: m.totalFiles ?? m.total_files ?? 0,
      currentName: m.currentName ?? m.current_name ?? '',
    });
  };
  await invoke('copy_items_with_progress', {
    sources,
    dest,
    overwrite,
    onProgress: channel,
  });
}
