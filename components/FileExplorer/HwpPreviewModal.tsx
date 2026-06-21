import React, { useEffect, useState } from 'react';
import { ThemeVars } from './types';
import { getFileName } from '../../utils/pathUtils';
import { tauriCommands } from '../../utils/tauriCommands';

interface HwpPreviewModalProps {
  path: string;
  themeVars: ThemeVars | null;
  onClose: () => void;
}

/**
 * 한글파일(.hwp / .hwpx) 미리보기 모달.
 * Rust(hwarang)로 HWP 5.0·HWPX 본문 텍스트 추출 후 표시. 실패 시 안내·기본 앱 열기.
 * ESC / 외부 클릭 / Space 로 닫기
 */
export default function HwpPreviewModal({ path, themeVars, onClose }: HwpPreviewModalProps) {
  const fileName = getFileName(path);
  const isBinaryHwp = /\.hwp$/i.test(fileName);

  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ESC / Space 로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose]);

  // 본문 텍스트 추출
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setText(null);
    setError(null);
    tauriCommands.extractHwpText(path)
      .then((result) => {
        if (cancelled) return;
        setText(result);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(typeof e === 'string' ? e : (e?.message ?? '텍스트 추출 실패'));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [path]);

  // OS 기본 앱(한컴 한글 등)으로 열기
  const openInDefaultApp = async () => {
    try {
      await tauriCommands.openFolder(path);
    } catch (e) {
      console.error('기본 앱 열기 실패:', e);
    }
  };

  const text_color = themeVars?.text ?? '#e5e7eb';
  const muted = themeVars?.muted ?? '#94a3b8';
  const surface = themeVars?.surface ?? '#111827';
  const surface2 = themeVars?.surface2 ?? '#1f2937';
  const border = themeVars?.border ?? '#334155';
  const accent = themeVars?.accent ?? '#3b82f6';

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      data-hwp-preview="true"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{
          backgroundColor: surface2,
          border: `1px solid ${border}`,
          width: '70vw',
          maxWidth: 860,
          height: '85vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-4 py-2 shrink-0"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <span className="text-sm font-medium truncate" style={{ color: text_color }}>
            📄 {fileName}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={openInDefaultApp}
              className="px-2.5 py-1 text-xs rounded-md transition-colors hover:opacity-80"
              style={{
                backgroundColor: accent,
                color: '#000',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
              }}
              title="OS 기본 앱(한컴 한글 등)으로 열기"
            >
              기본 앱으로 열기
            </button>
            <button
              onClick={onClose}
              className="text-lg px-2 hover:opacity-70"
              style={{ color: muted, background: 'none', border: 'none', cursor: 'pointer' }}
              title="닫기 (ESC)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-auto" style={{ backgroundColor: surface }}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-sm" style={{ color: muted }}>로딩 중...</span>
            </div>
          ) : error ? (
            <div
              className="flex flex-col items-center justify-center h-full px-6 text-center gap-3"
              style={{ color: muted }}
            >
              <div style={{ fontSize: 36, lineHeight: 1 }}>📑</div>
              <div className="text-sm" style={{ color: '#fbbf24' }}>{error}</div>
              {isBinaryHwp && (
                <div className="text-xs" style={{ color: muted }}>
                  미리보기가 안 되는 경우 암호 보호·손상 파일일 수 있습니다.
                  <br />“기본 앱으로 열기”로 한컴 한글에서 확인해주세요.
                </div>
              )}
            </div>
          ) : (
            <pre
              className="px-6 py-5 text-sm leading-relaxed whitespace-pre-wrap break-words"
              style={{
                color: text_color,
                userSelect: 'text',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}
            >
              {text}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
