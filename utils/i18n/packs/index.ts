import type { AppLanguage } from '../languageOptions';
import type { LanguagePack } from '../types';
import { enLanguagePack } from './en.ts';
import { koLanguagePack, koTranslations } from './ko.ts';

export const LANGUAGE_PACKS: Record<AppLanguage, LanguagePack> = {
  ko: koLanguagePack,
  en: enLanguagePack,
};

export type TranslationKey = keyof typeof koTranslations;

export { enLanguagePack, koLanguagePack };
