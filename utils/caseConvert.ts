// 파일명 명명 규칙(Case) 변환 유틸리티
// - PascalCase / camelCase / snake_case 상호 전환 지원
// - 입력 파일명에서 확장자는 보존하고 베이스명만 변환한다.
// - 비-ASCII 문자(한글 등)는 구분자가 없으면 하나의 단어로 유지된다.

export type NamingCase = 'pascal' | 'camel' | 'snake';

/**
 * 이름을 단어 배열로 분해한다.
 * - 언더바/하이픈/공백/점은 구분자로 취급
 * - camelCase 경계(lower→Upper, digit→letter)를 단어 경계로 인식
 * - 연속된 대문자는 다음에 소문자가 오면 그 앞에서 끊어준다 (예: "URLParser" → "URL", "Parser")
 */
export function splitWords(name: string): string[] {
  return name
    // 소문자/숫자 뒤 대문자 경계
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // 대문자 연속 뒤에 대문자+소문자 경계 (예: "HTMLParser" → "HTML Parser")
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // 문자↔숫자 경계 (예: "file2data" → "file 2 data")
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    // 구분자 치환
    .replace(/[_\-\s.]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0);
}

function cap(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function toPascalCase(name: string): string {
  return splitWords(name).map(cap).join('');
}

export function toCamelCase(name: string): string {
  const words = splitWords(name);
  if (words.length === 0) return '';
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : cap(w)))
    .join('');
}

export function toSnakeCase(name: string): string {
  return splitWords(name).map(w => w.toLowerCase()).join('_');
}

/**
 * 베이스명(확장자 제외)만 케이스 변환. 확장자/경로 구분자는 건드리지 않는다.
 */
export function convertBaseName(baseName: string, target: NamingCase): string {
  switch (target) {
    case 'pascal': return toPascalCase(baseName);
    case 'camel':  return toCamelCase(baseName);
    case 'snake':  return toSnakeCase(baseName);
  }
}

export function caseLabel(c: NamingCase): string {
  switch (c) {
    case 'pascal': return 'PascalCase';
    case 'camel':  return 'camelCase';
    case 'snake':  return 'snake_case';
  }
}
