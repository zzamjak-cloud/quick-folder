import type { AppLanguage } from '../languageOptions';
import type { LanguagePack } from '../types';
import { enLanguagePack } from './en.ts';
import { koLanguagePack, koTranslations } from './ko.ts';
import { jaLanguagePack } from './ja.ts';
import { zhCNLanguagePack } from './zh-CN.ts';
import { zhTWLanguagePack } from './zh-TW.ts';
import { esLanguagePack } from './es.ts';
import { frLanguagePack } from './fr.ts';
import { deLanguagePack } from './de.ts';
import { ruLanguagePack } from './ru.ts';
import { ptLanguagePack } from './pt.ts';
import { itLanguagePack } from './it.ts';

export const LANGUAGE_PACKS: Record<AppLanguage, LanguagePack> = {
  ko: koLanguagePack,
  en: enLanguagePack,
  ja: jaLanguagePack,
  'zh-CN': zhCNLanguagePack,
  'zh-TW': zhTWLanguagePack,
  es: esLanguagePack,
  fr: frLanguagePack,
  de: deLanguagePack,
  ru: ruLanguagePack,
  pt: ptLanguagePack,
  it: itLanguagePack,
};

export type TranslationKey = keyof typeof koTranslations;

export { enLanguagePack, koLanguagePack };
