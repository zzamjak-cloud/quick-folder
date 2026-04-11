import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Search, ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { ThemeVars } from './types';
import { getBaseName, getExtension } from '../../utils/pathUtils';

// highlight.js 코어만 임포트 (전체 번들 제외)
import hljs from 'highlight.js/lib/core';
import 'highlight.js/styles/vs2015.css';

// ──────────────────────────────────────────────
// 타입 정의
// ──────────────────────────────────────────────

interface CodePreviewModalProps {
  path: string;
  themeVars: ThemeVars;
  onClose: () => void;
}

// 폴딩 가능한 줄 정보 (중괄호 블록 기준)
interface FoldableBlock {
  startLine: number; // 0-based 인덱스
  endLine: number;   // 0-based 인덱스
}

// ──────────────────────────────────────────────
// 확장자 → highlight.js 언어 이름 매핑
// ──────────────────────────────────────────────
const EXT_TO_LANG: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'cpp',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  html: 'xml',
  xml: 'xml',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  md: 'markdown',
  sh: 'bash',
  bat: 'bash',
  ps1: 'powershell',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  r: 'r',
  sql: 'sql',
  scala: 'scala',
  dart: 'dart',
  lua: 'lua',
  shader: 'glsl',
  glsl: 'glsl',
  hlsl: 'glsl',
};

