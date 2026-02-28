/**
 * Rust invoke 동시성 제한 큐
 * - 프론트엔드: 최대 MAX_CONCURRENT개만 동시 Rust 호출
 * - Rust 백엔드: HeavyOpPermit으로 추가 동시성 제한 (PSD 제거 후 4개로 완화)
 * - 대기 큐 최대 크기 제한: 넘치면 오래된 요청부터 자동 취소
 * - cancelAll()로 대기 중인 모든 요청 즉시 취소 (줌/디렉토리 이동 시)
 */

import { invoke } from '@tauri-apps/api/core';

// 네트워크 파일시스템(Google Drive 등) 대응: 동시성 3개로 제한
// tokio 워커 스레드 차단 최소화 + UI 응답성 유지
const MAX_CONCURRENT = 3;
const MAX_QUEUE_SIZE = 200; // 대기 큐 최대 크기 (넘치면 오래된 것부터 취소)

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

  // reject을 캐치하여 uncaught rejection 방지
  promise.catch(() => {});

  const cancel = () => {
    item.cancelled = true;
  };

  // 대기 큐 크기 제한: 넘치면 가장 오래된 대기 요청 취소
  while (queue.length >= MAX_QUEUE_SIZE) {
    const oldest = queue.shift();
    if (oldest) {
      oldest.cancelled = true;
      oldest.reject(new Error('queue overflow'));
    }
  }

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
    item.reject(new Error('cancelled'));
  }
  queue.length = 0;
}
