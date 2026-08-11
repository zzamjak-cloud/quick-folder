import type { LanguagePack } from '../types';
import { deCommonTranslations } from './de/common.ts';
import { deSettingsTranslations } from './de/settings.ts';
import { deSidebarTranslations } from './de/sidebar.ts';
import { deLanguageTranslations } from './de/language.ts';
import { deAppTranslations } from './de/app.ts';
import { deLegacyTextTranslations, deLegacyPatterns } from './de/legacy.ts';

export const deTranslations = {
  ...deCommonTranslations,
  ...deSettingsTranslations,
  ...deSidebarTranslations,
  ...deLanguageTranslations,
  ...deAppTranslations,
} as const;

export const deLanguagePack = {
  code: 'de',
  translations: deTranslations,
  legacyTextTranslations: deLegacyTextTranslations,
  legacyPatterns: deLegacyPatterns,
} satisfies LanguagePack;

export { deLegacyTextTranslations, deLegacyPatterns };
