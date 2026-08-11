import type { LanguagePack } from '../types';
import { ruCommonTranslations } from './ru/common.ts';
import { ruSettingsTranslations } from './ru/settings.ts';
import { ruSidebarTranslations } from './ru/sidebar.ts';
import { ruLanguageTranslations } from './ru/language.ts';
import { ruAppTranslations } from './ru/app.ts';
import { ruLegacyTextTranslations, ruLegacyPatterns } from './ru/legacy.ts';

export const ruTranslations = {
  ...ruCommonTranslations,
  ...ruSettingsTranslations,
  ...ruSidebarTranslations,
  ...ruLanguageTranslations,
  ...ruAppTranslations,
} as const;

export const ruLanguagePack = {
  code: 'ru',
  translations: ruTranslations,
  legacyTextTranslations: ruLegacyTextTranslations,
  legacyPatterns: ruLegacyPatterns,
} satisfies LanguagePack;

export { ruLegacyTextTranslations, ruLegacyPatterns };
