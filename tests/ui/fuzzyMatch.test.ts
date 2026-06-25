import { describe, expect, test } from 'vitest';
import { fuzzyMatch } from '../../utils/fuzzyMatch';

describe('fuzzyMatch 한글 NFC/NFD 정규화', () => {
  // macOS 파일명은 NFD(분해형)로 들어오고, 키보드 입력은 NFC(조합형)이다.
  const nfcName = '버전히스토리.txt'.normalize('NFC');
  const nfdName = '버전히스토리.txt'.normalize('NFD');

  test('NFC 검색어로 NFD 파일명을 매칭한다', () => {
    const result = fuzzyMatch('버전히스토리', nfdName);
    expect(result).not.toBeNull();
    expect(result!.indices.length).toBe('버전히스토리'.normalize('NFC').length);
  });

  test('NFC 검색어로 NFC 파일명을 매칭한다', () => {
    expect(fuzzyMatch('버전', nfcName)).not.toBeNull();
  });

  test('일치하지 않는 한글은 null', () => {
    expect(fuzzyMatch('없는단어', nfdName)).toBeNull();
  });
});
