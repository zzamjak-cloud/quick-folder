import { DEFAULT_LANGUAGE, LANGUAGE_OPTIONS } from './i18n/languageOptions';
import type { AppLanguage } from './i18n/languageOptions';
import { LANGUAGE_PACKS } from './i18n/packs';
import type { TranslationKey } from './i18n/packs';
import { readStorage } from './storage';

export { LANGUAGE_OPTIONS } from './i18n/languageOptions';
export type { AppLanguage } from './i18n/languageOptions';
export { LANGUAGE_PACKS } from './i18n/packs';
export type { TranslationKey } from './i18n/packs';

// 사용자가 직접 선택한 언어만 저장한다. 값이 없으면 OS Locale을 기준으로 기본 언어를 감지한다.
export const LANGUAGE_STORAGE_KEY = 'qf_language';

const LOCALIZABLE_ATTRIBUTES = ['title', 'aria-label', 'placeholder'] as const;
const SKIP_LOCALIZATION_SELECTOR = [
  'script',
  'style',
  'textarea',
  'input',
  'pre',
  'code',
  '[contenteditable="true"]',
  '.ProseMirror',
  '[data-qf-no-i18n="true"]',
].join(',');
const SKIP_ATTRIBUTE_LOCALIZATION_SELECTOR = [
  'script',
  'style',
  '[data-qf-no-i18n="true"]',
].join(',');

export function isSupportedLanguage(value: string | null): value is AppLanguage {
  return LANGUAGE_OPTIONS.some(option => option.code === value);
}

export function detectOsLanguage(): AppLanguage {
  const localeCandidates = typeof navigator === 'undefined'
    ? []
    : [...(navigator.languages ?? []), navigator.language].filter(Boolean);

  for (const locale of localeCandidates) {
    const normalized = locale.toLowerCase();
    const matched = LANGUAGE_OPTIONS.find(option =>
      option.localePrefixes.some(prefix =>
        normalized === prefix ||
        normalized.startsWith(`${prefix}-`) ||
        normalized.startsWith(`${prefix}_`)
      )
    );
    if (matched) return matched.code;
  }

  return DEFAULT_LANGUAGE;
}

export function getInitialLanguage(): AppLanguage {
  const storedLanguage = readStorage(LANGUAGE_STORAGE_KEY);
  return isSupportedLanguage(storedLanguage) ? storedLanguage : detectOsLanguage();
}

export function translate(language: AppLanguage, key: TranslationKey): string {
  return LANGUAGE_PACKS[language]?.translations[key] ?? LANGUAGE_PACKS.ko.translations[key];
}

export function translateLegacyText(language: AppLanguage, text: string): string {
  if (language === 'ko' || !text || !/[가-힣]/.test(text)) return text;

  const pack = LANGUAGE_PACKS[language];
  const exactMap = pack.legacyTextTranslations;
  if (exactMap?.[text]) return exactMap[text];

  for (const [pattern, formatter] of pack.legacyPatterns ?? []) {
    const match = text.match(pattern);
    if (match) {
      return formatter(match, {
        translateLegacyText: value => translateLegacyText(language, value),
      });
    }
  }

  return text;
}

function translatePreservingWhitespace(language: AppLanguage, value: string): string {
  const match = value.match(/^(\s*)(.*?)(\s*)$/s);
  if (!match) return value;
  const [, prefix, core, suffix] = match;
  const translated = translateLegacyText(language, core);
  return translated === core ? value : `${prefix}${translated}${suffix}`;
}

function shouldSkipNode(node: Node): boolean {
  const parent = node.parentElement;
  return !parent || Boolean(parent.closest(SKIP_LOCALIZATION_SELECTOR));
}

function localizeTextNode(node: Node, language: AppLanguage): void {
  if (shouldSkipNode(node) || !node.textContent || !/[가-힣]/.test(node.textContent)) return;
  const translated = translatePreservingWhitespace(language, node.textContent);
  if (translated !== node.textContent) node.textContent = translated;
}

function localizeElementAttributes(element: Element, language: AppLanguage): void {
  if (element.closest(SKIP_ATTRIBUTE_LOCALIZATION_SELECTOR)) return;

  for (const attribute of LOCALIZABLE_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (!value || !/[가-힣]/.test(value)) continue;
    const translated = translatePreservingWhitespace(language, value);
    if (translated !== value) element.setAttribute(attribute, translated);
  }
}

function localizeDomTree(root: ParentNode, language: AppLanguage): void {
  if (language === 'ko') return;

  if (root instanceof Element) localizeElementAttributes(root, language);

  const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode = textWalker.nextNode();
  while (textNode) {
    localizeTextNode(textNode, language);
    textNode = textWalker.nextNode();
  }

  if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
    root.querySelectorAll?.('*').forEach(element => localizeElementAttributes(element, language));
  }
}

export function installDomLocalization(language: AppLanguage): () => void {
  if (typeof document === 'undefined' || language === 'ko') return () => {};

  const localize = () => {
    if (document.body) localizeDomTree(document.body, language);
  };

  localize();

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        localizeTextNode(mutation.target, language);
        continue;
      }

      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        localizeElementAttributes(mutation.target, language);
        continue;
      }

      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          localizeTextNode(node, language);
        } else if (node instanceof Element) {
          localizeDomTree(node, language);
        }
      });
    }
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...LOCALIZABLE_ATTRIBUTES],
    });
  }

  return () => observer.disconnect();
}
