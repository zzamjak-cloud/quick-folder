import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FolderPlus,
  ArrowUpDown,
  LayoutGrid,
  List,
  Table2,
  Search,
  X,
  Filter,
} from 'lucide-react';
import { ThumbnailSize } from '../../types';
import { ThemeVars } from './types';

interface NavigationBarProps {
  currentPath: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onNavigate: (path: string) => void;
  onCreateDirectory: () => void;
  sortBy: 'name' | 'size' | 'modified' | 'type';
  sortDir: 'asc' | 'desc';
  onSortChange: (by: 'name' | 'size' | 'modified' | 'type', dir: 'asc' | 'desc') => void;
  thumbnailSize: ThumbnailSize;
  onThumbnailSizeChange: (size: ThumbnailSize) => void;
  viewMode: 'grid' | 'list' | 'details';
  onViewModeChange: (mode: 'grid' | 'list' | 'details') => void;
  isSearchActive: boolean;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSearchToggle: () => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  activeExtFilters: Set<string>;
  availableExtensions: Set<string>;
  onExtFilterToggle: (ext: string) => void;
  onExtFilterClear: () => void;
  splitMode?: 'single' | 'horizontal' | 'vertical';
  onSplitModeChange?: (mode: 'single' | 'horizontal' | 'vertical') => void;
  themeVars: ThemeVars | null;
}

