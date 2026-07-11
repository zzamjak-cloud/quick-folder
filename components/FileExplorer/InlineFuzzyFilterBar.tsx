import React, { memo } from 'react';
import { Search, X } from 'lucide-react';
import { ThemeVars } from './types';
import type { TranslationKey } from '../../utils/i18n';

interface InlineFuzzyFilterBarProps {
  query: string;
  matchCount: number;
  themeVars: ThemeVars | null;
  onClear: () => void;
  t: (key: TranslationKey) => string;
}

/** 파일 목록 상단에 표시되는 인라인 퍼지 필터 상태 바 */
const InlineFuzzyFilterBar = memo(function InlineFuzzyFilterBar({
  query,
  matchCount,
  themeVars,
  onClear,
  t,
}: InlineFuzzyFilterBarProps) {
  if (!query) return null;

  return (
    <div
      className="sticky top-0 z-20 flex items-center gap-2 px-2 py-1.5 mb-2 rounded-md text-xs"
      style={{
        backgroundColor: themeVars?.surface ?? '#1e293b',
        border: `1px solid ${themeVars?.accent ?? '#3b82f6'}`,
        color: themeVars?.text ?? '#e5e7eb',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      }}
    >
      <Search size={13} style={{ color: themeVars?.accent ?? '#3b82f6', flexShrink: 0 }} />
      <span className="font-mono truncate" style={{ color: themeVars?.accent ?? '#3b82f6' }}>
        {query}
      </span>
      <span style={{ color: themeVars?.muted ?? '#94a3b8' }}>
        {matchCount > 0
          ? t('fuzzy.matchCount').replace('{count}', String(matchCount))
          : t('fuzzy.noMatches')}
      </span>
      <span className="ml-auto text-[10px]" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
        {t('fuzzy.shortcuts')}
      </span>
      <button
        type="button"
        className="p-0.5 rounded hover:opacity-80"
        onClick={onClear}
        title={t('fuzzy.clear')}
      >
        <X size={12} style={{ color: themeVars?.muted ?? '#94a3b8' }} />
      </button>
    </div>
  );
});

export default InlineFuzzyFilterBar;
