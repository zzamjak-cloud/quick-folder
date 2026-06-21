// 텍스트/숫자 청크를 분리해 파일명 자연 정렬을 수행한다.
export function naturalCompare(a: string, b: string, locale = 'ko'): number {
  const re = /(\d+)|(\D+)/g;
  const aParts = a.match(re) || [];
  const bParts = b.match(re) || [];
  const len = Math.min(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const aIsNum = /^\d/.test(aParts[i]);
    const bIsNum = /^\d/.test(bParts[i]);

    if (aIsNum && bIsNum) {
      const diff = parseInt(aParts[i], 10) - parseInt(bParts[i], 10);
      if (diff !== 0) return diff;
      if (aParts[i].length !== bParts[i].length) {
        return aParts[i].length - bParts[i].length;
      }
    } else if (aIsNum !== bIsNum) {
      return aIsNum ? -1 : 1;
    } else {
      const cmp = aParts[i].localeCompare(bParts[i], locale);
      if (cmp !== 0) return cmp;
    }
  }

  return aParts.length - bParts.length;
}
