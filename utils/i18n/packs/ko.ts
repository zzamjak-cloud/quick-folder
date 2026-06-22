import type { LanguagePack } from '../types';
import { koCommonTranslations } from './ko/common.ts';
import { koSettingsTranslations } from './ko/settings.ts';
import { koSidebarTranslations } from './ko/sidebar.ts';
import { koLanguageTranslations } from './ko/language.ts';
import { koAppTranslations } from './ko/app.ts';

export const koTranslations = {
  ...koCommonTranslations,
  ...koSettingsTranslations,
  ...koSidebarTranslations,
  ...koLanguageTranslations,
  ...koAppTranslations,
} as const;

export const koLanguagePack = {
  code: 'ko',
  translations: koTranslations,
} satisfies LanguagePack;
