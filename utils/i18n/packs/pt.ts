import type { LanguagePack } from '../types';
import { ptCommonTranslations } from './pt/common.ts';
import { ptSettingsTranslations } from './pt/settings.ts';
import { ptSidebarTranslations } from './pt/sidebar.ts';
import { ptLanguageTranslations } from './pt/language.ts';
import { ptAppTranslations } from './pt/app.ts';
import { ptLegacyTextTranslations, ptLegacyPatterns } from './pt/legacy.ts';

export const ptTranslations = {
  ...ptCommonTranslations,
  ...ptSettingsTranslations,
  ...ptSidebarTranslations,
  ...ptLanguageTranslations,
  ...ptAppTranslations,
} as const;

export const ptLanguagePack = {
  code: 'pt',
  translations: ptTranslations,
  legacyTextTranslations: ptLegacyTextTranslations,
  legacyPatterns: ptLegacyPatterns,
} satisfies LanguagePack;

export { ptLegacyTextTranslations, ptLegacyPatterns };
