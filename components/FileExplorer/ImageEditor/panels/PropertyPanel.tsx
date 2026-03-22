import React from 'react';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { ThemeVars } from '../../../../types';

interface PropertyPanelProps {
  strokeColor: string;
  setStrokeColor: (c: string) => void;
  strokeWidth: number;
  setStrokeWidth: (w: number) => void;
  fontSize: number;
  setFontSize: (s: number) => void;
  themeVars: ThemeVars | null;
  // #4: 텍스트 정렬
  showTextAlign: boolean;
  textAlign: 'left' | 'center' | 'right';
  onTextAlignChange: (align: 'left' | 'center' | 'right') => void;
}

const PRESET_COLORS = ['#ff0000', '#ff6600', '#ffcc00', '#00cc00', '#0066ff', '#9933ff', '#ffffff', '#000000'];

export default function PropertyPanel({
  strokeColor, setStrokeColor, strokeWidth, setStrokeWidth,
  fontSize, setFontSize, themeVars,
  showTextAlign, textAlign, onTextAlignChange,
}: PropertyPanelProps) {
  const labelStyle: React.CSSProperties = {
    color: themeVars?.muted ?? '#888', fontSize: 11, marginBottom: 4,
  };

  const alignBtnStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 4, border: 'none', cursor: 'pointer',
    backgroundColor: active ? (themeVars?.accent ?? '#3b82f6') : 'transparent',
    color: active ? '#fff' : (themeVars?.text ?? '#e5e7eb'),
  });

  return (
    <div
      className="flex items-center gap-4 px-4 py-2 shrink-0"
      style={{
        backgroundColor: themeVars?.surface2 ?? '#1e293b',
        borderTop: `1px solid ${themeVars?.border ?? '#334155'}`,
      }}
    >
      {/* 색상 프리셋 */}
      <div>
        <div style={labelStyle}>색상</div>
        <div className="flex gap-1">
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => setStrokeColor(c)}
              style={{
                width: 20, height: 20, borderRadius: 4,
                border: strokeColor === c ? '2px solid #fff' : '1px solid #555',
                backgroundColor: c, cursor: 'pointer',
              }}
            />
          ))}
          <input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)}
            style={{ width: 20, height: 20, border: 'none', cursor: 'pointer', padding: 0 }}
          />
        </div>
      </div>

      {/* 두께 */}
      <div>
        <div style={labelStyle}>두께 ({strokeWidth}px)</div>
        <input type="range" min={1} max={20} value={strokeWidth}
          onChange={e => setStrokeWidth(Number(e.target.value))}
          style={{ width: 100 }}
        />
      </div>

      {/* 폰트 크기 */}
      <div>
        <div style={labelStyle}>글자 ({fontSize}px)</div>
        <input type="range" min={10} max={72} value={fontSize}
          onChange={e => setFontSize(Number(e.target.value))}
          style={{ width: 100 }}
        />
      </div>

      {/* #4: 텍스트 정렬 — 텍스트 요소 선택 시만 표시 */}
      {showTextAlign && (
        <div>
          <div style={labelStyle}>정렬</div>
          <div className="flex gap-1">
            <button style={alignBtnStyle(textAlign === 'left')} onClick={() => onTextAlignChange('left')} title="좌측 정렬">
              <AlignLeft size={14} />
            </button>
            <button style={alignBtnStyle(textAlign === 'center')} onClick={() => onTextAlignChange('center')} title="중앙 정렬">
              <AlignCenter size={14} />
            </button>
            <button style={alignBtnStyle(textAlign === 'right')} onClick={() => onTextAlignChange('right')} title="우측 정렬">
              <AlignRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
