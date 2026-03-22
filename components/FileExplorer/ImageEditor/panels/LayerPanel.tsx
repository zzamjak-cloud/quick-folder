import React from 'react';
import { Plus, Trash2, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { Layer } from '../types';
import { ThemeVars } from '../../../../types';

interface LayerPanelProps {
  layers: Layer[];
  activeLayerId: string;
  setActiveLayerId: (id: string) => void;
  addLayer: () => void;
  removeLayer: (id: string) => void;
  toggleVisibility: (id: string) => void;
  toggleLock: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  themeVars: ThemeVars | null;
}

export default function LayerPanel({
  layers, activeLayerId, setActiveLayerId, addLayer, removeLayer,
  toggleVisibility, toggleLock, renameLayer, themeVars,
}: LayerPanelProps) {
  return (
    <div
      className="flex flex-col shrink-0"
      style={{
        width: 200,
        backgroundColor: themeVars?.surface2 ?? '#1e293b',
        borderLeft: `1px solid ${themeVars?.border ?? '#334155'}`,
      }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}
      >
        <span style={{ color: themeVars?.text ?? '#e5e7eb', fontSize: 12, fontWeight: 600 }}>
          레이어
        </span>
        <button onClick={addLayer}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: themeVars?.muted ?? '#888' }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* 레이어 목록 (역순 — 위가 최상위) */}
      <div className="flex-1 overflow-y-auto">
        {[...layers].reverse().map(layer => (
          <div
            key={layer.id}
            className="flex items-center gap-1 px-2 py-1.5 cursor-pointer"
            style={{
              backgroundColor: layer.id === activeLayerId
                ? (themeVars?.accent20 ?? 'rgba(59,130,246,0.2)') : 'transparent',
              borderBottom: `1px solid ${themeVars?.border ?? '#334155'}`,
            }}
            onClick={() => setActiveLayerId(layer.id)}
          >
            <button onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: layer.visible ? (themeVars?.text ?? '#e5e7eb') : (themeVars?.muted ?? '#555') }}
            >
              {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); toggleLock(layer.id); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: layer.locked ? '#f59e0b' : (themeVars?.muted ?? '#555') }}
            >
              {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
            <span
              className="flex-1 truncate text-xs"
              style={{ color: themeVars?.text ?? '#e5e7eb' }}
              onDoubleClick={(e) => {
                const span = e.currentTarget;
                const input = document.createElement('input');
                input.value = layer.name;
                input.className = 'text-xs';
                input.style.cssText = 'background:transparent;border:1px solid #3b82f6;color:white;width:100%;outline:none;padding:0 2px;';
                span.replaceWith(input);
                input.focus();
                input.select();
                const finish = () => { renameLayer(layer.id, input.value || layer.name); };
                input.addEventListener('blur', finish, { once: true });
                input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') input.blur(); });
              }}
            >
              {layer.name}
            </span>
            <button onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: themeVars?.muted ?? '#555' }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
