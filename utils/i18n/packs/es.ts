import type { LanguagePack } from '../types';
import { esCommonTranslations } from './es/common.ts';
import { esSettingsTranslations } from './es/settings.ts';
import { esSidebarTranslations } from './es/sidebar.ts';
import { esLanguageTranslations } from './es/language.ts';
import { esAppTranslations } from './es/app.ts';
import { esLegacyTextTranslations, esLegacyPatterns } from './es/legacy.ts';

export const esTranslations = {
  ...esCommonTranslations,
  ...esSettingsTranslations,
  ...esSidebarTranslations,
  ...esLanguageTranslations,
  ...esAppTranslations,
} as const;

export const esLanguagePack = {
  code: 'es',
  translations: esTranslations,
  legacyTextTranslations: esLegacyTextTranslations,
  legacyPatterns: esLegacyPatterns,
} satisfies LanguagePack;

export { esLegacyTextTranslations, esLegacyPatterns };
