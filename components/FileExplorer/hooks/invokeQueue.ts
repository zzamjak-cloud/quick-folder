/**
 * Rust invoke 동시성 제한 큐
 * - 최대 MAX_CONCURRENT개만 동시 실행, 나머지는 대기
 * - cancelAll()로 대기 중인 모든 요청 즉시 취소 (줌/디렉토리 이동 시)
 * - 실행 중인 요청은 완료될 때까지 유지 (Rust 측 취소 불가)
 */

import { invoke } from '@tauri-apps/api/core';

const MAX_CONCURRENT = 4;

interface QueueItem {
  cmd: string;
  args: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  cancelled: boolean;
}

let running = 0;
const queue: QueueItem[] = [];

function processNext() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()!;

    // 취소된 요청은 건너뜀
    if (item.cancelled) {
      item.reject(new Error('cancelled'));
      continue;
    }

    running++;
    invoke(item.cmd, item.args)
      .then(result => {
        if (!item.cancelled) item.resolve(result);
        else item.reject(new Error('cancelled'));
      })
      .catch(err => {
        item.reject(err);
      })
      .finally(() => {
        running--;
        processNext();
      });
  }
}

/**
 * 동시성 제한된 invoke 호출
 * 반환된 cancel 함수로 개별 요청 취소 가능
 */
export function queuedInvoke<T>(
  cmd: string,
  args: Record<string, unknown>,
): { promise: Promise<T>; cancel: () => void } {
  const item: QueueItem = {
    cmd,
    args,
    resolve: () => {},
    reject: () => {},
    cancelled: false,
  };

  const promise = new Promise<T>((resolve, reject) => {
    item.resolve = resolve as (value: unknown) => void;
    item.reject = reject;
  });

  const cancel = () => {
    item.cancelled = true;
  };

  queue.push(item);
  processNext();

  return { promise, cancel };
}

/**
 * 대기 큐 전체 취소 (줌 변경, 디렉토리 이동 시 호출)
 */
export function cancelAllQueued(): void {
  for (const item of queue) {
    item.cancelled = true;
  }
  queue.length = 0;
}
