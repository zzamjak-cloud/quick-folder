import React from 'react';
import { Search, X } from 'lucide-react';
import type { ThemeVars } from '../types';

interface CodePreviewSearchBarProps {
  themeVars: ThemeVars;
  editMode: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchQuery: string;
  replaceQuery: string;
  matchCount: number;
  searchMatchIndex: number;
  onSearchQueryChange: (value: string) => void;
  onReplaceQueryChange: (value: string) => void;
  onPreviousMatch: () => void;
  onNextMatch: () => void;
  onCloseSearch: () => void;
  onReplaceNext: () => void;
  onReplaceAll: () => void;
}

export function CodePreviewSearchBar({
  themeVars,
  editMode,
  searchInputRef,
  searchQuery,
  replaceQuery,
  matchCount,
  searchMatchIndex,
  onSearchQueryChange,
  onReplaceQueryChange,
  onPreviousMatch,
  onNextMatch,
  onCloseSearch,
  onReplaceNext,
  onReplaceAll,
}: CodePreviewSearchBarProps) {
  return (
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
          onChange={e => onSearchQueryChange(e.target.value)}
          placeholder="검색어 입력... (Enter: 다음, Shift+Enter: 이전)"
          className="flex-1 text-xs outline-none bg-transparent"
          style={{ color: themeVars.text }}
        />
        {!editMode && (
          <span className="text-xs tabular-nums" style={{ color: themeVars.muted }}>
            {matchCount === 0
              ? (searchQuery ? '없음' : '')
              : `${searchMatchIndex + 1} / ${matchCount}`}
          </span>
        )}
        <SearchNavButton themeVars={themeVars} onClick={onPreviousMatch} title="이전 매칭 (Shift+Enter)">
          ↑
        </SearchNavButton>
        <SearchNavButton themeVars={themeVars} onClick={onNextMatch} title="다음 매칭 (Enter)">
          ↓
        </SearchNavButton>
        <button
          className="p-0.5 hover:opacity-70"
          style={{ color: themeVars.muted }}
          onClick={onCloseSearch}
          title="검색 닫기 (ESC)"
        >
          <X size={13} />
        </button>
      </div>

      {editMode && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] w-4 flex-shrink-0" style={{ color: themeVars.muted }}>↻</span>
          <input
            type="text"
            value={replaceQuery}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onChange={e => onReplaceQueryChange(e.target.value)}
            placeholder="대체할 텍스트..."
            className="flex-1 text-xs outline-none bg-transparent"
            style={{ color: themeVars.text }}
          />
          <SearchNavButton
            themeVars={themeVars}
            onClick={onReplaceNext}
            disabled={!searchQuery}
            title="현재 매칭 1개를 변경하고 다음으로 이동"
          >
            다음 변경
          </SearchNavButton>
          <button
            className="px-2 py-0.5 text-xs rounded hover:opacity-70"
            style={{
              backgroundColor: `${themeVars.accent}30`,
              color: themeVars.accent,
              border: `1px solid ${themeVars.accent}`,
            }}
            onClick={onReplaceAll}
            disabled={!searchQuery}
            title="전체 매칭을 일괄 변경"
          >
            모두 변경
          </button>
        </div>
      )}
    </div>
  );
}

function SearchNavButton({
  themeVars,
  onClick,
  title,
  disabled,
  children,
}: {
  themeVars: ThemeVars;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className="px-2 py-0.5 text-xs rounded hover:opacity-70 disabled:opacity-50"
      style={{
        backgroundColor: themeVars.surface2,
        color: themeVars.text,
        border: `1px solid ${themeVars.border}`,
      }}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}
