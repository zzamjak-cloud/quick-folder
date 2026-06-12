import React, { useMemo, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, X, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { ThemeVars } from './FileExplorer/types';
import {
  useTaskQueue,
  sortTransferFiles,
  setTaskQueuePanelExpanded,
  dismissTaskQueuePanel,
  hasActiveTransferJobs,
  TASK_QUEUE_AUTO_DISMISS_MS,
} from '../stores/taskQueueStore';

interface TaskQueuePanelProps {
  themeVars: ThemeVars | null;
}

export default function TaskQueuePanel({ themeVars }: TaskQueuePanelProps) {
  const { jobs, panelExpanded, panelVisible } = useTaskQueue();
  const listRef = useRef<HTMLDivElement>(null);

  const activeJob = jobs.find((j) => j.status === 'scanning' || j.status === 'running') ?? jobs[0];
  const runningCount = jobs.filter((j) => j.status === 'scanning' || j.status === 'running').length;

  const sortedFiles = useMemo(() => {
    if (!activeJob) return [];
    return sortTransferFiles(activeJob.files, activeJob.activeId);
  }, [activeJob]);

  // 진행 중 파일이 보이도록 스크롤 최상단 유지
  useEffect(() => {
    if (panelExpanded && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [panelExpanded, activeJob?.activeId, activeJob?.doneCount]);

  // 모든 전송이 끝나면 잠시 후 패널 자동 닫기
  useEffect(() => {
    if (!panelVisible || jobs.length === 0) return;
    if (hasActiveTransferJobs()) return;

    const timer = window.setTimeout(() => {
      dismissTaskQueuePanel();
    }, TASK_QUEUE_AUTO_DISMISS_MS);

    return () => window.clearTimeout(timer);
  }, [jobs, panelVisible]);

  if (!panelVisible || jobs.length === 0) return null;

  const accent = themeVars?.accent ?? '#4ade80';
  const surface = themeVars?.surface2 ?? '#1e293b';
  const border = themeVars?.border ?? '#334155';
  const text = themeVars?.text ?? '#e5e7eb';
  const muted = themeVars?.muted ?? '#94a3b8';

  const opLabel = activeJob?.operation === 'move' ? '이동' : '복사';
  const headerCount =
    activeJob && activeJob.totalCount > 0
      ? `${activeJob.doneCount} / ${activeJob.totalCount}`
      : activeJob?.status === 'scanning'
        ? '목록 준비 중…'
        : '';

  return (
    <div
      className="fixed bottom-4 right-4 z-[10000] flex flex-col shadow-2xl rounded-xl overflow-hidden"
      style={{
        width: panelExpanded ? 360 : 280,
        maxHeight: panelExpanded ? 420 : undefined,
        backgroundColor: surface,
        border: `1px solid ${border}`,
        pointerEvents: 'auto',
      }}
    >
      {/* 헤더: 전체 진행 (3/100) */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
        style={{ borderBottom: panelExpanded ? `1px solid ${border}` : undefined }}
        onClick={() => setTaskQueuePanelExpanded(!panelExpanded)}
      >
        <Loader2
          size={16}
          className={runningCount > 0 ? 'animate-spin flex-shrink-0' : 'flex-shrink-0 opacity-0'}
          style={{ color: accent }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate" style={{ color: text }}>
            파일 전송
            {headerCount && (
              <span className="ml-1.5 font-normal" style={{ color: accent }}>
                {headerCount}
              </span>
            )}
          </div>
          {activeJob && (
            <div className="text-[10px] truncate mt-0.5" style={{ color: muted }}>
              {opLabel} · {activeJob.label}
              {jobs.length > 1 && ` 외 ${jobs.length - 1}건`}
            </div>
          )}
        </div>
        <button
          type="button"
          className="p-1 rounded hover:opacity-70"
          style={{ color: muted, background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            setTaskQueuePanelExpanded(!panelExpanded);
          }}
          title={panelExpanded ? '접기' : '펼치기'}
        >
          {panelExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <button
          type="button"
          className="p-1 rounded hover:opacity-70"
          style={{ color: muted, background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            dismissTaskQueuePanel();
          }}
          title="닫기"
        >
          <X size={14} />
        </button>
      </div>

      {panelExpanded && activeJob && (
        <>
          {/* 전체 진행 바 */}
          {activeJob.totalCount > 0 && (
            <div className="px-3 pt-2">
              <div className="h-1 w-full rounded overflow-hidden" style={{ backgroundColor: `${accent}25` }}>
                <div
                  className="h-full rounded transition-[width] duration-150"
                  style={{
                    width: `${Math.min(100, (activeJob.doneCount / activeJob.totalCount) * 100)}%`,
                    backgroundColor: accent,
                  }}
                />
              </div>
            </div>
          )}

          {/* 파일 목록 */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto px-2 py-2 space-y-1"
            style={{ maxHeight: 300 }}
          >
            {activeJob.status === 'scanning' && sortedFiles.length === 0 && (
              <div className="flex items-center gap-2 px-2 py-3 text-xs" style={{ color: muted }}>
                <Loader2 size={14} className="animate-spin" />
                파일 목록을 준비하는 중…
              </div>
            )}
            {sortedFiles.map((file) => {
              const isActive = file.status === 'active';
              const isDone = file.status === 'completed';
              const isFailed = file.status === 'failed';
              const pct = isDone ? 100 : isActive ? Math.max(file.percent, 30) : 0;
              return (
                <div
                  key={file.id}
                  className="rounded-lg px-2.5 py-2"
                  style={{
                    backgroundColor: isActive ? `${accent}12` : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {isDone && <CheckCircle2 size={12} style={{ color: accent }} className="flex-shrink-0" />}
                    {isActive && <Loader2 size={12} className="animate-spin flex-shrink-0" style={{ color: accent }} />}
                    {isFailed && <AlertCircle size={12} className="flex-shrink-0 text-red-400" />}
                    {!isDone && !isActive && !isFailed && (
                      <span className="w-3 h-3 flex-shrink-0 rounded-full border" style={{ borderColor: muted }} />
                    )}
                    <span
                      className="text-[11px] truncate flex-1"
                      style={{ color: isDone ? muted : text }}
                      title={file.name}
                    >
                      {file.name}
                    </span>
                    {isActive && (
                      <span className="text-[10px] flex-shrink-0" style={{ color: accent }}>
                        진행 중
                      </span>
                    )}
                  </div>
                  <div className="h-0.5 w-full rounded overflow-hidden ml-5" style={{ backgroundColor: `${accent}20` }}>
                    {isActive ? (
                      <div
                        className="h-full rounded animate-[qf-queue-pulse_1.2s_ease-in-out_infinite]"
                        style={{ width: '40%', backgroundColor: accent }}
                      />
                    ) : (
                      <div
                        className="h-full rounded transition-[width] duration-150"
                        style={{ width: `${pct}%`, backgroundColor: isFailed ? '#f87171' : accent }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </>
      )}

      <style>{`
        @keyframes qf-queue-pulse {
          0%, 100% { transform: translateX(0); opacity: 0.5; }
          50% { transform: translateX(120%); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
