import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ThemeVars } from '../types';

interface CodePreviewReadOnlyLinesProps {
  themeVars: ThemeVars;
  visibleLines: number[];
  blockMap: Map<number, number>;
  foldedStarts: Set<number>;
  searchQuery: string;
  matchLines: number[];
  searchMatchIndex: number;
  lineRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  lineNumWidth: number;
  codeMuted: string;
  codeBorder: string;
  codeText: string;
  isLightTheme: boolean;
  getLineHtml: (lineIdx: number) => string;
  toggleFold: (lineIdx: number) => void;
}

export function CodePreviewReadOnlyLines({
  themeVars,
  visibleLines,
  blockMap,
  foldedStarts,
  searchQuery,
  matchLines,
  searchMatchIndex,
  lineRefs,
  lineNumWidth,
  codeMuted,
  codeBorder,
  codeText,
  isLightTheme,
  getLineHtml,
  toggleFold,
}: CodePreviewReadOnlyLinesProps) {
  return (
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

            <div
              className="flex-1 px-3 py-0 overflow-x-visible whitespace-pre"
              style={{ tabSize: 2, color: codeText }}
            >
              {isFolded ? (
                <span>
                  <span dangerouslySetInnerHTML={{ __html: getLineHtml(lineIdx) }} />
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
                <span dangerouslySetInnerHTML={{ __html: getLineHtml(lineIdx) }} />
              )}
            </div>
          </div>
        );
      })}
      <div style={{ height: 40 }} />
    </div>
  );
}
