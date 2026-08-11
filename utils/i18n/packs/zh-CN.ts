import type { LanguagePack } from '../types';
import { zhCNCommonTranslations } from './zh-CN/common.ts';
import { zhCNSettingsTranslations } from './zh-CN/settings.ts';
import { zhCNSidebarTranslations } from './zh-CN/sidebar.ts';
import { zhCNLanguageTranslations } from './zh-CN/language.ts';
import { zhCNAppTranslations } from './zh-CN/app.ts';
import { zhCNLegacyTextTranslations, zhCNLegacyPatterns } from './zh-CN/legacy.ts';

export const zhCNTranslations = {
  ...zhCNCommonTranslations,
  ...zhCNSettingsTranslations,
  ...zhCNSidebarTranslations,
  ...zhCNLanguageTranslations,
  ...zhCNAppTranslations,
} as const;

export const zhCNLanguagePack = {
  code: 'zh-CN',
  translations: zhCNTranslations,
  legacyTextTranslations: zhCNLegacyTextTranslations,
  legacyPatterns: zhCNLegacyPatterns,
} satisfies LanguagePack;

export { zhCNLegacyTextTranslations, zhCNLegacyPatterns };
