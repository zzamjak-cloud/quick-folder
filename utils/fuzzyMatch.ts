/** 퍼지 매칭 결과 (fzf 스타일 서브시퀀스 매칭) */
export interface FuzzyMatchResult {
  /** 높을수록 더 좋은 매칭 */
  score: number;
  /** 원본 텍스트에서 매칭된 문자 인덱스 */
  indices: number[];
}

const WORD_BOUNDARY_RE = /[\s._\-/\\()[\]{}]/;

/**
 * fzf 스타일 퍼지 매칭 — 패턴 문자가 텍스트에 순서대로 존재하면 매칭.
 * 연속 매칭·단어 경계·짧은 이름에 가산점, 넓게 퍼진 매칭에는 감점.
 */
export function fuzzyMatch(pattern: string, text: string): FuzzyMatchResult | null {
  if (!pattern) return { score: 0, indices: [] };

  const p = pattern.toLowerCase();
  const t = text.toLowerCase();
  const n = p.length;
  const m = t.length;

  let pIdx = 0;
  const indices: number[] = [];
  let score = 0;
  let prevMatchIdx = -2;
  let consecutive = 0;

  for (let i = 0; i < m && pIdx < n; i++) {
    if (t[i] !== p[pIdx]) continue;

    indices.push(i);

    if (prevMatchIdx === i - 1) {
      consecutive++;
      score += 12 + consecutive * 2;
    } else {
      consecutive = 0;
      score += 6;
      // 첫 글자·구분자 뒤 매칭 보너스
      if (i === 0 || WORD_BOUNDARY_RE.test(text[i - 1] ?? '')) score += 10;
      // CamelCase 경계
      if (i > 0 && /[a-z]/.test(text[i - 1]) && /[A-Z]/.test(text[i])) score += 6;
    }

    prevMatchIdx = i;
    pIdx++;
  }

  if (pIdx < n) return null;

  // 매칭이 넓게 퍼질수록 감점
  if (indices.length > 1) {
    score -= indices[indices.length - 1] - indices[0];
  }

  // 짧은 이름 우선
  score -= m * 0.05;

  // 앞쪽 매칭 우선
  if (indices.length > 0) score -= indices[0] * 0.1;

  return { score, indices };
}

/** 여러 항목에 퍼지 필터 적용 후 점수 내림차순 정렬 */
export function fuzzyFilterByName<T extends { name: string }>(
  items: T[],
  pattern: string,
): Array<T & { fuzzyIndices: number[]; fuzzyScore: number }> {
  const q = pattern.trim();
  if (!q) {
    return items.map(item => ({ ...item, fuzzyIndices: [], fuzzyScore: 0 }));
  }

  const matched: Array<T & { fuzzyIndices: number[]; fuzzyScore: number }> = [];
  for (const item of items) {
    const result = fuzzyMatch(q, item.name);
    if (result) {
      matched.push({ ...item, fuzzyIndices: result.indices, fuzzyScore: result.score });
    }
  }

  matched.sort((a, b) => b.fuzzyScore - a.fuzzyScore);
  return matched;
}
