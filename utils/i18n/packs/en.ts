import type { LanguagePack } from '../types';
import { enCommonTranslations } from './en/common.ts';
import { enSettingsTranslations } from './en/settings.ts';
import { enSidebarTranslations } from './en/sidebar.ts';
import { enLanguageTranslations } from './en/language.ts';
import { enAppTranslations } from './en/app.ts';
import { enLegacyTextTranslations, englishLegacyPatterns } from './en/legacy.ts';

export const enTranslations = {
  ...enCommonTranslations,
  ...enSettingsTranslations,
  ...enSidebarTranslations,
  ...enLanguageTranslations,
  ...enAppTranslations,
} as const;

export const enLanguagePack = {
  code: 'en',
  translations: enTranslations,
  legacyTextTranslations: enLegacyTextTranslations,
  legacyPatterns: englishLegacyPatterns,
} satisfies LanguagePack;

export { enLegacyTextTranslations, englishLegacyPatterns };
