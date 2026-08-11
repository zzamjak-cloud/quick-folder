import type { LanguagePack } from '../types';
import { itCommonTranslations } from './it/common.ts';
import { itSettingsTranslations } from './it/settings.ts';
import { itSidebarTranslations } from './it/sidebar.ts';
import { itLanguageTranslations } from './it/language.ts';
import { itAppTranslations } from './it/app.ts';
import { itLegacyTextTranslations, itLegacyPatterns } from './it/legacy.ts';

export const itTranslations = {
  ...itCommonTranslations,
  ...itSettingsTranslations,
  ...itSidebarTranslations,
  ...itLanguageTranslations,
  ...itAppTranslations,
} as const;

export const itLanguagePack = {
  code: 'it',
  translations: itTranslations,
  legacyTextTranslations: itLegacyTextTranslations,
  legacyPatterns: itLegacyPatterns,
} satisfies LanguagePack;

export { itLegacyTextTranslations, itLegacyPatterns };
