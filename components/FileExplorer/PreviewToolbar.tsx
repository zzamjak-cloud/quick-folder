import React, { useRef } from 'react';
import { Pen, Square, Circle, Eraser, Trash2, Download } from 'lucide-react';
import { DrawingTool } from '../../types';

interface PreviewToolbarProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  lineWidth: number;
  onLineWidthChange: (width: number) => void;
  onClear: () => void;
  onSave: () => void;
  hasStrokes: boolean;
  themeVars: {
    surface2: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
  } | null;
}

// 도구 목록 정의
const TOOLS: { tool: DrawingTool; icon: React.ElementType; label: string }[] = [
  { tool: 'pen',     icon: Pen,    label: '펜' },
  { tool: 'rect',    icon: Square, label: '사각형' },
  { tool: 'ellipse', icon: Circle, label: '원형' },
  { tool: 'eraser',  icon: Eraser, label: '지우개' },
];

// 색상 프리셋 목록
const COLOR_PRESETS = [
  { hex: '#000000', label: '검정' },
  { hex: '#FFFFFF', label: '흰색' },
  { hex: '#EF4444', label: '빨강' },
  { hex: '#F97316', label: '주황' },
  { hex: '#EAB308', label: '노랑' },
  { hex: '#22C55E', label: '초록' },
  { hex: '#3B82F6', label: '파랑' },
  { hex: '#8B5CF6', label: '보라' },
];

const PreviewToolbar: React.FC<PreviewToolbarProps> = ({
  activeTool,
  onToolChange,
  color,
  onColorChange,
  lineWidth,
  onLineWidthChange,
  onClear,
  onSave,
  hasStrokes,
  themeVars,
}) => {
  // 커스텀 색상 피커 input 참조
  const colorInputRef = useRef<HTMLInputElement>(null);

  // 테마 색상 변수 (폴백 포함)
  const surface2 = themeVars?.surface2 ?? '#1e293b';
  const border   = themeVars?.border   ?? '#334155';
  const text     = themeVars?.text     ?? '#f1f5f9';
  const muted    = themeVars?.muted    ?? '#94a3b8';
  const accent   = themeVars?.accent   ?? '#6366f1';

  // 지우개 모드 여부
  const isEraser = activeTool === 'eraser';

  return (
    <div
      style={{
        background: surface2,
        borderRight: `1px solid ${border}`,
        minWidth: 44,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 4,
        paddingRight: 4,
        overflowY: 'auto',
        flexShrink: 0,
      }}
    >
      {/* 도구 버튼 */}
      {TOOLS.map(({ tool, icon: Icon, label }) => {
        const isActive = activeTool === tool;
        return (
          <button
            key={tool}
            title={label}
            onClick={() => onToolChange(tool)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isActive ? accent + '30' : 'transparent',
              color: isActive ? accent : text,
              flexShrink: 0,
            }}
          >
            <Icon size={16} />
          </button>
        );
      })}

      {/* 구분선 */}
      <div style={{ width: 28, height: 1, background: border, flexShrink: 0 }} />

      {/* 두께 슬라이더 (지우개 모드가 아닐 때만 표시) */}
      {!isEraser && (
        <>
          {/* 현재 두께 값 표시 */}
          <span style={{ fontSize: 9, color: muted, lineHeight: 1 }}>{lineWidth}</span>

          {/* 수직 range 슬라이더 */}
          <input
            type="range"
            min={2}
            max={20}
            value={lineWidth}
            onChange={(e) => onLineWidthChange(Number(e.target.value))}
            style={{
              writingMode: 'vertical-lr' as React.CSSProperties['writingMode'],
              direction: 'rtl' as React.CSSProperties['direction'],
              height: 80,
              width: 20,
              accentColor: accent,
              cursor: 'pointer',
            }}
          />

          {/* 구분선 */}
          <div style={{ width: 28, height: 1, background: border, flexShrink: 0 }} />

          {/* 색상 프리셋 */}
          {COLOR_PRESETS.map(({ hex, label }) => {
            const isSelected = color.toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={hex}
                title={label}
                onClick={() => onColorChange(hex)}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  border: isSelected ? `2px solid ${accent}` : '2px solid transparent',
                  background: hex,
                  cursor: 'pointer',
                  flexShrink: 0,
                  // 흰색 버튼은 내부 테두리로 구분
                  boxShadow:
                    hex === '#FFFFFF'
                      ? 'inset 0 0 0 1px rgba(0,0,0,0.15)'
                      : undefined,
                  padding: 0,
                }}
              />
            );
          })}

          {/* 커스텀 색상 피커 버튼 */}
          <button
            title="커스텀 색상"
            onClick={() => colorInputRef.current?.click()}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: '2px solid transparent',
              background:
                'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
              cursor: 'pointer',
              flexShrink: 0,
              padding: 0,
              fontSize: 11,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              textShadow: '0 0 2px rgba(0,0,0,0.8)',
            }}
          >
            +
          </button>

          {/* 숨겨진 네이티브 color input */}
          <input
            ref={colorInputRef}
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
            tabIndex={-1}
          />

          {/* 구분선 */}
          <div style={{ width: 28, height: 1, background: border, flexShrink: 0 }} />
        </>
      )}

      {/* 지우개 모드일 때 구분선만 표시 */}
      {isEraser && (
        <div style={{ width: 28, height: 1, background: border, flexShrink: 0 }} />
      )}

      {/* 전체 지우기 버튼 */}
      <button
        title="전체 지우기"
        onClick={onClear}
        disabled={!hasStrokes}
        style={{
          width: 36,
          height: 36,
          borderRadius: 6,
          border: 'none',
          cursor: hasStrokes ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          color: hasStrokes ? text : muted,
          opacity: hasStrokes ? 1 : 0.4,
          flexShrink: 0,
        }}
      >
        <Trash2 size={16} />
      </button>

      {/* PNG 저장 버튼 */}
      <button
        title="PNG로 저장"
        onClick={onSave}
        disabled={!hasStrokes}
        style={{
          width: 36,
          height: 36,
          borderRadius: 6,
          border: 'none',
          cursor: hasStrokes ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: hasStrokes ? accent : 'transparent',
          color: hasStrokes ? '#fff' : muted,
          opacity: hasStrokes ? 1 : 0.4,
          flexShrink: 0,
        }}
      >
        <Download size={16} />
      </button>
    </div>
  );
};

export default PreviewToolbar;
