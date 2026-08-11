import type { LanguagePack } from '../types';
import { frCommonTranslations } from './fr/common.ts';
import { frSettingsTranslations } from './fr/settings.ts';
import { frSidebarTranslations } from './fr/sidebar.ts';
import { frLanguageTranslations } from './fr/language.ts';
import { frAppTranslations } from './fr/app.ts';
import { frLegacyTextTranslations, frLegacyPatterns } from './fr/legacy.ts';

export const frTranslations = {
  ...frCommonTranslations,
  ...frSettingsTranslations,
  ...frSidebarTranslations,
  ...frLanguageTranslations,
  ...frAppTranslations,
} as const;

export const frLanguagePack = {
  code: 'fr',
  translations: frTranslations,
  legacyTextTranslations: frLegacyTextTranslations,
  legacyPatterns: frLegacyPatterns,
} satisfies LanguagePack;

export { frLegacyTextTranslations, frLegacyPatterns };
