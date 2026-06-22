import { invoke } from '@tauri-apps/api/core';

export type TauriCommandPriority = 'direct' | 'normal' | 'low';
type TauriInvoke = typeof invoke;

export interface QueuedTauriCommand<T> {
  promise: Promise<T>;
  cancel: () => void;
}

interface QueueItem {
  cmd: string;
  args: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  cancelled: boolean;
}

const MAX_CONCURRENT = 6;
// 저우선(썸네일)은 별도 레인. QuickLook/File Provider 같은 네트워크 대기형이라
// CPU가 아니라 I/O를 기다리므로 동시성을 높게 잡아도 안전(CPU 합성은 Rust heavy-op 퍼밋이 제한).
// 클라우드 폴더 워밍은 파일당 네트워크 왕복이 지배적이라 동시 다운로드 수가 곧 처리량.
const MAX_LOW_CONCURRENT = 24;
const MAX_QUEUE_SIZE = 200;
// 저우선(썸네일) 큐 상한. 오버플로우 시 가장 오래된(=먼저 보인 상단) 항목부터 제거되므로,
// 한 폴더의 가시 카드 수(+프리페치 마진)를 넉넉히 수용해 보이는 썸네일 요청이 버려지지 않게 한다.
const MAX_LOW_QUEUE_SIZE = 512;

let running = 0;
let lowRunning = 0;
const queue: QueueItem[] = [];
const lowQueue: QueueItem[] = [];
let invokeImpl: TauriInvoke = invoke;

function normalizeTauriError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

function cancelledError() {
  return new Error('cancelled');
}

export function isTauriCommandCancelled(error: unknown): boolean {
  return error instanceof Error && error.message === 'cancelled';
}

function startItem(item: QueueItem, isLow: boolean) {
  if (isLow) lowRunning++;
  else running++;
  invokeImpl(item.cmd, item.args)
    .then(result => {
      if (!item.cancelled) item.resolve(result);
      else item.reject(cancelledError());
    })
    .catch(error => {
      item.reject(normalizeTauriError(error));
    })
    .finally(() => {
      if (isLow) lowRunning--;
      else running--;
      processNext();
    });
}

function processNext() {
  // 일반 우선순위와 저우선(썸네일)은 독립 레인으로 처리해 서로를 굶기지 않는다.
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()!;
    if (item.cancelled) {
      item.reject(cancelledError());
      continue;
    }
    startItem(item, false);
  }
  while (lowRunning < MAX_LOW_CONCURRENT && lowQueue.length > 0) {
    const item = lowQueue.shift()!;
    if (item.cancelled) {
      item.reject(cancelledError());
      continue;
    }
    startItem(item, true);
  }
}

function enqueueTauriCommand<T>(
  targetQueue: QueueItem[],
  maxQueueSize: number,
  overflowMessage: string,
  cmd: string,
  args: Record<string, unknown> = {},
): QueuedTauriCommand<T> {
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

  const cancel = () => {
    item.cancelled = true;
  };

  while (targetQueue.length >= maxQueueSize) {
    const oldest = targetQueue.shift();
    if (oldest) {
      oldest.cancelled = true;
      oldest.reject(new Error(overflowMessage));
    }
  }

  targetQueue.push(item);
  processNext();

  return { promise, cancel };
}

export function queuedInvoke<T>(
  cmd: string,
  args: Record<string, unknown> = {},
): QueuedTauriCommand<T> {
  return enqueueTauriCommand<T>(queue, MAX_QUEUE_SIZE, 'queue overflow', cmd, args);
}

export function queuedInvokeLow<T>(
  cmd: string,
  args: Record<string, unknown> = {},
): QueuedTauriCommand<T> {
  return enqueueTauriCommand<T>(lowQueue, MAX_LOW_QUEUE_SIZE, 'low queue overflow', cmd, args);
}

export function invokeTauriCommand<T>(
  cmd: string,
  args: Record<string, unknown> = {},
  options: { priority?: TauriCommandPriority } = {},
): Promise<T> {
  const priority = options.priority ?? 'direct';
  if (priority === 'normal') return queuedInvoke<T>(cmd, args).promise;
  if (priority === 'low') return queuedInvokeLow<T>(cmd, args).promise;
  return invokeImpl<T>(cmd, args).catch(error => {
    throw normalizeTauriError(error);
  });
}

export function cancelQueuedTauriCommands(): void {
  for (const item of queue) {
    item.cancelled = true;
    item.reject(cancelledError());
  }
  queue.length = 0;

  for (const item of lowQueue) {
    item.cancelled = true;
    item.reject(cancelledError());
  }
  lowQueue.length = 0;
}

export const cancelAllQueued = cancelQueuedTauriCommands;

export function __setTauriInvokeForTest(nextInvoke: TauriInvoke): () => void {
  const previousInvoke = invokeImpl;
  invokeImpl = nextInvoke;
  return () => {
    invokeImpl = previousInvoke;
  };
}

export function __resetTauriInvokeForTest(): void {
  cancelQueuedTauriCommands();
  running = 0;
  lowRunning = 0;
  queue.length = 0;
  lowQueue.length = 0;
  invokeImpl = invoke;
}
