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
  {
    code: 'ja',
    flag: '🇯🇵',
    nativeName: '日本語',
    localePrefixes: ['ja'],
  },
  {
    code: 'zh-CN',
    flag: '🇨🇳',
    nativeName: '简体中文',
    localePrefixes: ['zh', 'zh-cn', 'zh-sg', 'zh-hans'],
  },
  {
    code: 'zh-TW',
    flag: '🇹🇼',
    nativeName: '繁體中文',
    localePrefixes: ['zh-tw', 'zh-hk', 'zh-mo', 'zh-hant'],
  },
  {
    code: 'es',
    flag: '🇪🇸',
    nativeName: 'Español',
    localePrefixes: ['es'],
  },
  {
    code: 'fr',
    flag: '🇫🇷',
    nativeName: 'Français',
    localePrefixes: ['fr'],
  },
  {
    code: 'de',
    flag: '🇩🇪',
    nativeName: 'Deutsch',
    localePrefixes: ['de'],
  },
  {
    code: 'ru',
    flag: '🇷🇺',
    nativeName: 'Русский',
    localePrefixes: ['ru'],
  },
  {
    code: 'pt',
    flag: '🇧🇷',
    nativeName: 'Português',
    localePrefixes: ['pt'],
  },
  {
    code: 'it',
    flag: '🇮🇹',
    nativeName: 'Italiano',
    localePrefixes: ['it'],
  },
] as const;

export type AppLanguage = typeof LANGUAGE_OPTIONS[number]['code'];

export const DEFAULT_LANGUAGE: AppLanguage = 'en';
