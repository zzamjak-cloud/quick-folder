export const LANGUAGE_OPTIONS = [
  {
    code: 'ko',
    flag: '🇰🇷',
    nativeName: '한국어',
    localePrefixes: ['ko'],
  },
  {
    code: 'en',
    flag: '🇺🇸',
    nativeName: 'English',
    localePrefixes: ['en'],
  },
] as const;

export type AppLanguage = typeof LANGUAGE_OPTIONS[number]['code'];

export const DEFAULT_LANGUAGE: AppLanguage = 'en';
