import React from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { THEME_PRESETS, normalizeHexColor } from '../hooks/useThemeManagement';

interface ThemeSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: {
    themeId: string;
    setThemeId: (id: string) => void;
    bgInputValue: string;
    setBgInputValue: (v: string) => void;
    accentInputValue: string;
    setAccentInputValue: (v: string) => void;
    customBg: string;
    customAccent: string;
    applyCustomTheme: (bg: string, accent: string) => void;
  };
}

export function ThemeSettingsModal({ isOpen, onClose, theme }: ThemeSettingsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="테마 설정">
      <div className="space-y-5">
        <div>
          <div className="text-sm font-medium text-[var(--qf-muted)] mb-2">프리셋 테마</div>
          <div className="grid grid-cols-2 gap-2">
            {THEME_PRESETS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  theme.setThemeId(t.id);
                  theme.setBgInputValue(t.bg);
                  theme.setAccentInputValue(t.accent);
                }}
                className={`flex items-center gap-2 p-2 rounded-lg border transition-colors bg-[var(--qf-surface)] hover:bg-[var(--qf-surface-hover)] border-[var(--qf-border)] ${theme.themeId === t.id ? 'ring-2 ring-[var(--qf-accent)]' : ''}`}
                title={`${t.bg} / ${t.accent}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md border border-white/10" style={{ backgroundColor: t.bg }} />
                  <span className="w-2.5 h-2.5 rounded-full border border-white/10" style={{ backgroundColor: t.accent }} />
                </span>
                <span className="text-xs text-[var(--qf-text)] truncate">{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-[var(--qf-muted)] mb-2">커스텀 (배경 + 강조색)</div>
          <div className="flex items-center gap-3 mb-3">
            <input type="color" value={normalizeHexColor(theme.bgInputValue) ?? theme.customBg} onChange={(e) => theme.setBgInputValue(e.target.value)} className="h-10 w-12 rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface-2)] p-1" aria-label="배경색 선택" />
            <input type="text" value={theme.bgInputValue} onChange={(e) => theme.setBgInputValue(e.target.value)} placeholder="#0f172a" className="flex-1 bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs" />
          </div>
          <div className="flex items-center gap-3">
            <input type="color" value={normalizeHexColor(theme.accentInputValue) ?? theme.customAccent} onChange={(e) => theme.setAccentInputValue(e.target.value)} className="h-10 w-12 rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface-2)] p-1" aria-label="강조색 선택" />
            <input type="text" value={theme.accentInputValue} onChange={(e) => theme.setAccentInputValue(e.target.value)} placeholder="#3b82f6" className="flex-1 bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs" />
            <Button type="button" variant="secondary" onClick={() => theme.applyCustomTheme(theme.bgInputValue, theme.accentInputValue)}>적용</Button>
          </div>
          <div className="text-[11px] text-[var(--qf-muted)] mt-2">* `#RRGGBB` 형식만 지원합니다.</div>
        </div>

        <div className="pt-2 flex justify-between items-center">
          <Button type="button" variant="ghost" onClick={() => { theme.setThemeId(THEME_PRESETS[0].id); theme.setBgInputValue(THEME_PRESETS[0].bg); theme.setAccentInputValue(THEME_PRESETS[0].accent); }}>기본값으로</Button>
          <Button type="button" variant="ghost" onClick={onClose}>닫기</Button>
        </div>
      </div>
    </Modal>
  );
}
