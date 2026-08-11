import type { LanguagePack } from '../types';
import { jaCommonTranslations } from './ja/common.ts';
import { jaSettingsTranslations } from './ja/settings.ts';
import { jaSidebarTranslations } from './ja/sidebar.ts';
import { jaLanguageTranslations } from './ja/language.ts';
import { jaAppTranslations } from './ja/app.ts';
import { jaLegacyTextTranslations, jaLegacyPatterns } from './ja/legacy.ts';

export const jaTranslations = {
  ...jaCommonTranslations,
  ...jaSettingsTranslations,
  ...jaSidebarTranslations,
  ...jaLanguageTranslations,
  ...jaAppTranslations,
} as const;

export const jaLanguagePack = {
  code: 'ja',
  translations: jaTranslations,
  legacyTextTranslations: jaLegacyTextTranslations,
  legacyPatterns: jaLegacyPatterns,
} satisfies LanguagePack;

export { jaLegacyTextTranslations, jaLegacyPatterns };
