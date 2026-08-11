import type { LanguagePack } from '../types';
import { zhTWCommonTranslations } from './zh-TW/common.ts';
import { zhTWSettingsTranslations } from './zh-TW/settings.ts';
import { zhTWSidebarTranslations } from './zh-TW/sidebar.ts';
import { zhTWLanguageTranslations } from './zh-TW/language.ts';
import { zhTWAppTranslations } from './zh-TW/app.ts';
import { zhTWLegacyTextTranslations, zhTWLegacyPatterns } from './zh-TW/legacy.ts';

export const zhTWTranslations = {
  ...zhTWCommonTranslations,
  ...zhTWSettingsTranslations,
  ...zhTWSidebarTranslations,
  ...zhTWLanguageTranslations,
  ...zhTWAppTranslations,
} as const;

export const zhTWLanguagePack = {
  code: 'zh-TW',
  translations: zhTWTranslations,
  legacyTextTranslations: zhTWLegacyTextTranslations,
  legacyPatterns: zhTWLegacyPatterns,
} satisfies LanguagePack;

export { zhTWLegacyTextTranslations, zhTWLegacyPatterns };
