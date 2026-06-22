import test from 'node:test';
import assert from 'node:assert/strict';

import { LANGUAGE_PACKS, enLanguagePack } from '../utils/i18n/packs/index.ts';
import { enTranslations } from '../utils/i18n/packs/en.ts';
import { koTranslations } from '../utils/i18n/packs/ko.ts';

test('언어팩은 기준 번역 키를 모두 포함한다', () => {
  const referenceKeys = Object.keys(koTranslations).sort();

  assert.deepEqual(Object.keys(enTranslations).sort(), referenceKeys);

  for (const [code, pack] of Object.entries(LANGUAGE_PACKS)) {
    assert.equal(pack.code, code);
    assert.deepEqual(Object.keys(pack.translations).sort(), referenceKeys);
  }
});

test('언어팩 번역 값은 빈 문자열이 아니다', () => {
  for (const [code, pack] of Object.entries(LANGUAGE_PACKS)) {
    for (const [key, value] of Object.entries(pack.translations)) {
      assert.notEqual(value.trim(), '', `${code}:${key}`);
    }
  }
});

test('비한국어 언어팩은 레거시 UI 문자열 맵 구조를 유지한다', () => {
  const referenceLegacyKeys = Object.keys(enLanguagePack.legacyTextTranslations ?? {}).sort();

  assert.ok(referenceLegacyKeys.length > 0);

  for (const [code, pack] of Object.entries(LANGUAGE_PACKS)) {
    if (code === 'ko') continue;
    assert.deepEqual(
      Object.keys(pack.legacyTextTranslations ?? {}).sort(),
      referenceLegacyKeys,
      `${code} legacyTextTranslations`,
    );
    assert.ok((pack.legacyPatterns ?? []).length > 0, `${code} legacyPatterns`);
  }
});
