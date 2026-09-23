import { describe, expect, test } from 'vitest';
import { isUnderRoot } from '../../components/FileExplorer/hooks/useAgentAvailability';

describe('isUnderRoot — 우클릭 메뉴 노출 판단', () => {
  test('허용 루트가 없으면 아무 폴더도 통과하지 않는다', () => {
    expect(isUnderRoot('C:/Pictures', [])).toBe(false);
  });

  test('루트 자신과 하위 폴더를 허용한다', () => {
    const roots = ['C:\\Users\\me\\Pictures'];
    expect(isUnderRoot('C:\\Users\\me\\Pictures', roots)).toBe(true);
    expect(isUnderRoot('C:\\Users\\me\\Pictures\\2026', roots)).toBe(true);
  });

  test('구분자와 대소문자가 섞여도 같은 경로로 본다', () => {
    expect(isUnderRoot('c:/users/ME/pictures/cats', ['C:\\Users\\me\\Pictures'])).toBe(true);
  });

  test('끝 구분자는 무시한다', () => {
    expect(isUnderRoot('C:/Pictures/cats', ['C:/Pictures/'])).toBe(true);
  });

  test('접두사만 같은 형제 폴더는 거부한다', () => {
    expect(isUnderRoot('C:/Pictures2/cats', ['C:/Pictures'])).toBe(false);
  });

  test('루트 밖은 거부한다', () => {
    expect(isUnderRoot('C:/Windows/System32', ['C:/Pictures', 'C:/Downloads'])).toBe(false);
  });
});