// 언어별 동적 임포트 맵
const LANG_IMPORTERS: Record<string, () => Promise<{ default: hljs.LanguageFn }>> = {
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  python: () => import('highlight.js/lib/languages/python'),
  rust: () => import('highlight.js/lib/languages/rust'),
  go: () => import('highlight.js/lib/languages/go'),
  java: () => import('highlight.js/lib/languages/java'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  css: () => import('highlight.js/lib/languages/css'),
  xml: () => import('highlight.js/lib/languages/xml'),
  json: () => import('highlight.js/lib/languages/json'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  ini: () => import('highlight.js/lib/languages/ini'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  bash: () => import('highlight.js/lib/languages/bash'),
  powershell: () => import('highlight.js/lib/languages/powershell'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  php: () => import('highlight.js/lib/languages/php'),
  swift: () => import('highlight.js/lib/languages/swift'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  r: () => import('highlight.js/lib/languages/r'),
  sql: () => import('highlight.js/lib/languages/sql'),
  scala: () => import('highlight.js/lib/languages/scala'),
  dart: () => import('highlight.js/lib/languages/dart'),
  lua: () => import('highlight.js/lib/languages/lua'),
  glsl: () => import('highlight.js/lib/languages/glsl'),
};

// 이미 등록된 언어 캐시
const registeredLangs = new Set<string>();

/**
 * highlight.js에 언어를 동적으로 등록한다 (한 번만 로드).
 */
async function ensureLangRegistered(langName: string): Promise<boolean> {
  if (registeredLangs.has(langName)) return true;
  const importer = LANG_IMPORTERS[langName];
  if (!importer) return false;
  try {
    const mod = await importer();
    hljs.registerLanguage(langName, mod.default);
    registeredLangs.add(langName);
    return true;
  } catch {
    return false;
  }
}

/**
 * 확장자로부터 언어 이름을 반환한다.
 */
function getLangFromPath(filePath: string): string | null {
  const ext = getExtension(filePath).replace(/^\./, '').toLowerCase();
  return EXT_TO_LANG[ext] ?? null;
}

// ──────────────────────────────────────────────
// 블록 폴딩 유틸리티
// ──────────────────────────────────────────────

/**
 * 코드 줄 배열을 분석하여 중괄호 기반 폴딩 블록을 찾는다.
 * 각 `{`가 있는 줄을 시작, 매칭되는 `}`가 있는 줄을 끝으로 본다.
 */
function computeFoldableBlocks(lines: string[]): Map<number, number> {
  // startLine → endLine 매핑
  const blockMap = new Map<number, number>();
  const stack: number[] = []; // 시작 줄 번호 스택

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 해당 줄의 { 개수와 } 개수 계산 (문자열/주석 내부도 단순 카운트)
    let opens = 0;
    let closes = 0;
    for (const ch of line) {
      if (ch === '{') opens++;
      else if (ch === '}') closes++;
    }

    // 여는 중괄호가 있으면 스택에 push
    for (let o = 0; o < opens; o++) {
      stack.push(i);
    }
    // 닫는 중괄호가 있으면 스택에서 pop하여 블록 완성
    for (let c = 0; c < closes; c++) {
      if (stack.length > 0) {
        const startLine = stack.pop()!;
        // 최소 2줄 이상인 블록만 폴딩 가능
        if (i > startLine + 1) {
          // 같은 시작줄에 여러 블록이 있으면 가장 큰 범위 우선
          if (!blockMap.has(startLine) || blockMap.get(startLine)! < i) {
            blockMap.set(startLine, i);
          }
        }
      }
    }
  }
  return blockMap;
}

// ──────────────────────────────────────────────
// 메인 컴포넌트
// ──────────────────────────────────────────────

export default function CodePreviewModal({ path, themeVars, onClose }: CodePreviewModalProps) {
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [highlightedLines, setHighlightedLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [langName, setLangName] = useState<string>('');

  // 폴딩 상태: 접혀있는 시작줄 번호 집합
  const [foldedStarts, setFoldedStarts] = useState<Set<number>>(new Set());
  // startLine → endLine 블록 맵
  const [blockMap, setBlockMap] = useState<Map<number, number>>(new Map());

  // 검색 상태
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  // 검색 매칭 줄 인덱스 목록 (0-based)
  const [matchLines, setMatchLines] = useState<number[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const codeContainerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  const fileName = getBaseName(path);

  // ── 파일 로드 및 구문 강조 ──
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // 파일 내용 읽기 (최대 1MB)
        const content = await invoke<string>('read_text_file', { path, maxBytes: 1048576 });
        if (cancelled) return;

        const lines = content.split('\n');
        setRawLines(lines);

        // 폴딩 블록 계산
        const map = computeFoldableBlocks(lines);
        setBlockMap(map);

        // 언어 감지 및 등록
        const lang = getLangFromPath(path);
        if (lang) {
          await ensureLangRegistered(lang);
          setLangName(lang);
        } else {
          setLangName('');
        }

        if (cancelled) return;

        // 전체 코드를 highlight.js로 강조 처리한 뒤 줄별로 분리
        let highlighted: string;
        if (lang && registeredLangs.has(lang)) {
          highlighted = hljs.highlight(content, { language: lang, ignoreIllegals: true }).value;
        } else {
          // 언어 불명 시 평문 HTML 이스케이프
          highlighted = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        }

        // highlight.js 결과를 줄 단위로 나눈다.
        // HTML 태그가 줄을 넘나들 수 있으므로 열린 태그를 추적하여 각 줄을 올바르게 닫는다.
        const hLines = splitHighlightedLines(highlighted);
        if (!cancelled) {
          setHighlightedLines(hLines);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [path]);

  // ── 검색 매칭 계산 ──
  useEffect(() => {
    if (!searchQuery.trim()) {
      setMatchLines([]);
      setSearchMatchIndex(0);
      return;
    }
    const q = searchQuery.toLowerCase();
    const matches: number[] = [];
    rawLines.forEach((line, i) => {
      if (line.toLowerCase().includes(q)) matches.push(i);
    });
    setMatchLines(matches);
    setSearchMatchIndex(0);
  }, [searchQuery, rawLines]);

  // ── 검색 결과 스크롤 ──
  useEffect(() => {
    if (matchLines.length === 0) return;
    const targetLine = matchLines[searchMatchIndex];
    const el = lineRefs.current[targetLine];
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [searchMatchIndex, matchLines]);

  // ── 키보드 이벤트 처리 ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+F: 검색 바 열기
      if (ctrl && e.code === 'KeyF') {
        e.preventDefault();
        e.stopPropagation();
        setSearchVisible(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return;
      }

      // ESC: 검색 바가 열려있으면 검색 바만 닫기, 아니면 모달 닫기
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (searchVisible) {
          setSearchVisible(false);
          setSearchQuery('');
        } else {
          onClose();
        }
        return;
      }

      // 검색 바가 열려있을 때 Enter/Shift+Enter로 탐색
      if (searchVisible && e.key === 'Enter' && matchLines.length > 0) {
        e.preventDefault();
        if (e.shiftKey) {
          // 이전 매칭
          setSearchMatchIndex(i => (i - 1 + matchLines.length) % matchLines.length);
        } else {
          // 다음 매칭
          setSearchMatchIndex(i => (i + 1) % matchLines.length);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [searchVisible, matchLines, onClose]);

  // ── 전체 접기 / 펼치기 ──
  const foldAll = useCallback(() => {
    setFoldedStarts(new Set(blockMap.keys()));
  }, [blockMap]);

  const unfoldAll = useCallback(() => {
    setFoldedStarts(new Set());
  }, []);

  // ── 개별 블록 토글 ──
  const toggleFold = useCallback((startLine: number) => {
    setFoldedStarts(prev => {
      const next = new Set(prev);
      if (next.has(startLine)) next.delete(startLine);
      else next.add(startLine);
      return next;
    });
  }, []);

  // ── 검색 탐색 버튼 ──
  const goToPrevMatch = () => {
    if (matchLines.length === 0) return;
    setSearchMatchIndex(i => (i - 1 + matchLines.length) % matchLines.length);
  };
  const goToNextMatch = () => {
    if (matchLines.length === 0) return;
    setSearchMatchIndex(i => (i + 1) % matchLines.length);
  };

  // ── 렌더링할 줄 목록 계산 (폴딩 반영) ──
  const visibleLines = useMemo(() => {
    if (rawLines.length === 0) return [];

    // 숨겨야 할 줄 인덱스 집합 계산
    const hiddenLines = new Set<number>();
    foldedStarts.forEach(startLine => {
      const endLine = blockMap.get(startLine);
      if (endLine == null) return;
      // startLine+1 ~ endLine 까지 숨기기
      for (let i = startLine + 1; i <= endLine; i++) {
        hiddenLines.add(i);
      }
    });

    return rawLines.map((_, idx) => idx).filter(idx => !hiddenLines.has(idx));
  }, [rawLines, foldedStarts, blockMap]);

  // ── 검색어 하이라이트가 적용된 줄 HTML 생성 ──
  const getLineHtml = useCallback((lineIdx: number): string => {
    const hlHtml = highlightedLines[lineIdx] ?? '';

    // 검색어가 없으면 그냥 구문 강조 HTML 반환
    if (!searchQuery.trim()) return hlHtml;

    // 평문 rawLine에서 검색어 위치를 찾아 highlight.js HTML에 마크 삽입
    // 단순화: rawLine의 텍스트를 기준으로 매칭 위치를 찾고,
    // HTML 태그를 건너뛰면서 같은 위치에 <mark> 삽입
    const rawLine = rawLines[lineIdx] ?? '';
    const q = searchQuery.toLowerCase();
    if (!rawLine.toLowerCase().includes(q)) return hlHtml;

    const isCurrentMatch =
      matchLines.length > 0 && matchLines[searchMatchIndex] === lineIdx;

    // HTML에서 텍스트 위치를 추적하며 검색어를 <mark>로 감싸기
    return wrapSearchMatches(hlHtml, q, isCurrentMatch);
  }, [highlightedLines, rawLines, searchQuery, matchLines, searchMatchIndex]);

  // ── 라인 수 패딩 너비 계산 ──
  const lineNumWidth = useMemo(() => {
    const digits = String(rawLines.length).length;
    return Math.max(digits * 9 + 16, 40);
  }, [rawLines.length]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 10000 }}
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: themeVars.surface2 ?? '#1e1e1e',
          border: `1px solid ${themeVars.border ?? '#334155'}`,
          width: '82vw',
          maxWidth: '1100px',
          height: '90vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── 헤더 ── */}
        <div
          className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
          style={{ borderBottom: `1px solid ${themeVars.border ?? '#334155'}` }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="text-sm font-medium truncate"
              style={{ color: themeVars.text }}
              title={path}
            >
              {fileName}
            </span>
            {langName && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: `${themeVars.accent}25`,
                  color: themeVars.accent,
                  fontFamily: 'monospace',
                }}
              >
                {langName}
              </span>
            )}
            <span className="text-xs" style={{ color: themeVars.muted }}>
              코드 미리보기
            </span>
          </div>

          {/* 헤더 버튼 그룹 */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* 전체 펼치기 */}
            <button
              className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-opacity hover:opacity-70"
              style={{
                backgroundColor: themeVars.surface,
                color: themeVars.text,
                border: `1px solid ${themeVars.border}`,
              }}
              onClick={unfoldAll}
              title="전체 펼치기"
            >
              <Maximize2 size={11} />
              펼치기
            </button>

            {/* 전체 접기 */}
            <button
              className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-opacity hover:opacity-70"
              style={{
                backgroundColor: themeVars.surface,
                color: themeVars.text,
                border: `1px solid ${themeVars.border}`,
              }}
              onClick={foldAll}
              title="전체 접기"
            >
              <Minimize2 size={11} />
              접기
            </button>

            {/* 검색 버튼 */}
            <button
              className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-opacity hover:opacity-70"
              style={{
                backgroundColor: searchVisible ? `${themeVars.accent}30` : themeVars.surface,
                color: searchVisible ? themeVars.accent : themeVars.text,
                border: `1px solid ${searchVisible ? themeVars.accent : themeVars.border}`,
              }}
              onClick={() => {
                setSearchVisible(v => !v);
                if (!searchVisible) setTimeout(() => searchInputRef.current?.focus(), 50);
              }}
              title="검색 (Ctrl+F)"
            >
              <Search size={11} />
              검색
            </button>

            {/* 닫기 */}
            <button
              className="p-1.5 rounded transition-opacity hover:bg-red-500/20"
              style={{ color: themeVars.text }}
              onClick={onClose}
              title="닫기 (ESC)"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── 검색 바 ── */}
        {searchVisible && (
          <div
            className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
            style={{ borderBottom: `1px solid ${themeVars.border}`, backgroundColor: themeVars.surface }}
          >
            <Search size={13} style={{ color: themeVars.muted }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="검색어 입력... (Enter: 다음, Shift+Enter: 이전)"
              className="flex-1 text-xs outline-none bg-transparent"
              style={{ color: themeVars.text }}
            />
            {/* 매칭 카운트 */}
            <span className="text-xs tabular-nums" style={{ color: themeVars.muted }}>
              {matchLines.length === 0
                ? (searchQuery ? '없음' : '')
                : `${searchMatchIndex + 1} / ${matchLines.length}`}
            </span>
            {/* 이전 */}
            <button
              className="px-2 py-0.5 text-xs rounded hover:opacity-70"
              style={{
                backgroundColor: themeVars.surface2,
                color: themeVars.text,
                border: `1px solid ${themeVars.border}`,
              }}
              onClick={goToPrevMatch}
              title="이전 매칭 (Shift+Enter)"
            >
              ↑
            </button>
            {/* 다음 */}
            <button
              className="px-2 py-0.5 text-xs rounded hover:opacity-70"
              style={{
                backgroundColor: themeVars.surface2,
                color: themeVars.text,
                border: `1px solid ${themeVars.border}`,
              }}
              onClick={goToNextMatch}
              title="다음 매칭 (Enter)"
            >
              ↓
            </button>
            {/* 닫기 */}
            <button
              className="p-0.5 hover:opacity-70"
              style={{ color: themeVars.muted }}
              onClick={() => { setSearchVisible(false); setSearchQuery(''); }}
              title="검색 닫기 (ESC)"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* ── 코드 영역 ── */}
        <div
          ref={codeContainerRef}
          className="flex-1 overflow-auto"
          style={{
            backgroundColor: '#1e1e1e',
            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
            fontSize: 13,
            lineHeight: '1.6',
          }}
        >
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div
                className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: `${themeVars.accent} transparent transparent transparent` }}
              />
            </div>
          )}

          {error && (
            <div
              className="flex items-center justify-center h-full text-sm px-8 text-center"
              style={{ color: '#f87171' }}
            >
              파일을 불러오지 못했습니다: {error}
            </div>
          )}

          {!loading && !error && rawLines.length > 0 && (
            <div className="relative">
              {visibleLines.map((lineIdx) => {
                const isStart = blockMap.has(lineIdx);
                const isFolded = foldedStarts.has(lineIdx);
                const isSearchMatch =
                  searchQuery.trim() !== '' && matchLines.includes(lineIdx);
                const isCurrentSearchMatch =
                  isSearchMatch && matchLines[searchMatchIndex] === lineIdx;

                return (
                  <div
                    key={lineIdx}
                    ref={el => { lineRefs.current[lineIdx] = el; }}
                    className="flex group"
                    style={{
                      backgroundColor: isCurrentSearchMatch
                        ? `${themeVars.accent}20`
                        : isSearchMatch
                          ? 'rgba(255,255,100,0.06)'
                          : 'transparent',
                    }}
                  >
                    {/* 라인 번호 거터 */}
                    <div
                      className="flex items-start flex-shrink-0 select-none pt-0"
                      style={{
                        width: lineNumWidth,
                        paddingRight: 12,
                        paddingLeft: 8,
                        color: themeVars.muted,
                        opacity: 0.5,
                        borderRight: `1px solid ${themeVars.border}22`,
                        textAlign: 'right',
                        userSelect: 'none',
                      }}
                    >
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {lineIdx + 1}
                      </span>
                    </div>

                    {/* 폴딩 토글 버튼 */}
                    <div
                      className="flex items-start flex-shrink-0"
                      style={{ width: 20, paddingTop: 1 }}
                    >
                      {isStart ? (
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          style={{ color: themeVars.muted, lineHeight: 1 }}
                          onClick={() => toggleFold(lineIdx)}
                          title={isFolded ? '블록 펼치기' : '블록 접기'}
                        >
                          {isFolded
                            ? <ChevronRight size={13} />
                            : <ChevronDown size={13} />}
                        </button>
                      ) : null}
                    </div>

                    {/* 코드 내용 */}
                    <div
                      className="flex-1 px-3 py-0 overflow-x-visible whitespace-pre"
                      style={{ tabSize: 2 }}
                    >
                      {isFolded ? (
                        // 접혀있을 때: 첫 줄 + {...} 축약 표시
                        <span>
                          <span
                            dangerouslySetInnerHTML={{ __html: getLineHtml(lineIdx) }}
                          />
                          <span
                            className="ml-1 px-1 rounded cursor-pointer"
                            style={{
                              backgroundColor: `${themeVars.accent}25`,
                              color: themeVars.accent,
                              fontSize: 11,
                            }}
                            onClick={() => toggleFold(lineIdx)}
                            title="블록 펼치기"
                          >
                            {'{...}'}
                          </span>
                        </span>
                      ) : (
                        <span
                          dangerouslySetInnerHTML={{ __html: getLineHtml(lineIdx) }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
              {/* 하단 여백 */}
              <div style={{ height: 40 }} />
            </div>
          )}
        </div>

        {/* ── 하단 상태 바 ── */}
        {!loading && !error && (
          <div
            className="flex items-center justify-between px-4 py-1.5 flex-shrink-0 text-xs"
            style={{
              borderTop: `1px solid ${themeVars.border}`,
              color: themeVars.muted,
              backgroundColor: themeVars.surface,
            }}
          >
            <span>{rawLines.length}줄</span>
            <span>
              {foldedStarts.size > 0 ? `${foldedStarts.size}개 블록 접힘` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 유틸리티: highlight.js 출력 HTML을 줄 단위로 분리
// ──────────────────────────────────────────────

/**
 * highlight.js가 생성한 HTML 문자열을 줄 단위로 나눈다.
 * HTML 태그가 여러 줄에 걸쳐 있을 수 있으므로,
 * 각 줄에서 열린 태그를 추적하고 줄 끝에 닫는 태그를 추가한다.
 */
function splitHighlightedLines(html: string): string[] {
  const rawLines = html.split('\n');
  const result: string[] = [];

  // 열린 스팬 태그 스택 (스타일 태그 전체)
  let openTags: string[] = [];

  for (const line of rawLines) {
    // 이전 줄에서 열린 태그들로 현재 줄 시작
    const prefix = openTags.map(tag => tag).join('');

    // 현재 줄 처리
    let combined = prefix + line;

    // 이 줄에서 열리고 닫히는 태그 추적
    const tagRegex = /<(\/?)span([^>]*)>/g;
    let match;
    const lineOpenTags = [...openTags];

    while ((match = tagRegex.exec(line)) !== null) {
      const isClose = match[1] === '/';
      if (!isClose) {
        // 열린 태그 push
        lineOpenTags.push(`<span${match[2]}>`);
      } else {
        // 닫힌 태그 pop
        if (lineOpenTags.length > 0) lineOpenTags.pop();
      }
    }

    // 줄 끝에 닫히지 않은 태그 닫기
    const closingSuffix = lineOpenTags.map(() => '</span>').join('');
    result.push(combined + closingSuffix);

    // 다음 줄 시작에 유지할 열린 태그 업데이트
    openTags = lineOpenTags;
  }

  return result;
}

// ──────────────────────────────────────────────
// 유틸리티: highlight.js HTML에서 검색어를 <mark>로 감싸기
// ──────────────────────────────────────────────

/**
 * highlight.js가 생성한 HTML에서 HTML 태그를 건너뛰면서
 * 텍스트 노드 내에서 검색어를 찾아 <mark>로 표시한다.
 */
function wrapSearchMatches(html: string, query: string, isCurrent: boolean): string {
  if (!query) return html;

  const markStyle = isCurrent
    ? 'background:#f59e0b;color:#000;border-radius:2px;'
    : 'background:#854d0e55;color:inherit;border-radius:2px;';

  let result = '';
  let i = 0;
  const lowerHtml = html.toLowerCase();
  const lowerQuery = query.toLowerCase();

  while (i < html.length) {
    // HTML 태그 건너뛰기
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) {
        result += html.slice(i);
        break;
      }
      result += html.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    // HTML 엔티티 건너뛰기 (&amp; &lt; 등)
    if (html[i] === '&') {
      const end = html.indexOf(';', i);
      if (end !== -1 && end - i <= 10) {
        result += html.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }

    // 텍스트 구간: 검색어 찾기
    const matchPos = lowerHtml.indexOf(lowerQuery, i);
    if (matchPos === -1) {
      // 검색어 없음: 나머지 텍스트 그대로 추가
      result += html.slice(i);
      break;
    }

    // 매칭 전 텍스트 출력 (단, 태그나 엔티티 내부가 아닌 경우만)
    const beforeMatch = html.slice(i, matchPos);
    // 태그가 중간에 끼어있으면 matchPos까지 텍스트만 추가하고 루프 계속
    if (beforeMatch.includes('<') || beforeMatch.includes('&')) {
      result += html[i];
      i++;
      continue;
    }

    result += beforeMatch;
    result += `<mark style="${markStyle}">${html.slice(matchPos, matchPos + query.length)}</mark>`;
    i = matchPos + query.length;
  }

  return result;
}