export default function NavigationBar({
  currentPath,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onUp,
  onNavigate,
  onCreateDirectory,
  sortBy,
  sortDir,
  onSortChange,
  thumbnailSize,
  onThumbnailSizeChange,
  viewMode,
  onViewModeChange,
  isSearchActive,
  searchQuery,
  onSearchQueryChange,
  onSearchToggle,
  searchInputRef,
  activeExtFilters,
  availableExtensions,
  onExtFilterToggle,
  onExtFilterClear,
  splitMode,
  onSplitModeChange,
  themeVars,
}: NavigationBarProps) {
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState(currentPath);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const sizeMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditingPath) {
      setPathInput(currentPath);
    }
  }, [currentPath, isEditingPath]);

  // 경로 입력창 포커스
  useEffect(() => {
    if (isEditingPath && pathInputRef.current) {
      pathInputRef.current.select();
    }
  }, [isEditingPath]);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
      if (sizeMenuRef.current && !sizeMenuRef.current.contains(e.target as Node)) {
        setShowSizeMenu(false);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // 경로를 세그먼트로 분리
  const getPathSegments = () => {
    if (!currentPath) return [];
    const sep = currentPath.includes('/') ? '/' : '\\';
    const parts = currentPath.replace(/[/\\]+$/, '').split(sep).filter(Boolean);

    // Windows 드라이브 문자 처리 (e.g., C:)
    if (currentPath.match(/^[A-Za-z]:/)) {
      const drive = currentPath.slice(0, 2);
      const rest = parts.slice(1);
      return [drive, ...rest].map((part, idx, arr) => ({
        name: part,
        path: idx === 0
          ? drive + '\\'
          : drive + '\\' + arr.slice(1, idx + 1).join('\\'),
      }));
    }

    // macOS/Linux: '/'로 시작
    return parts.map((part, idx) => ({
      name: part,
      path: '/' + parts.slice(0, idx + 1).join('/'),
    }));
  };

  const segments = getPathSegments();

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsEditingPath(false);
    if (pathInput.trim() && pathInput !== currentPath) {
      onNavigate(pathInput.trim());
    }
  };

  const handlePathKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditingPath(false);
      setPathInput(currentPath);
    }
  };

  const sortLabels = {
    name: '이름',
    size: '크기',
    modified: '날짜',
    type: '종류',
  };

  const sizeLabels: Record<ThumbnailSize, string> = {
    40: 'XS', 60: 'S', 80: 'M', 100: 'L', 120: 'XL', 160: '2X', 200: '3X', 240: '4X',
  };

  const btnCls = (active: boolean) =>
    `p-1.5 rounded-md transition-colors ${
      active
        ? 'text-[var(--qf-accent)] bg-[var(--qf-surface-hover)]'
        : 'text-[var(--qf-muted)] hover:text-[var(--qf-text)] hover:bg-[var(--qf-surface-hover)]'
    }`;

  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 border-b flex-shrink-0"
      style={{
        backgroundColor: themeVars?.surface2 ?? '#1f2937',
        borderColor: themeVars?.border ?? '#334155',
      }}
    >
      {/* 뒤로/앞으로/위로 버튼 */}
      <button
        className={btnCls(false) + (canGoBack ? '' : ' opacity-30 cursor-not-allowed')}
        onClick={onBack}
        disabled={!canGoBack}
        title="뒤로 (Alt+←)"
      >
        <ChevronLeft size={15} />
      </button>
      <button
        className={btnCls(false) + (canGoForward ? '' : ' opacity-30 cursor-not-allowed')}
        onClick={onForward}
        disabled={!canGoForward}
        title="앞으로 (Alt+→)"
      >
        <ChevronRight size={15} />
      </button>
      <button
        className={btnCls(false)}
        onClick={onUp}
        title="위 폴더 (Backspace)"
      >
        <ChevronUp size={15} />
      </button>

      <div className="w-px h-4 bg-[var(--qf-border)] mx-0.5" />

      {/* 경로/브레드크럼 영역 */}
      <div className="flex-1 min-w-0">
        {isEditingPath ? (
          <form onSubmit={handlePathSubmit} className="flex">
            <input
              ref={pathInputRef}
              value={pathInput}
              onChange={e => setPathInput(e.target.value)}
              onKeyDown={handlePathKeyDown}
              onBlur={() => { setIsEditingPath(false); setPathInput(currentPath); }}
              className="flex-1 px-2 py-0.5 text-xs rounded-md outline-none font-mono"
              style={{
                backgroundColor: themeVars?.surface ?? '#111827',
                color: themeVars?.text ?? '#e5e7eb',
                border: `1px solid ${themeVars?.accent ?? '#3b82f6'}`,
              }}
            />
          </form>
        ) : (
          <div
            className="flex items-center gap-0.5 min-w-0 cursor-text px-1 py-0.5 rounded-md hover:bg-[var(--qf-surface-hover)] transition-colors"
            onClick={() => setIsEditingPath(true)}
            title="클릭하여 경로 직접 입력"
          >
            {segments.length === 0 ? (
              <span className="text-xs text-[var(--qf-muted)] italic">경로 없음</span>
            ) : (
              segments.map((seg, idx) => (
                <React.Fragment key={seg.path}>
                  {idx > 0 && (
                    <ChevronRight size={11} className="flex-shrink-0" style={{ color: themeVars?.muted ?? '#94a3b8' }} />
                  )}
                  <button
                    className="text-xs px-1 py-0.5 rounded hover:bg-[var(--qf-surface)] transition-colors truncate max-w-[120px]"
                    style={{ color: idx === segments.length - 1 ? themeVars?.text : themeVars?.muted }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(seg.path);
                    }}
                    title={seg.path}
                  >
                    {seg.name}
                  </button>
                </React.Fragment>
              ))
            )}
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-[var(--qf-border)] mx-0.5" />

      {/* 새 폴더 */}
      <button
        className={btnCls(false)}
        onClick={onCreateDirectory}
        title="새 폴더 (Ctrl+Shift+N)"
      >
        <FolderPlus size={15} />
      </button>

      {/* 검색 */}
      {isSearchActive ? (
        <div className="flex items-center gap-1 rounded-md px-1.5 py-0.5" style={{ backgroundColor: themeVars?.surface ?? '#111827', border: `1px solid ${themeVars?.accent ?? '#3b82f6'}` }}>
          <Search size={13} style={{ color: themeVars?.muted, flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => onSearchQueryChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onSearchToggle(); } }}
            placeholder="파일명 검색..."
            className="bg-transparent text-xs outline-none w-28"
            style={{ color: themeVars?.text }}
          />
          <button
            className="p-0.5 rounded hover:bg-[var(--qf-surface-hover)]"
            onClick={onSearchToggle}
            title="검색 닫기"
          >
            <X size={12} style={{ color: themeVars?.muted }} />
          </button>
        </div>
      ) : (
        <button
          className={btnCls(false)}
          onClick={onSearchToggle}
          title="검색 (Ctrl+F)"
        >
          <Search size={15} />
        </button>
      )}

      {/* 뷰 전환 버튼 */}
      <div className="flex items-center gap-0.5 rounded-md overflow-hidden" style={{ border: `1px solid ${themeVars?.border ?? '#334155'}` }}>
        {([
          { mode: 'grid' as const, icon: <LayoutGrid size={13} />, title: '그리드 뷰' },
          { mode: 'list' as const, icon: <List size={13} />, title: '리스트 뷰' },
          { mode: 'details' as const, icon: <Table2 size={13} />, title: '세부사항 뷰' },
        ]).map(({ mode, icon, title }) => (
          <button
            key={mode}
            className="p-1.5 transition-colors"
            style={{
              backgroundColor: viewMode === mode ? (themeVars?.accent20 ?? 'rgba(59,130,246,0.2)') : 'transparent',
              color: viewMode === mode ? (themeVars?.accent ?? '#3b82f6') : (themeVars?.muted ?? '#94a3b8'),
            }}
            onClick={() => onViewModeChange(mode)}
            title={title}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* 확장자 필터 드롭다운 */}
      <div className="relative" ref={filterMenuRef}>
        <button
          className={btnCls(activeExtFilters.size > 0)}
          onClick={() => { setShowFilterMenu(v => !v); setShowSortMenu(false); setShowSizeMenu(false); }}
          title="파일 필터"
        >
          <div className="flex items-center gap-1 text-xs">
            <Filter size={13} />
            {activeExtFilters.size > 0 && (
              <span className="rounded-full px-1 text-[10px] leading-none" style={{ backgroundColor: themeVars?.accent20, color: themeVars?.accent }}>
                {activeExtFilters.size}
              </span>
            )}
          </div>
        </button>
        {showFilterMenu && (() => {
          // 확장자 목록을 정렬: 폴더 먼저, 나머지 알파벳순
          const sorted = Array.from(availableExtensions).sort((a, b) => {
            if (a === 'folder') return -1;
            if (b === 'folder') return 1;
            return a.localeCompare(b);
          });
          return (
            <div
              className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-xl overflow-hidden min-w-[120px] max-h-[300px] overflow-y-auto"
              style={{
                backgroundColor: themeVars?.surface2 ?? '#1f2937',
                border: `1px solid ${themeVars?.border ?? '#334155'}`,
              }}
            >
              {sorted.map(ext => {
                const label = ext === 'folder' ? '폴더' : ext === 'other' ? '기타' : ext.toUpperCase();
                const checked = activeExtFilters.has(ext);
                return (
                  <button
                    key={ext}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--qf-surface-hover)] flex items-center gap-2"
                    style={{ color: themeVars?.text }}
                    onClick={() => onExtFilterToggle(ext)}
                  >
                    <span className="w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px]" style={{ borderColor: themeVars?.border, backgroundColor: checked ? themeVars?.accent : 'transparent', color: checked ? '#fff' : 'transparent' }}>
                      ✓
                    </span>
                    {label}
                  </button>
                );
              })}
              {activeExtFilters.size > 0 && (
                <>
                  <div className="border-t" style={{ borderColor: themeVars?.border }} />
                  <button
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--qf-surface-hover)]"
                    style={{ color: themeVars?.muted }}
                    onClick={() => { onExtFilterClear(); setShowFilterMenu(false); }}
                  >
                    필터 초기화
                  </button>
                </>
              )}
            </div>
          );
        })()}
      </div>

      {/* 정렬 드롭다운 */}
      <div className="relative" ref={sortMenuRef}>
        <button
          className={btnCls(false)}
          onClick={() => { setShowSortMenu(v => !v); setShowSizeMenu(false); }}
          title="정렬"
        >
          <div className="flex items-center gap-1 text-xs">
            <ArrowUpDown size={13} />
            <span className="hidden sm:inline">{sortLabels[sortBy]}</span>
          </div>
        </button>
        {showSortMenu && (
          <div
            className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-xl overflow-hidden min-w-[120px]"
            style={{
              backgroundColor: themeVars?.surface2 ?? '#1f2937',
              border: `1px solid ${themeVars?.border ?? '#334155'}`,
            }}
          >
            {(['name', 'size', 'modified', 'type'] as const).map(by => (
              <button
                key={by}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--qf-surface-hover)] flex items-center justify-between gap-4"
                style={{ color: sortBy === by ? themeVars?.accent : themeVars?.text }}
                onClick={() => {
                  if (sortBy === by) {
                    onSortChange(by, sortDir === 'asc' ? 'desc' : 'asc');
                  } else {
                    onSortChange(by, 'asc');
                  }
                  setShowSortMenu(false);
                }}
              >
                <span>{sortLabels[by]}</span>
                {sortBy === by && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 크기 드롭다운 (Grid 뷰일 때만 표시) */}
      {viewMode === 'grid' && (
        <div className="relative" ref={sizeMenuRef}>
          <button
            className={btnCls(false)}
            onClick={() => { setShowSizeMenu(v => !v); setShowSortMenu(false); }}
            title="썸네일 크기"
          >
            <div className="flex items-center gap-1 text-xs">
              <LayoutGrid size={13} />
              <span className="hidden sm:inline">{sizeLabels[thumbnailSize]}</span>
            </div>
          </button>
          {showSizeMenu && (
            <div
              className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-xl overflow-hidden min-w-[80px]"
              style={{
                backgroundColor: themeVars?.surface2 ?? '#1f2937',
                border: `1px solid ${themeVars?.border ?? '#334155'}`,
              }}
            >
              {([40, 60, 80, 100, 120, 160, 200, 240] as const).map(size => (
                <button
                  key={size}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--qf-surface-hover)]"
                  style={{ color: thumbnailSize === size ? themeVars?.accent : themeVars?.text }}
                  onClick={() => { onThumbnailSizeChange(size); setShowSizeMenu(false); }}
                >
                  {sizeLabels[size]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 분할 뷰 토글 (splitMode prop이 전달된 경우에만 표시) */}
      {splitMode !== undefined && onSplitModeChange && (
        <>
          <div className="w-px h-4 bg-[var(--qf-border)] mx-0.5" />
          <div className="flex items-center gap-0.5 rounded-md overflow-hidden" style={{ border: `1px solid ${themeVars?.border ?? '#334155'}` }}>
            {/* 단일 뷰 */}
            <button
              className="p-1.5 transition-colors"
              style={{
                backgroundColor: splitMode === 'single' ? (themeVars?.accent20 ?? 'rgba(59,130,246,0.2)') : 'transparent',
                color: splitMode === 'single' ? (themeVars?.accent ?? '#3b82f6') : (themeVars?.muted ?? '#94a3b8'),
              }}
              onClick={() => onSplitModeChange('single')}
              title="단일 뷰 (Ctrl+\)"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="12" height="12" rx="1.5" />
              </svg>
            </button>
            {/* 수평 분할 (좌우) */}
            <button
              className="p-1.5 transition-colors"
              style={{
                backgroundColor: splitMode === 'horizontal' ? (themeVars?.accent20 ?? 'rgba(59,130,246,0.2)') : 'transparent',
                color: splitMode === 'horizontal' ? (themeVars?.accent ?? '#3b82f6') : (themeVars?.muted ?? '#94a3b8'),
              }}
              onClick={() => onSplitModeChange('horizontal')}
              title="좌우 분할 (Ctrl+\)"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="12" height="12" rx="1.5" />
                <line x1="8" y1="2" x2="8" y2="14" />
              </svg>
            </button>
            {/* 수직 분할 (상하) */}
            <button
              className="p-1.5 transition-colors"
              style={{
                backgroundColor: splitMode === 'vertical' ? (themeVars?.accent20 ?? 'rgba(59,130,246,0.2)') : 'transparent',
                color: splitMode === 'vertical' ? (themeVars?.accent ?? '#3b82f6') : (themeVars?.muted ?? '#94a3b8'),
              }}
              onClick={() => onSplitModeChange('vertical')}
              title="상하 분할 (Ctrl+\)"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="12" height="12" rx="1.5" />
                <line x1="2" y1="8" x2="14" y2="8" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
