import type { AppLanguage } from './languageOptions';

export type TranslationMap = Record<string, string>;

export interface LegacyPatternHelpers {
  translateLegacyText: (text: string) => string;
}

export type LegacyPattern = [
  pattern: RegExp,
  formatter: (match: RegExpMatchArray, helpers: LegacyPatternHelpers) => string,
];

export interface LanguagePack {
  code: AppLanguage;
  translations: TranslationMap;
  legacyTextTranslations?: TranslationMap;
  legacyPatterns?: LegacyPattern[];
}
