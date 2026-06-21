import { Check } from 'lucide-react';
import { Modal } from './ui/Modal';
import { LANGUAGE_OPTIONS } from '../utils/i18n';
import type { AppLanguage, TranslationKey } from '../utils/i18n';

interface LanguageSettingsModalProps {
  isOpen: boolean;
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
  onClose: () => void;
  t: (key: TranslationKey) => string;
}

export function LanguageSettingsModal({
  isOpen,
  language,
  onLanguageChange,
  onClose,
  t,
}: LanguageSettingsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('language.title')}>
      <div className="space-y-2">
        <div className="text-xs font-medium text-[var(--qf-muted)]">
          {t('language.current')}
        </div>
        <div className="space-y-1">
          {LANGUAGE_OPTIONS.map(option => {
            const selected = option.code === language;

            return (
              <button
                key={option.code}
                type="button"
                onClick={() => onLanguageChange(option.code)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  selected
                    ? 'border-[var(--qf-accent)] bg-[var(--qf-accent)]/10 text-[var(--qf-text)]'
                    : 'border-[var(--qf-border)] bg-[var(--qf-surface-2)] text-[var(--qf-text)] hover:bg-[var(--qf-surface-hover)]'
                }`}
                aria-pressed={selected}
              >
                <span className="text-lg leading-none">{option.flag}</span>
                <span className="min-w-0 flex-1 text-sm font-medium">{option.nativeName}</span>
                {selected && <Check size={16} className="text-[var(--qf-accent)]" />}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
