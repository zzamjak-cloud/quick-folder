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
const MAX_QUEUE_SIZE = 200;
const MAX_LOW_QUEUE_SIZE = 256;

let running = 0;
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

function processNext() {
  while (running < MAX_CONCURRENT && (queue.length > 0 || lowQueue.length > 0)) {
    const item = (queue.length > 0 ? queue.shift() : lowQueue.shift())!;

    if (item.cancelled) {
      item.reject(cancelledError());
      continue;
    }

    running++;
    invokeImpl(item.cmd, item.args)
      .then(result => {
        if (!item.cancelled) item.resolve(result);
        else item.reject(cancelledError());
      })
      .catch(error => {
        item.reject(normalizeTauriError(error));
      })
      .finally(() => {
        running--;
        processNext();
      });
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
  queue.length = 0;
  lowQueue.length = 0;
  invokeImpl = invoke;
}
