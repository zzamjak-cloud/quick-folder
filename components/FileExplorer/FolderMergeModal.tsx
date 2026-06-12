import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FolderMergeAnalysis, FolderMergeConflictMode, FolderMergeRequest } from '../../types';
import { ThemeVars } from './types';
import { FolderInput, Loader2 } from 'lucide-react';
import { formatSize } from './fileUtils';
import { getBtnBase } from './ui/modalStyles';

interface FolderMergeModalProps {
  request: FolderMergeRequest;
  onClose: () => void;
  onComplete: () => void;
  themeVars: ThemeVars | null;
}

function formatDate(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

function FileList({
  items,
  emptyLabel,
  themeVars,
  highlight,
}: {
  items: string[];
  emptyLabel: string;
  themeVars: ThemeVars | null;
  highlight?: boolean;
}) {
  const textColor = themeVars?.text ?? '#e5e7eb';
  const mutedColor = themeVars?.muted ?? '#94a3b8';
  const borderColor = themeVars?.border ?? '#334155';
  const surface = themeVars?.surface ?? '#111827';

  if (items.length === 0) {
    return (
      <div className="text-xs py-2 px-3" style={{ color: mutedColor }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      className="text-xs rounded-md px-3 py-2 max-h-[140px] overflow-y-auto"
      style={{
        backgroundColor: surface,
        border: `1px solid ${borderColor}`,
      }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          className="py-0.5 truncate font-mono"
          style={{ color: highlight ? (themeVars?.accent ?? '#3b82f6') : textColor }}
          title={item}
        >
          {item}
        </div>
      ))}
    </div>
  );
}

export default function FolderMergeModal({
  request,
  onClose,
  onComplete,
  themeVars,
}: FolderMergeModalProps) {
  const [analysis, setAnalysis] = useState<FolderMergeAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictMode, setConflictMode] = useState<FolderMergeConflictMode>('rename');

  const textColor = themeVars?.text ?? '#e5e7eb';
  const mutedColor = themeVars?.muted ?? '#94a3b8';
  const borderColor = themeVars?.border ?? '#334155';
  const btnBase = getBtnBase(themeVars);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<FolderMergeAnalysis>('analyze_folder_merge', {
          source: request.sourcePath,
          destParent: request.destParent,
        });
        if (!cancelled) setAnalysis(result);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [request.sourcePath, request.destParent]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !merging) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [merging, onClose]);

  const handleMerge = useCallback(async () => {
    setMerging(true);
    setError(null);
    try {
      await invoke('merge_folders', {
        source: request.sourcePath,
        destParent: request.destParent,
        conflictMode,
        isMove: request.action === 'cut' || request.action === 'move',
      });
      onComplete();
    } catch (e) {
      setError(String(e));
      setMerging(false);
    }
  }, [request, conflictMode, onComplete]);

  const conflictPaths = analysis?.conflicts.map(c => c.relativePath) ?? [];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 10000 }}
    >
      <div
        className="rounded-lg shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
        style={{
          backgroundColor: themeVars?.surface2 ?? '#1e293b',
          border: `1px solid ${borderColor}`,
        }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center gap-2 px-4 py-3 shrink-0"
          style={{ borderBottom: `1px solid ${borderColor}` }}
        >
          <FolderInput size={18} style={{ color: themeVars?.accent ?? '#3b82f6' }} />
          <span className="text-sm font-medium truncate" style={{ color: textColor }}>
            폴더 병합 — {analysis?.folderName ?? getFolderName(request.sourcePath)}
          </span>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8" style={{ color: mutedColor }}>
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">폴더 내용 비교 중...</span>
            </div>
          )}

          {error && (
            <div className="text-xs rounded-md px-3 py-2" style={{ color: '#f87171', backgroundColor: 'rgba(248,113,113,0.1)' }}>
              {error}
            </div>
          )}

          {analysis && !loading && (
            <>
              <p className="text-xs" style={{ color: mutedColor }}>
                <span style={{ color: textColor }}>{analysis.folderName}</span> 폴더를 병합합니다.
                충돌 {analysis.conflicts.length}개 · 소스에만 {analysis.onlySource.length}개 · 대상에만 {analysis.onlyDest.length}개
              </p>

              {/* 충돌 파일 */}
              <section>
                <h3 className="text-xs font-medium mb-1.5" style={{ color: textColor }}>
                  양쪽에 모두 있는 파일 ({analysis.conflicts.length})
                </h3>
                {analysis.conflicts.length > 0 ? (
                  <div
                    className="text-xs rounded-md overflow-hidden max-h-[160px] overflow-y-auto"
                    style={{ border: `1px solid ${borderColor}`, backgroundColor: themeVars?.surface ?? '#111827' }}
                  >
                    <table className="w-full">
                      <thead>
                        <tr style={{ color: mutedColor, borderBottom: `1px solid ${borderColor}` }}>
                          <th className="text-left px-3 py-1.5 font-normal">경로</th>
                          <th className="text-right px-2 py-1.5 font-normal w-20">소스</th>
                          <th className="text-right px-2 py-1.5 font-normal w-20">대상</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.conflicts.map(c => (
                          <tr key={c.relativePath} style={{ color: textColor, borderBottom: `1px solid ${borderColor}22` }}>
                            <td className="px-3 py-1 truncate font-mono" title={c.relativePath}>{c.relativePath}</td>
                            <td className="px-2 py-1 text-right whitespace-nowrap" style={{ color: mutedColor }}>
                              {formatSize(c.sourceSize)}
                            </td>
                            <td className="px-2 py-1 text-right whitespace-nowrap" style={{ color: mutedColor }}>
                              {formatSize(c.destSize)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <FileList items={[]} emptyLabel="충돌하는 파일이 없습니다." themeVars={themeVars} />
                )}
              </section>

              {/* 소스에만 */}
              <section>
                <h3 className="text-xs font-medium mb-1.5" style={{ color: textColor }}>
                  소스에만 있는 파일 ({analysis.onlySource.length})
                </h3>
                <FileList
                  items={analysis.onlySource}
                  emptyLabel="없음 — 모두 대상에 존재합니다."
                  themeVars={themeVars}
                />
              </section>

              {/* 대상에만 */}
              <section>
                <h3 className="text-xs font-medium mb-1.5" style={{ color: textColor }}>
                  대상에만 있는 파일 ({analysis.onlyDest.length})
                </h3>
                <FileList
                  items={analysis.onlyDest}
                  emptyLabel="없음"
                  themeVars={themeVars}
                />
              </section>

              {/* 충돌 처리 방식 */}
              {analysis.conflicts.length > 0 && (
                <section
                  className="rounded-md px-3 py-3 space-y-2"
                  style={{ backgroundColor: themeVars?.surface ?? '#111827', border: `1px solid ${borderColor}` }}
                >
                  <h3 className="text-xs font-medium" style={{ color: textColor }}>
                    충돌 파일 처리
                  </h3>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="conflictMode"
                      checked={conflictMode === 'rename'}
                      onChange={() => setConflictMode('rename')}
                      className="mt-0.5"
                    />
                    <span className="text-xs" style={{ color: textColor }}>
                      이름 뒤에 (1) 붙여 복사
                      <span className="block" style={{ color: mutedColor }}>예: file.txt → file (1).txt</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="conflictMode"
                      checked={conflictMode === 'overwrite_newer'}
                      onChange={() => setConflictMode('overwrite_newer')}
                      className="mt-0.5"
                    />
                    <span className="text-xs" style={{ color: textColor }}>
                      최신 파일로 덮어쓰기
                      <span className="block" style={{ color: mutedColor }}>
                        수정 시각이 더 최근인 쪽을 유지 ({formatDate(analysis.conflicts[0]?.sourceModified ?? 0)} 등 비교)
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="conflictMode"
                      checked={conflictMode === 'skip'}
                      onChange={() => setConflictMode('skip')}
                      className="mt-0.5"
                    />
                    <span className="text-xs" style={{ color: textColor }}>
                      충돌 파일만 제외
                      <span className="block" style={{ color: mutedColor }}>
                        {conflictPaths.length}개 충돌 파일은 건너뛰고 나머지만 병합
                      </span>
                    </span>
                  </label>
                </section>
              )}
            </>
          )}
        </div>

        {/* 푸터 */}
        <div
          className="flex justify-end gap-2 px-4 py-3 shrink-0"
          style={{ borderTop: `1px solid ${borderColor}` }}
        >
          <button style={btnBase} onClick={onClose} disabled={merging}>
            취소
          </button>
          <button
            style={{
              ...btnBase,
              backgroundColor: themeVars?.accent ?? '#3b82f6',
              color: '#fff',
              border: 'none',
              opacity: merging || loading || !analysis ? 0.5 : 1,
            }}
            onClick={handleMerge}
            disabled={merging || loading || !analysis}
          >
            {merging ? '병합 중...' : '병합'}
          </button>
        </div>
      </div>
    </div>
  );
}

function getFolderName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}
