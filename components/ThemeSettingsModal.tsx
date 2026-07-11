import React from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { THEME_PRESETS, normalizeHexColor } from '../hooks/useThemeManagement';
import type { TranslationKey } from '../utils/i18n';

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
  t: (key: TranslationKey) => string;
}

export function ThemeSettingsModal({ isOpen, onClose, theme, t }: ThemeSettingsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('theme.title')}>
      <div className="space-y-5">
        <div>
          <div className="text-sm font-medium text-[var(--qf-muted)] mb-2">{t('theme.preset')}</div>
          <div className="grid grid-cols-2 gap-2">
            {THEME_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  theme.setThemeId(preset.id);
                  theme.setBgInputValue(preset.bg);
                  theme.setAccentInputValue(preset.accent);
                }}
                className={`flex items-center gap-2 p-2 rounded-lg border transition-colors bg-[var(--qf-surface)] hover:bg-[var(--qf-surface-hover)] border-[var(--qf-border)] ${theme.themeId === preset.id ? 'ring-2 ring-[var(--qf-accent)]' : ''}`}
                title={`${preset.bg} / ${preset.accent}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md border border-white/10" style={{ backgroundColor: preset.bg }} />
                  <span className="w-2.5 h-2.5 rounded-full border border-white/10" style={{ backgroundColor: preset.accent }} />
                </span>
                <span className="text-xs text-[var(--qf-text)] truncate">{t(preset.nameKey as TranslationKey)}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-[var(--qf-muted)] mb-2">{t('theme.custom')}</div>
          <div className="flex items-center gap-3 mb-3">
            <input type="color" value={normalizeHexColor(theme.bgInputValue) ?? theme.customBg} onChange={(e) => theme.setBgInputValue(e.target.value)} className="h-10 w-12 rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface-2)] p-1" aria-label={t('theme.backgroundColorAria')} />
            <input type="text" value={theme.bgInputValue} onChange={(e) => theme.setBgInputValue(e.target.value)} placeholder="#0f172a" className="flex-1 bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs" />
          </div>
          <div className="flex items-center gap-3">
            <input type="color" value={normalizeHexColor(theme.accentInputValue) ?? theme.customAccent} onChange={(e) => theme.setAccentInputValue(e.target.value)} className="h-10 w-12 rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface-2)] p-1" aria-label={t('theme.accentColorAria')} />
            <input type="text" value={theme.accentInputValue} onChange={(e) => theme.setAccentInputValue(e.target.value)} placeholder="#3b82f6" className="flex-1 bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs" />
            <Button type="button" variant="secondary" onClick={() => theme.applyCustomTheme(theme.bgInputValue, theme.accentInputValue)}>{t('common.apply')}</Button>
          </div>
          <div className="text-[11px] text-[var(--qf-muted)] mt-2">{t('theme.hexHelp')}</div>
        </div>

        <div className="pt-2 flex justify-between items-center">
          <Button type="button" variant="ghost" onClick={() => { theme.setThemeId(THEME_PRESETS[0].id); theme.setBgInputValue(THEME_PRESETS[0].bg); theme.setAccentInputValue(THEME_PRESETS[0].accent); }}>{t('theme.resetDefault')}</Button>
          <Button type="button" variant="ghost" onClick={onClose}>{t('theme.close')}</Button>
        </div>
      </div>
    </Modal>
  );
}
