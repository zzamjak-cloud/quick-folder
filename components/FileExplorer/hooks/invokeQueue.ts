/**
 * Rust invoke 동시성 제한 큐
 * - 프론트엔드: 최대 MAX_CONCURRENT개만 동시 Rust 호출
 * - Rust 백엔드: HeavyOpPermit으로 추가 동시성 제한 (PSD 제거 후 4개로 완화)
 * - 대기 큐 최대 크기 제한: 넘치면 오래된 요청부터 자동 취소
 * - cancelAll()로 대기 중인 모든 요청 즉시 취소 (줌/디렉토리 이동 시)
 */

import { invoke } from '@tauri-apps/api/core';

// 네트워크 파일시스템(Google Drive 등): I/O 대기형 썸네일(QuickLook/Shell)을 더 많이 병렬화해
// 첫 진입 체감 속도 향상. tokio blocking pool이 충분히 크므로 6 동시성은 안전.
const MAX_CONCURRENT = 6;
const MAX_QUEUE_SIZE = 200; // 대기 큐 최대 크기 (넘치면 오래된 것부터 취소)

interface QueueItem {
  cmd: string;
  args: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  cancelled: boolean;
}

// 저우선순위 큐 최대 크기 (프리페치·프리워밍 — 넘치면 오래된 것부터 취소)
// 폴더 진입 시 프리워밍 배치(최대 ~120건)를 수용할 수 있도록 넉넉히 설정
const MAX_LOW_QUEUE_SIZE = 256;

let running = 0;
const queue: QueueItem[] = [];
// 프리페치 등 저우선순위 요청 — 일반 큐가 빌 때만 처리되어 썸네일 로딩을 방해하지 않음
const lowQueue: QueueItem[] = [];

function processNext() {
  while (running < MAX_CONCURRENT && (queue.length > 0 || lowQueue.length > 0)) {
    // 일반 큐 우선, 비어 있을 때만 저우선순위 큐 처리
    const item = (queue.length > 0 ? queue.shift() : lowQueue.shift())!;

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
 * 저우선순위 invoke (프리페치 전용)
 * 일반 큐가 빌 때만 실행되어 화면에 보이는 썸네일 로딩을 방해하지 않는다.
 */
export function queuedInvokeLow<T>(
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
  promise.catch(() => {});

  const cancel = () => { item.cancelled = true; };

  // 저우선순위 큐는 작게 유지: 넘치면 가장 오래된 프리페치부터 폐기
  while (lowQueue.length >= MAX_LOW_QUEUE_SIZE) {
    const oldest = lowQueue.shift();
    if (oldest) {
      oldest.cancelled = true;
      oldest.reject(new Error('low queue overflow'));
    }
  }

  lowQueue.push(item);
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
  for (const item of lowQueue) {
    item.cancelled = true;
    item.reject(new Error('cancelled'));
  }
  lowQueue.length = 0;
}
