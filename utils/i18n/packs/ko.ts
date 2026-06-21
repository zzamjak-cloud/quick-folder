import type { LanguagePack } from '../types';

export const koTranslations = {
    'settings.title': '설정',
    'settings.help': '도움말',
    'settings.sidebarZoom': '사이드바 줌기능',
    'settings.themeColor': '테마 컬러 변경',
    'settings.language': '언어 설정',
    'sidebar.expand': '사이드바 펼치기 (Ctrl+B)',
    'sidebar.collapse': '사이드바 접기 (Ctrl+B)',
    'sidebar.addSection': '섹션 추가',
    'language.title': '언어 설정',
    'language.current': '현재 언어',
  } as const;

export const koLanguagePack = {
  code: 'ko',
  translations: koTranslations,
} satisfies LanguagePack;
