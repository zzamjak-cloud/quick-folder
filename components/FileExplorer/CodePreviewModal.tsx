import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Search, ChevronDown, ChevronRight, Maximize2, Minimize2, Edit3, Save } from 'lucide-react';
import { ThemeVars } from './types';
import { getBaseName } from '../../utils/pathUtils';
import { tauriCommands } from '../../utils/tauriCommands';
import { computeFoldableBlocks } from './codePreview/folding';
import { splitHighlightedLines, wrapAllSearchMatches, wrapSearchMatches } from './codePreview/search';
import { CodePreviewStyles, getCodePreviewColors } from './codePreview/styles';
import { ensureLangRegistered, getLangFromPath, highlightCodeContent } from './codePreview/syntax';

import 'highlight.js/styles/vs2015.css';

// ──────────────────────────────────────────────
// 타입 정의
// ──────────────────────────────────────────────

interface CodePreviewModalProps {
  path: string;
  themeVars: ThemeVars;
  onClose: () => void;
  /** 편집 모드 진입 요청 토큰 — 0보다 크면 모달 오픈과 동시에 편집 모드로 진입 */
  editRequestToken?: number;
}

// ──────────────────────────────────────────────
// 메인 컴포넌트
// ──────────────────────────────────────────────

export default function CodePreviewModal({ path, themeVars, onClose, editRequestToken = 0 }: CodePreviewModalProps) {
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

  // 편집 모드 상태
  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replaceQuery, setReplaceQuery] = useState('');
  const [editedHighlighted, setEditedHighlighted] = useState<string>('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const codeContainerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editPreRef = useRef<HTMLPreElement>(null);
  const editGutterRef = useRef<HTMLDivElement>(null);

  const fileName = getBaseName(path);
  const codeColors = useMemo(() => getCodePreviewColors(themeVars), [themeVars]);
  const { isLightTheme, codeSurface, codeText, codeMuted, codeBorder } = codeColors;

  // ── 파일 로드 및 구문 강조 ──
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // 파일 내용 읽기 (최대 1MB)
        const content = await tauriCommands.readTextFile(path, 1048576);
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
        const highlighted = highlightCodeContent(content, lang);

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
    if (editMode) return; // 편집 모드에서는 별도로 textarea 셀렉션 사용
    const targetLine = matchLines[searchMatchIndex];
    const el = lineRefs.current[targetLine];
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [searchMatchIndex, matchLines, editMode]);

  // ── 편집 모드 진입 시 editedContent 초기화 + 첫 라인 포커스 ──
  const enterEditMode = useCallback(() => {
    const initialContent = rawLines.join('\n');
    setEditedContent(initialContent);
    setIsDirty(false);
    setEditMode(true);
    setSearchVisible(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(0, 0);
    });
  }, [rawLines]);

  const enterEditModeRef = useRef(enterEditMode);
  const handledEditRequestRef = useRef(0);

  useEffect(() => {
    enterEditModeRef.current = enterEditMode;
  }, [enterEditMode]);

  // ── editRequestToken 변경 시 편집 모드 진입 ──
  useEffect(() => {
    if (editRequestToken <= 0 || loading) return;
    if (handledEditRequestRef.current === editRequestToken) return;
    handledEditRequestRef.current = editRequestToken;
    enterEditModeRef.current();
  }, [editRequestToken, loading]);

  // ── editedContent 구문 강조 + 검색어 mark 하이라이트 (편집 모드에서만) ──
  // searchQuery가 있으면 모든 매칭을 <mark>로 감싸서 즉시 시각적 피드백 제공
  useEffect(() => {
    if (!editMode) return;
    let cancelled = false;
    let highlighted = highlightCodeContent(editedContent, langName);
    // 검색어 매칭을 모두 <mark>로 감싸기 (HTML 태그 내부는 건너뜀)
    if (searchQuery.trim()) {
      highlighted = wrapAllSearchMatches(highlighted, searchQuery);
    }
    // 끝 줄에 빈 공간을 두어 마지막 줄 표시 안정화
    if (!cancelled) setEditedHighlighted(highlighted + '\n');
    return () => { cancelled = true; };
  }, [editMode, editedContent, langName, searchQuery]);

  // ── 편집 모드 textarea 스크롤 동기화 (gutter + pre overlay) ──
  const handleEditScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    if (editPreRef.current) {
      editPreRef.current.scrollTop = ta.scrollTop;
      editPreRef.current.scrollLeft = ta.scrollLeft;
    }
    if (editGutterRef.current) {
      editGutterRef.current.scrollTop = ta.scrollTop;
    }
  }, []);

  // ── 편집 내용 변경 ──
  const handleEditedChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedContent(e.target.value);
    setIsDirty(true);
  }, []);

  // ── 저장 ──
  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await tauriCommands.writeTextFile(path, editedContent);
      setIsDirty(false);
      // rawLines도 새로 갱신하여 read 모드로 돌아왔을 때 일관성 유지
      const newLines = editedContent.split('\n');
      setRawLines(newLines);
      const map = computeFoldableBlocks(newLines);
      setBlockMap(map);
      // 새로운 highlight 줄도 갱신
      const highlighted = highlightCodeContent(editedContent, langName);
      setHighlightedLines(splitHighlightedLines(highlighted));
    } catch (e) {
      console.error('파일 저장 실패:', e);
      alert(`파일 저장에 실패했습니다: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [path, editedContent, langName, saving]);

  const exitEditMode = useCallback(() => {
    if (isDirty) {
      const ok = window.confirm('저장되지 않은 변경사항이 있습니다. 편집 모드를 종료하시겠습니까?');
      if (!ok) return false;
    }
    setEditMode(false);
    setIsDirty(false);
    setSearchVisible(false);
    setSearchQuery('');
    setReplaceQuery('');
    return true;
  }, [isDirty]);

  const handleCloseModal = useCallback(() => {
    if (editMode && isDirty) {
      const ok = window.confirm('저장되지 않은 변경사항이 있습니다. 닫으시겠습니까?');
      if (!ok) return;
    }
    setSearchVisible(false);
    setSearchQuery('');
    setReplaceQuery('');
    onClose();
  }, [editMode, isDirty, onClose]);

  // ── 검색어 다음 매칭으로 이동 (편집 모드) ──
  const findNextInTextarea = useCallback((startFrom?: number): number => {
    if (!searchQuery) return -1;
    const ta = textareaRef.current;
    if (!ta) return -1;
    const start = startFrom ?? ta.selectionEnd;
    const haystack = editedContent.toLowerCase();
    const needle = searchQuery.toLowerCase();
    let idx = haystack.indexOf(needle, start);
    if (idx === -1) idx = haystack.indexOf(needle); // wrap
    return idx;
  }, [searchQuery, editedContent]);

  const goToTextareaMatch = useCallback((idx: number) => {
    const ta = textareaRef.current;
    if (!ta || idx < 0) return;
    ta.focus();
    ta.setSelectionRange(idx, idx + searchQuery.length);
    // 화면에 보이도록 스크롤 — 캐럿 위치 기반
    const before = editedContent.slice(0, idx);
    const lineNum = before.split('\n').length - 1;
    const lineHeight = 13 * 1.6;
    ta.scrollTop = Math.max(0, lineNum * lineHeight - ta.clientHeight / 3);
  }, [searchQuery, editedContent]);

  // ── 다음 변경(순차 치환): 현재 매칭을 replace로 바꾸고 그 다음 매칭으로 이동 ──
  const handleReplaceNext = useCallback(() => {
    if (!searchQuery) return;
    const ta = textareaRef.current;
    if (!ta) return;
    // 현재 selection이 검색어와 정확히 일치하면 그 위치를 치환
    const sel = editedContent.slice(ta.selectionStart, ta.selectionEnd);
    if (sel.toLowerCase() === searchQuery.toLowerCase() && sel.length > 0) {
      const next = editedContent.slice(0, ta.selectionStart) + replaceQuery + editedContent.slice(ta.selectionEnd);
      const cursorAfter = ta.selectionStart + replaceQuery.length;
      setEditedContent(next);
      setIsDirty(true);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(cursorAfter, cursorAfter);
        // 그 다음 매칭으로 이동
        const idx = next.toLowerCase().indexOf(searchQuery.toLowerCase(), cursorAfter);
        if (idx >= 0) ta.setSelectionRange(idx, idx + searchQuery.length);
      });
      return;
    }
    // 아니면 현재 위치에서 다음 매칭으로 이동만 함
    const idx = findNextInTextarea();
    if (idx >= 0) goToTextareaMatch(idx);
  }, [searchQuery, replaceQuery, editedContent, findNextInTextarea, goToTextareaMatch]);

  // ── 모두 변경(일괄 치환) ──
  const handleReplaceAll = useCallback(() => {
    if (!searchQuery) return;
    // 대소문자 구분 없이 안전하게 치환하기 위해 정규식 사용
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'gi');
    const next = editedContent.replace(re, replaceQuery);
    if (next !== editedContent) {
      setEditedContent(next);
      setIsDirty(true);
    }
  }, [searchQuery, replaceQuery, editedContent]);

  // ── 키보드 이벤트 처리 ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      const isInInput = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      // Ctrl+F: 검색 바 열기
      if (ctrl && e.code === 'KeyF') {
        e.preventDefault();
        e.stopPropagation();
        setSearchVisible(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return;
      }

      // Ctrl+S: 편집 모드일 때 저장
      if (ctrl && e.code === 'KeyS' && editMode) {
        e.preventDefault();
        e.stopPropagation();
        handleSave();
        return;
      }

      // E 키: 편집 모드 진입 (단독 입력 + 입력 필드 포커스 아닐 때 + 편집 모드 아닐 때)
      // 물리 키 e.code 기반 + 한글 IME 입력 중 제외
      if (e.code === 'KeyE' && !ctrl && !e.altKey && !e.shiftKey && !editMode && !isInInput && !e.isComposing && (e as any).keyCode !== 229) {
        e.preventDefault();
        e.stopPropagation();
        enterEditMode();
        return;
      }

      // ESC: 검색 바 → 편집 모드 → 모달 순서로 종료
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (searchVisible) {
          setSearchVisible(false);
          setSearchQuery('');
          return;
        }
        if (editMode) {
          exitEditMode();
          return;
        }
        handleCloseModal();
        return;
      }

      // 검색 바가 열려있을 때 Enter/Shift+Enter로 탐색
      if (searchVisible && e.key === 'Enter' && !e.shiftKey) {
        // 검색 input에서 Enter
        if (target === searchInputRef.current) {
          e.preventDefault();
          if (editMode) {
            // 편집 모드: textarea에서 다음 매칭으로 이동
            const idx = findNextInTextarea();
            if (idx >= 0) goToTextareaMatch(idx);
          } else if (matchLines.length > 0) {
            setSearchMatchIndex(i => (i + 1) % matchLines.length);
          }
        }
      }
      if (searchVisible && e.key === 'Enter' && e.shiftKey) {
        if (target === searchInputRef.current) {
          e.preventDefault();
          if (editMode) {
            // 편집 모드: 이전 매칭 — 단순화: 현재 selection 앞에서 검색
            const ta = textareaRef.current;
            if (ta && searchQuery) {
              const haystack = editedContent.toLowerCase();
              const needle = searchQuery.toLowerCase();
              const before = haystack.slice(0, ta.selectionStart);
              let idx = before.lastIndexOf(needle);
              if (idx === -1) idx = haystack.lastIndexOf(needle);
              if (idx >= 0) goToTextareaMatch(idx);
            }
          } else if (matchLines.length > 0) {
            setSearchMatchIndex(i => (i - 1 + matchLines.length) % matchLines.length);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [searchVisible, matchLines, editMode, handleSave, enterEditMode, exitEditMode, handleCloseModal, findNextInTextarea, goToTextareaMatch, searchQuery, editedContent]);

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
      className="qf-code-preview fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 10000 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleCloseModal();
      }}
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
        onMouseDown={e => e.stopPropagation()}
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
            {/* 읽기 모드 전용: 펼치기/접기 */}
            {!editMode && (
              <>
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
              </>
            )}

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

            {/* 편집(E) / 저장 / 편집 종료 */}
            {!editMode ? (
              <button
                className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: themeVars.accent ?? '#4ade80',
                  color: '#000',
                  fontWeight: 600,
                }}
                onClick={enterEditMode}
                title="편집 모드 진입 (E)"
              >
                <Edit3 size={11} />
                편집(E)
              </button>
            ) : (
              <>
                <button
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{
                    backgroundColor: isDirty ? (themeVars.accent ?? '#4ade80') : themeVars.surface,
                    color: isDirty ? '#000' : themeVars.text,
                    fontWeight: isDirty ? 600 : 500,
                    border: isDirty ? 'none' : `1px solid ${themeVars.border}`,
                  }}
                  onClick={handleSave}
                  disabled={!isDirty || saving}
                  title="저장 (Ctrl+S)"
                >
                  <Save size={11} />
                  {saving ? '저장 중...' : '저장'}
                </button>
                <button
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-opacity hover:opacity-70"
                  style={{
                    backgroundColor: themeVars.surface,
                    color: themeVars.text,
                    border: `1px solid ${themeVars.border}`,
                  }}
                  onClick={() => {
                    exitEditMode();
                  }}
                  title="편집 모드 종료 (ESC)"
                >
                  편집 종료
                </button>
              </>
            )}

            {/* 닫기 */}
            <button
              className="p-1.5 rounded transition-opacity hover:bg-red-500/20"
              style={{ color: themeVars.text }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleCloseModal();
              }}
              title="닫기 (ESC)"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── 검색 바 ── */}
        {searchVisible && (
          <div
            className="flex flex-col gap-1 px-4 py-2 flex-shrink-0"
            style={{ borderBottom: `1px solid ${themeVars.border}`, backgroundColor: themeVars.surface }}
          >
            <div className="flex items-center gap-2">
              <Search size={13} style={{ color: themeVars.muted }} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="검색어 입력... (Enter: 다음, Shift+Enter: 이전)"
                className="flex-1 text-xs outline-none bg-transparent"
                style={{ color: themeVars.text }}
              />
              {/* 매칭 카운트 (읽기 모드에서만 라인 인덱스 표시) */}
              {!editMode && (
                <span className="text-xs tabular-nums" style={{ color: themeVars.muted }}>
                  {matchLines.length === 0
                    ? (searchQuery ? '없음' : '')
                    : `${searchMatchIndex + 1} / ${matchLines.length}`}
                </span>
              )}
              {/* 이전 */}
              <button
                className="px-2 py-0.5 text-xs rounded hover:opacity-70"
                style={{
                  backgroundColor: themeVars.surface2,
                  color: themeVars.text,
                  border: `1px solid ${themeVars.border}`,
                }}
                onClick={() => {
                  if (editMode) {
                    const ta = textareaRef.current;
                    if (ta && searchQuery) {
                      const haystack = editedContent.toLowerCase();
                      const needle = searchQuery.toLowerCase();
                      const before = haystack.slice(0, ta.selectionStart);
                      let idx = before.lastIndexOf(needle);
                      if (idx === -1) idx = haystack.lastIndexOf(needle);
                      if (idx >= 0) goToTextareaMatch(idx);
                    }
                  } else {
                    goToPrevMatch();
                  }
                }}
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
                onClick={() => {
                  if (editMode) {
                    const idx = findNextInTextarea();
                    if (idx >= 0) goToTextareaMatch(idx);
                  } else {
                    goToNextMatch();
                  }
                }}
                title="다음 매칭 (Enter)"
              >
                ↓
              </button>
              {/* 닫기 */}
              <button
                className="p-0.5 hover:opacity-70"
                style={{ color: themeVars.muted }}
                onClick={() => { setSearchVisible(false); setSearchQuery(''); setReplaceQuery(''); }}
                title="검색 닫기 (ESC)"
              >
                <X size={13} />
              </button>
            </div>
            {/* 편집 모드 전용: 치환 입력 + 버튼 */}
            {editMode && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] w-4 flex-shrink-0" style={{ color: themeVars.muted }}>↻</span>
                <input
                  type="text"
                  value={replaceQuery}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  onChange={e => setReplaceQuery(e.target.value)}
                  placeholder="대체할 텍스트..."
                  className="flex-1 text-xs outline-none bg-transparent"
                  style={{ color: themeVars.text }}
                />
                <button
                  className="px-2 py-0.5 text-xs rounded hover:opacity-70"
                  style={{
                    backgroundColor: themeVars.surface2,
                    color: themeVars.text,
                    border: `1px solid ${themeVars.border}`,
                  }}
                  onClick={handleReplaceNext}
                  disabled={!searchQuery}
                  title="현재 매칭 1개를 변경하고 다음으로 이동"
                >
                  다음 변경
                </button>
                <button
                  className="px-2 py-0.5 text-xs rounded hover:opacity-70"
                  style={{
                    backgroundColor: `${themeVars.accent}30`,
                    color: themeVars.accent,
                    border: `1px solid ${themeVars.accent}`,
                  }}
                  onClick={handleReplaceAll}
                  disabled={!searchQuery}
                  title="전체 매칭을 일괄 변경"
                >
                  모두 변경
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── 코드 영역 ── */}
        <div
          ref={codeContainerRef}
          className="flex-1 overflow-auto"
          style={{
            backgroundColor: codeSurface,
            color: codeText,
            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
            fontSize: 13,
            lineHeight: '1.6',
            display: editMode ? 'flex' : undefined,
            overflow: editMode ? 'hidden' : 'auto',
          }}
        >
          {/* ── 편집 모드: textarea + 구문강조 오버레이 ── */}
          {!loading && !error && editMode && (
            <>
              {/* 라인 번호 거터 (textarea와 함께 스크롤) */}
              <div
                ref={editGutterRef}
                className="flex-shrink-0 overflow-hidden select-none"
                style={{
                  width: lineNumWidth,
                  paddingTop: 8,
                  paddingBottom: 40,
                  paddingRight: 12,
                  paddingLeft: 8,
                  color: codeMuted,
                  opacity: isLightTheme ? 0.8 : 0.5,
                  borderRight: `1px solid ${codeBorder}`,
                  textAlign: 'right',
                  userSelect: 'none',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'pre',
                }}
              >
                {editedContent.split('\n').map((_, i) => (
                  <div key={i} style={{ height: 'calc(13px * 1.6)' }}>{i + 1}</div>
                ))}
              </div>
              {/* pre 오버레이 + textarea */}
              <div className="relative flex-1" style={{ minWidth: 0 }}>
                <pre
                  ref={editPreRef}
                  className="absolute inset-0 m-0"
                  style={{
                    pointerEvents: 'none',
                    whiteSpace: 'pre',
                    wordBreak: 'normal',
                    overflowWrap: 'normal',
                    padding: '8px 12px 40px 12px',
                    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                    fontSize: 13,
                    lineHeight: '1.6',
                    margin: 0,
                    overflow: 'auto',
                    color: codeText,
                    tabSize: 2,
                  }}
                  dangerouslySetInnerHTML={{ __html: editedHighlighted }}
                />
                <textarea
                  ref={textareaRef}
                  value={editedContent}
                  onChange={handleEditedChange}
                  onScroll={handleEditScroll}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  className="absolute inset-0 w-full h-full outline-none resize-none"
                  style={{
                    color: 'transparent',
                    caretColor: themeVars.text ?? '#fff',
                    background: 'transparent',
                    whiteSpace: 'pre',
                    wordBreak: 'normal',
                    overflowWrap: 'normal',
                    padding: '8px 12px 40px 12px',
                    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                    fontSize: 13,
                    lineHeight: '1.6',
                    border: 'none',
                    tabSize: 2,
                  }}
                />
              </div>
            </>
          )}

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

          {!loading && !error && !editMode && rawLines.length > 0 && (
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
                          ? 'rgba(255,255,100,0.10)'
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
                          color: codeMuted,
                          opacity: isLightTheme ? 0.8 : 0.5,
                          borderRight: `1px solid ${codeBorder}`,
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
                          style={{ color: codeMuted, lineHeight: 1 }}
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
                      style={{ tabSize: 2, color: codeText }}
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
            <span>
              {editMode ? editedContent.split('\n').length : rawLines.length}줄
              {editMode && isDirty && (
                <span className="ml-2" style={{ color: '#f87171' }}>● 미저장</span>
              )}
            </span>
            <span>
              {editMode
                ? '편집 모드 (Ctrl+S 저장 · ESC 종료)'
                : (foldedStarts.size > 0 ? `${foldedStarts.size}개 블록 접힘` : '읽기 모드 (E 키로 편집)')}
            </span>
          </div>
        )}
      </div>
      <CodePreviewStyles colors={codeColors} />
    </div>
  );
}
