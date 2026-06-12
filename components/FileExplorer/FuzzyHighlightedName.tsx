import React, { memo, useMemo } from 'react';
import { ThemeVars } from './types';

interface FuzzyHighlightedNameProps {
  name: string;
  indices: number[];
  themeVars: ThemeVars | null;
  className?: string;
  style?: React.CSSProperties;
}

/** 퍼지 매칭 인덱스에 따라 파일명 일부를 강조 표시 */
const FuzzyHighlightedName = memo(function FuzzyHighlightedName({
  name,
  indices,
  themeVars,
  className,
  style,
}: FuzzyHighlightedNameProps) {
  const segments = useMemo(() => {
    if (!indices.length) return [{ text: name, highlight: false }];

    const indexSet = new Set(indices);
    const parts: Array<{ text: string; highlight: boolean }> = [];
    let buf = '';
    let bufHighlight = indexSet.has(0);

    for (let i = 0; i < name.length; i++) {
      const highlight = indexSet.has(i);
      if (i > 0 && highlight !== bufHighlight) {
        parts.push({ text: buf, highlight: bufHighlight });
        buf = '';
        bufHighlight = highlight;
      }
      buf += name[i];
    }
    if (buf) parts.push({ text: buf, highlight: bufHighlight });
    return parts;
  }, [name, indices]);

  const accent = themeVars?.accent ?? '#3b82f6';
  const textColor = themeVars?.text ?? '#e5e7eb';

  return (
    <span className={className} style={style}>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <mark
            key={i}
            style={{
              backgroundColor: `${accent}55`,
              color: textColor,
              borderRadius: 2,
              padding: '0 1px',
            }}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
});

export default FuzzyHighlightedName;
