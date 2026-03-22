import React from 'react';
import {
  MousePointer2, Crop, Square, Circle, ArrowRight,
  Type, Pencil, Eraser, RotateCcw, Save
} from 'lucide-react';
import { ToolType } from '../types';
import { ThemeVars } from '../../../../types';

interface ToolbarProps {
  activeTool: ToolType;
  setActiveTool: (t: ToolType) => void;
  onReset: () => void;
  onSave: () => void;
  themeVars: ThemeVars | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

// #1: 도구 목록 — 단축키 포함
const tools: { type: ToolType; icon: React.ElementType; label: string; shortcut?: string }[] = [
  { type: 'select', icon: MousePointer2, label: '선택', shortcut: 'V' },
  { type: 'crop', icon: Crop, label: '크롭' },
  { type: 'rect', icon: Square, label: '사각형', shortcut: 'M' },
  { type: 'circle', icon: Circle, label: '원', shortcut: 'C' },
  { type: 'arrow', icon: ArrowRight, label: '화살표', shortcut: 'A' },
  { type: 'text', icon: Type, label: '텍스트', shortcut: 'T' },
  { type: 'draw', icon: Pencil, label: '펜', shortcut: 'B' },
  { type: 'eraser', icon: Eraser, label: '지우개', shortcut: 'E' },
];

export default function Toolbar({
  activeTool, setActiveTool, onReset, onSave, themeVars,
  canUndo, canRedo, onUndo, onRedo,
}: ToolbarProps) {
  const btnStyle = (active: boolean): React.CSSProperties => ({
    position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, borderRadius: 6, border: 'none', cursor: 'pointer',
    backgroundColor: active ? (themeVars?.accent ?? '#3b82f6') : 'transparent',
    color: active ? '#fff' : (themeVars?.text ?? '#e5e7eb'),
  });

  return (
    <div
      className="flex flex-col gap-1 p-2 shrink-0"
      style={{
        backgroundColor: themeVars?.surface2 ?? '#1e293b',
        borderRight: `1px solid ${themeVars?.border ?? '#334155'}`,
      }}
    >
      {tools.map(({ type, icon: Icon, label, shortcut }) => (
        <button
          key={type}
          style={btnStyle(activeTool === type)}
          onClick={() => setActiveTool(type)}
          title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
        >
          <Icon size={18} />
          {/* #1: 우측 하단 단축키 표시 */}
          {shortcut && (
            <span style={{
              position: 'absolute', right: 2, bottom: 1,
              fontSize: 8, lineHeight: 1, opacity: 0.5,
              color: activeTool === type ? '#fff' : (themeVars?.muted ?? '#888'),
            }}>
              {shortcut}
            </span>
          )}
        </button>
      ))}

      <div style={{ height: 1, backgroundColor: themeVars?.border ?? '#334155', margin: '4px 0' }} />

      <button style={btnStyle(false)} onClick={onUndo} disabled={!canUndo} title="실행취소 (Ctrl+Z)">
        <RotateCcw size={16} />
      </button>

      <div style={{ flex: 1 }} />

      <button style={btnStyle(false)} onClick={onReset} title="원본으로 초기화">
        <RotateCcw size={18} style={{ color: '#f59e0b' }} />
      </button>
      <button style={btnStyle(false)} onClick={onSave} title="저장 (_Desc)">
        <Save size={18} style={{ color: '#22c55e' }} />
      </button>
    </div>
  );
}
