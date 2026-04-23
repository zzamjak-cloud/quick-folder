import React, { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import 'highlight.js/styles/vs2015.css';
import { ThemeVars } from './types';
import { getFileName } from '../../utils/pathUtils';

// 마크다운 언어 로딩 가드 (중복 등록 방지)
let mdLangRegistered = false;
async function ensureMarkdownLangRegistered(): Promise<void> {
  if (mdLangRegistered) return;
  try {
    const mod = await import('highlight.js/lib/languages/markdown');
    hljs.registerLanguage('markdown', mod.default);
    mdLangRegistered = true;
  } catch { /* ignore — 언어 로딩 실패 시 평문 폴백 */ }
}

interface MarkdownPreviewModalProps {
  path: string;
  content: string | null;
  error: string | null;
  loading: boolean;
  themeVars: ThemeVars | null;
  onClose: () => void;
  onEdit: () => void;
}

type ViewMode = 'preview' | 'source';

const VIEW_MODE_KEY = 'qf_md_preview_view_mode';

function loadInitialMode(): ViewMode {
  try {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === 'preview' || saved === 'source') return saved;
  } catch {/* ignore */}
  return 'preview';
}

export default function MarkdownPreviewModal({
  path, content, error, loading, themeVars, onClose, onEdit,
}: MarkdownPreviewModalProps) {
  const [mode, setMode] = useState<ViewMode>(loadInitialMode);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // 모드 변경 시 localStorage 저장
  useEffect(() => {
    try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch {/* ignore */}
  }, [mode]);

  // ESC / Space 키로 닫기 (본문에 input 없음 — 공백 입력 충돌 없음)
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

  // 마크다운 → HTML 변환 (미리보기 모드)
  const html = useMemo(() => {
    if (!content) return '';
    try {
      return marked.parse(content, { async: false }) as string;
    } catch {
      return '';
    }
  }, [content]);

  // 마크다운 원본에 highlight.js 구문 강조 적용 (Source 모드)
  const [highlightedSource, setHighlightedSource] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    if (!content) { setHighlightedSource(''); return; }
    (async () => {
      await ensureMarkdownLangRegistered();
      if (cancelled) return;
      try {
        if (mdLangRegistered) {
          const highlighted = hljs.highlight(content, { language: 'markdown', ignoreIllegals: true }).value;
          setHighlightedSource(highlighted);
        } else {
          // 언어 로딩 실패: HTML 이스케이프만 적용
          const escaped = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          setHighlightedSource(escaped);
        }
      } catch {
        const escaped = content
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        setHighlightedSource(escaped);
      }
    })();
    return () => { cancelled = true; };
  }, [content]);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch (e) {
      console.error('복사 실패:', e);
    }
  };

  const fileName = getFileName(path);
  const accent = themeVars?.accent ?? '#3b82f6';
  const bg = themeVars?.bg ?? '#0f172a';
  const surface = themeVars?.surface ?? '#111827';
  const surface2 = themeVars?.surface2 ?? '#1f2937';
  const text = themeVars?.text ?? '#e5e7eb';
  const muted = themeVars?.muted ?? '#94a3b8';
  const border = themeVars?.border ?? '#334155';

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      data-md-preview="true"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{
          backgroundColor: surface2,
          border: `1px solid ${border}`,
          width: '70vw', maxWidth: 860, height: '85vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-4 py-2 shrink-0"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <span className="text-sm font-medium truncate" style={{ color: text }}>
            📄 {fileName}
          </span>

          <div className="flex items-center gap-2">
            {/* Preview / Markdown 탭 */}
            <div
              className="flex rounded-md overflow-hidden"
              style={{ border: `1px solid ${border}` }}
            >
              <button
                onClick={() => setMode('preview')}
                className="px-2.5 py-1 text-xs transition-colors"
                style={{
                  backgroundColor: mode === 'preview' ? accent : 'transparent',
                  color: mode === 'preview' ? '#000' : text,
                  fontWeight: mode === 'preview' ? 600 : 400,
                  cursor: 'pointer',
                  border: 'none',
                }}
                title="렌더링된 미리보기"
              >
                Preview
              </button>
              <button
                onClick={() => setMode('source')}
                className="px-2.5 py-1 text-xs transition-colors"
                style={{
                  backgroundColor: mode === 'source' ? accent : 'transparent',
                  color: mode === 'source' ? '#000' : text,
                  fontWeight: mode === 'source' ? 600 : 400,
                  cursor: 'pointer',
                  border: 'none',
                  borderLeft: `1px solid ${border}`,
                }}
                title="마크다운 원본"
              >
                Markdown
              </button>
            </div>

            {/* 편집 버튼 */}
            <button
              onClick={onEdit}
              className="px-2.5 py-1 text-xs rounded-md transition-colors hover:opacity-80"
              style={{
                backgroundColor: surface,
                color: text,
                border: `1px solid ${border}`,
                cursor: 'pointer',
              }}
              title="편집기로 열기"
            >
              편집
            </button>

            {/* 복사 버튼 */}
            <button
              onClick={handleCopy}
              disabled={!content}
              className="px-2.5 py-1 text-xs rounded-md transition-colors hover:opacity-80"
              style={{
                backgroundColor: surface,
                color: text,
                border: `1px solid ${border}`,
                cursor: content ? 'pointer' : 'not-allowed',
                opacity: content ? 1 : 0.5,
              }}
              title="전체 마크다운 복사"
            >
              {copyFeedback ? '✓ 복사됨' : '복사'}
            </button>

            {/* 닫기 */}
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

        {/* 콘텐츠 */}
        <div
          className="flex-1 overflow-auto"
          style={{ backgroundColor: bg }}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-sm" style={{ color: muted }}>로딩 중...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full px-6">
              <span className="text-sm text-center" style={{ color: '#f87171' }}>{error}</span>
            </div>
          ) : mode === 'preview' ? (
            <div
              className="md-preview-content px-6 py-5"
              style={{ color: text, userSelect: 'text' }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <pre
              className="md-source-content px-6 py-5 text-xs leading-relaxed whitespace-pre-wrap break-words"
              style={{
                color: text,
                userSelect: 'text',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}
              dangerouslySetInnerHTML={{ __html: highlightedSource }}
            />
          )}
        </div>
      </div>

      {/* 렌더링된 MD 스타일 + 선택 허용 */}
      <style>{`
        .md-preview-content, .md-preview-content * {
          user-select: text !important;
          -webkit-user-select: text !important;
        }
        .md-preview-content h1 { font-size: 1.8em; font-weight: 700; margin: 0.6em 0 0.4em; border-bottom: 1px solid ${border}; padding-bottom: 0.2em; }
        .md-preview-content h2 { font-size: 1.45em; font-weight: 700; margin: 0.6em 0 0.35em; border-bottom: 1px solid ${border}; padding-bottom: 0.15em; }
        .md-preview-content h3 { font-size: 1.2em; font-weight: 700; margin: 0.5em 0 0.3em; }
        .md-preview-content h4 { font-size: 1.05em; font-weight: 700; margin: 0.5em 0 0.3em; }
        .md-preview-content p { margin: 0.5em 0; line-height: 1.7; }
        .md-preview-content ul { list-style-type: disc; padding-left: 1.5em; margin: 0.4em 0; }
        .md-preview-content ol { list-style-type: decimal; padding-left: 1.5em; margin: 0.4em 0; }
        .md-preview-content li { margin: 0.2em 0; line-height: 1.6; }
        .md-preview-content a { color: ${accent}; text-decoration: underline; }
        .md-preview-content strong { font-weight: 700; }
        .md-preview-content em { font-style: italic; }
        .md-preview-content blockquote {
          border-left: 3px solid ${accent};
          padding: 0.2em 0.8em;
          margin: 0.6em 0;
          color: ${muted};
          background: ${surface};
          border-radius: 0 4px 4px 0;
        }
        .md-preview-content code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          background: ${surface};
          padding: 0.1em 0.35em;
          border-radius: 3px;
          font-size: 0.9em;
        }
        .md-preview-content pre {
          background: ${surface};
          border: 1px solid ${border};
          border-radius: 6px;
          padding: 12px 14px;
          margin: 0.6em 0;
          overflow-x: auto;
        }
        .md-preview-content pre code {
          background: transparent;
          padding: 0;
          border-radius: 0;
          font-size: 0.9em;
        }
        .md-preview-content hr {
          border: none;
          border-top: 1px solid ${border};
          margin: 1.2em 0;
        }
        .md-preview-content table {
          border-collapse: collapse;
          margin: 0.6em 0;
          font-size: 0.95em;
        }
        .md-preview-content th, .md-preview-content td {
          border: 1px solid ${border};
          padding: 0.35em 0.7em;
        }
        .md-preview-content th { background: ${surface}; font-weight: 700; }
        .md-preview-content img { max-width: 100%; height: auto; }
        .md-preview-content input[type="checkbox"] { margin-right: 0.4em; }
      `}</style>
    </div>
  );
}
