import React, { useState, useEffect, useMemo } from 'react';
import { X, GitCompare, Loader2 } from 'lucide-react';
import { ThemeVars } from './types';
import { getFileName } from '../../utils/pathUtils';
import { readTextFileWithTimeout, DEFAULT_READ_TEXT_TIMEOUT_MS } from '../../utils/readTextFileWithTimeout';
import { computeSideBySideDiff, summarizeDiff, type AlignedDiffRow } from '../../utils/lineDiff';
import { isDarkHexColor } from '../../hooks/useThemeManagement';

const MAX_BYTES = 1048576;

interface DiffViewerModalProps {
  leftPath: string;
  rightPath: string;
  themeVars: ThemeVars | null;
  onClose: () => void;
}

function rowBackground(kind: AlignedDiffRow['kind'], side: 'left' | 'right', isLight: boolean): string {
  if (kind === 'equal') return 'transparent';
  if (kind === 'remove') return side === 'left' ? (isLight ? 'rgba(248,113,113,0.22)' : 'rgba(127,29,29,0.55)') : 'transparent';
  if (kind === 'add') return side === 'right' ? (isLight ? 'rgba(74,222,128,0.22)' : 'rgba(20,83,45,0.55)') : 'transparent';
  // change
  return side === 'left'
    ? (isLight ? 'rgba(248,113,113,0.22)' : 'rgba(127,29,29,0.55)')
    : (isLight ? 'rgba(74,222,128,0.22)' : 'rgba(20,83,45,0.55)');
}

export default function DiffViewerModal({ leftPath, rightPath, themeVars, onClose }: DiffViewerModalProps) {
  const [leftText, setLeftText] = useState<string | null>(null);
  const [rightText, setRightText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isLightTheme = !isDarkHexColor(themeVars?.bg ?? themeVars?.surface ?? '#0f172a');
  const codeSurface = isLightTheme ? '#f8fafc' : '#1e1e1e';
  const codeText = isLightTheme ? '#1f2937' : '#d4d4d4';
  const codeMuted = isLightTheme ? '#64748b' : (themeVars?.muted ?? '#94a3b8');
  const codeBorder = themeVars?.border ?? '#334155';
  const headerBg = themeVars?.surface2 ?? themeVars?.surface ?? '#1e293b';

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [left, right] = await Promise.all([
          readTextFileWithTimeout(leftPath, MAX_BYTES, DEFAULT_READ_TEXT_TIMEOUT_MS),
          readTextFileWithTimeout(rightPath, MAX_BYTES, DEFAULT_READ_TEXT_TIMEOUT_MS),
        ]);
        if (cancelled) return;
        setLeftText(left);
        setRightText(right);
      } catch (e) {
        if (cancelled) return;
        setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [leftPath, rightPath]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const rows = useMemo(() => {
    if (leftText == null || rightText == null) return [];
    return computeSideBySideDiff(leftText, rightText);
  }, [leftText, rightText]);

  const summary = useMemo(() => summarizeDiff(rows), [rows]);
  const leftName = getFileName(leftPath);
  const rightName = getFileName(rightPath);
  const gutterWidth = Math.max(3, String(rows.length).length + 1);

  return (
    <div
      className="fixed inset-0 z-[10001] flex flex-col"
      style={{ backgroundColor: themeVars?.bg ?? '#0f172a' }}
    >
      {/* 헤더 */}
      <div
        className="flex shrink-0 items-center gap-3 px-4 py-2.5"
        style={{ backgroundColor: headerBg, borderBottom: `1px solid ${codeBorder}` }}
      >
        <GitCompare size={16} style={{ color: codeMuted, flexShrink: 0 }} />
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <div className="text-[10px]" style={{ color: codeMuted }}>왼쪽</div>
            <div className="text-xs truncate" style={{ color: themeVars?.text ?? '#f8fafc' }} title={leftPath}>
              {leftName}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[10px]" style={{ color: codeMuted }}>오른쪽</div>
            <div className="text-xs truncate" style={{ color: themeVars?.text ?? '#f8fafc' }} title={rightPath}>
              {rightName}
            </div>
          </div>
        </div>
        {!loading && !error && (
          <div className="text-[10px] shrink-0" style={{ color: codeMuted }}>
            {summary.changed > 0 && <span>변경 {summary.changed} </span>}
            {summary.removed > 0 && <span>삭제 {summary.removed} </span>}
            {summary.added > 0 && <span>추가 {summary.added}</span>}
            {summary.changed + summary.removed + summary.added === 0 && '차이 없음'}
          </div>
        )}
        <button className="p-1 hover:opacity-70 shrink-0" style={{ color: codeMuted }} onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-auto" style={{ backgroundColor: codeSurface }}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 h-full text-xs" style={{ color: codeMuted }}>
            <Loader2 size={16} className="animate-spin" />
            파일을 불러오는 중...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-xs px-6 text-center" style={{ color: '#f87171' }}>
            {error}
          </div>
        ) : (
          <div className="min-w-full font-mono text-[12px] leading-5">
            {rows.map((row, i) => (
              <div key={i} className="flex min-w-full">
                {/* 왼쪽 패널 */}
                <div
                  className="flex flex-1 min-w-0 border-r"
                  style={{
                    borderColor: `${codeBorder}66`,
                    backgroundColor: rowBackground(row.kind, 'left', isLightTheme),
                  }}
                >
                  <span
                    className="shrink-0 select-none text-right px-2"
                    style={{
                      width: `${gutterWidth + 2}ch`,
                      color: codeMuted,
                      backgroundColor: isLightTheme ? 'rgba(148,163,184,0.12)' : 'rgba(0,0,0,0.25)',
                    }}
                  >
                    {row.left?.lineNum ?? ''}
                  </span>
                  <pre
                    className="flex-1 min-w-0 px-2 whitespace-pre overflow-x-auto"
                    style={{ color: codeText, margin: 0 }}
                  >
                    {row.left?.text ?? ''}
                  </pre>
                </div>
                {/* 오른쪽 패널 */}
                <div
                  className="flex flex-1 min-w-0"
                  style={{ backgroundColor: rowBackground(row.kind, 'right', isLightTheme) }}
                >
                  <span
                    className="shrink-0 select-none text-right px-2"
                    style={{
                      width: `${gutterWidth + 2}ch`,
                      color: codeMuted,
                      backgroundColor: isLightTheme ? 'rgba(148,163,184,0.12)' : 'rgba(0,0,0,0.25)',
                    }}
                  >
                    {row.right?.lineNum ?? ''}
                  </span>
                  <pre
                    className="flex-1 min-w-0 px-2 whitespace-pre overflow-x-auto"
                    style={{ color: codeText, margin: 0 }}
                  >
                    {row.right?.text ?? ''}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 하단 힌트 */}
      <div
        className="shrink-0 px-4 py-1.5 text-[10px] flex gap-4"
        style={{ borderTop: `1px solid ${codeBorder}`, color: codeMuted, backgroundColor: headerBg }}
      >
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: isLightTheme ? 'rgba(248,113,113,0.35)' : 'rgba(127,29,29,0.7)' }} />
          삭제/변경 (왼쪽)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: isLightTheme ? 'rgba(74,222,128,0.35)' : 'rgba(20,83,45,0.7)' }} />
          추가/변경 (오른쪽)
        </span>
        <span>Escape 닫기</span>
      </div>
    </div>
  );
}
