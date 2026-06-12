import { useSyncExternalStore } from 'react';
import { v4 as uuidv4 } from 'uuid';

export type TransferFileStatus = 'pending' | 'active' | 'completed' | 'failed';
export type TransferJobStatus = 'scanning' | 'running' | 'completed' | 'failed';
export type TransferOperation = 'copy' | 'move';

export interface TransferFileItem {
  id: number;
  name: string;
  status: TransferFileStatus;
  percent: number;
}

export interface TransferJob {
  id: string;
  operation: TransferOperation;
  label: string;
  status: TransferJobStatus;
  doneCount: number;
  totalCount: number;
  files: TransferFileItem[];
  activeId: number | null;
  error?: string;
  createdAt: number;
}

/** Rust transfer_items_with_progress → WebView */
export interface TransferQueueProgress {
  phase: string;
  operation: string;
  doneFiles: number;
  totalFiles: number;
  currentName: string;
  percent: number;
  activeId?: number | null;
  files?: TransferFileItem[] | null;
}

type Listener = () => void;

interface TaskQueueSnapshot {
  jobs: TransferJob[];
  panelExpanded: boolean;
  panelVisible: boolean;
}

let jobs: TransferJob[] = [];
const listeners = new Set<Listener>();
let panelExpanded = true;
let panelVisible = false;

/** 모든 작업 종료 후 패널 자동 닫기 대기 시간(ms) */
export const TASK_QUEUE_AUTO_DISMISS_MS = 1500;

// useSyncExternalStore: getSnapshot은 동일 상태에서 같은 참조를 반환해야 함
let cachedSnapshot: TaskQueueSnapshot = {
  jobs,
  panelExpanded,
  panelVisible,
};

function refreshSnapshot() {
  cachedSnapshot = { jobs, panelExpanded, panelVisible };
}

function emit() {
  refreshSnapshot();
  listeners.forEach((l) => l());
}

function getSnapshot() {
  return cachedSnapshot;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTaskQueue() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setTaskQueuePanelExpanded(expanded: boolean) {
  panelExpanded = expanded;
  emit();
}

export function hasActiveTransferJobs() {
  return jobs.some((j) => j.status === 'scanning' || j.status === 'running');
}

/** 진행 중 작업이 없으면 큐 패널을 닫고 목록을 비움 */
export function dismissTaskQueuePanel() {
  if (hasActiveTransferJobs()) {
    panelExpanded = false;
  } else {
    jobs = [];
    panelVisible = false;
    panelExpanded = true;
  }
  emit();
}

export function startTransferJob(
  operation: TransferOperation,
  label: string,
): string {
  const id = uuidv4();
  jobs = [
    {
      id,
      operation,
      label,
      status: 'scanning',
      doneCount: 0,
      totalCount: 0,
      files: [],
      activeId: null,
      createdAt: Date.now(),
    },
    ...jobs,
  ];
  panelVisible = true;
  panelExpanded = true;
  emit();
  return id;
}

function normalizeProgress(msg: TransferQueueProgress & Record<string, unknown>): TransferQueueProgress {
  return {
    phase: String(msg.phase ?? ''),
    operation: String(msg.operation ?? 'copy'),
    doneFiles: Number(msg.doneFiles ?? msg.done_files ?? 0),
    totalFiles: Number(msg.totalFiles ?? msg.total_files ?? 0),
    currentName: String(msg.currentName ?? msg.current_name ?? ''),
    percent: Number(msg.percent ?? 0),
    activeId: (msg.activeId ?? msg.active_id ?? null) as number | null,
    files: (msg.files ?? null) as TransferFileItem[] | null | undefined,
  };
}

export function applyTransferProgress(jobId: string, raw: TransferQueueProgress) {
  const msg = normalizeProgress(raw as TransferQueueProgress & Record<string, unknown>);
  jobs = jobs.map((job) => {
    if (job.id !== jobId) return job;

    let files = job.files;
    if (msg.files && msg.files.length > 0) {
      files = msg.files.map((f) => ({
        id: f.id,
        name: f.name,
        status: (f.status as TransferFileStatus) || 'pending',
        percent: f.percent ?? 0,
      }));
    } else if (files.length > 0) {
      files = files.map((f) => {
        if (msg.activeId != null && f.id === msg.activeId) {
          return { ...f, status: 'active' as const, percent: Math.max(f.percent, 50) };
        }
        if (msg.activeId != null && f.id < msg.activeId) {
          return { ...f, status: 'completed' as const, percent: 100 };
        }
        if (msg.activeId == null && f.id < msg.doneFiles) {
          return { ...f, status: 'completed' as const, percent: 100 };
        }
        if (msg.activeId == null && f.id === msg.doneFiles && msg.phase === 'transferring') {
          return f;
        }
        return f;
      });
    }

    const phase = msg.phase;
    let status: TransferJobStatus = job.status;
    if (phase === 'scanning') status = 'scanning';
    else if (phase === 'transferring') status = 'running';
    else if (phase === 'done') status = 'completed';

    return {
      ...job,
      status,
      doneCount: msg.doneFiles,
      totalCount: msg.totalFiles,
      files,
      activeId: msg.activeId ?? null,
    };
  });
  emit();
}

export function failTransferJob(jobId: string, error: string) {
  jobs = jobs.map((job) =>
    job.id === jobId ? { ...job, status: 'failed' as const, error } : job,
  );
  emit();
}

/** 진행 중 → 완료 → 대기 순으로 정렬 (완료는 최하단) */
export function sortTransferFiles(files: TransferFileItem[], activeId: number | null): TransferFileItem[] {
  const order = (f: TransferFileItem) => {
    if (f.status === 'active' || (activeId != null && f.id === activeId)) return 0;
    if (f.status === 'pending') return 1;
    if (f.status === 'failed') return 2;
    return 3;
  };
  return [...files].sort((a, b) => {
    const d = order(a) - order(b);
    return d !== 0 ? d : a.id - b.id;
  });
}
