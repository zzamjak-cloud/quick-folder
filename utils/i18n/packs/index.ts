import type { AppLanguage } from '../languageOptions';
import type { LanguagePack } from '../types';
import { enLanguagePack } from './en';
import { koLanguagePack, koTranslations } from './ko';

export const LANGUAGE_PACKS: Record<AppLanguage, LanguagePack> = {
  ko: koLanguagePack,
  en: enLanguagePack,
};

export type TranslationKey = keyof typeof koTranslations;

export { enLanguagePack, koLanguagePack };
