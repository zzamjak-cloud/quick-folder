/**
 * 전역 썸네일 캐시 (모듈 레벨, 모든 FileCard 인스턴스 공유)
 *
 * 목적: 폴더 재방문/뒤로가기 시 IPC 호출 없이 즉시 썸네일 표시.
 * 값은 asset 프로토콜 URL(convertFileSrc 결과) 또는 빈 문자열('' = 썸네일 없음).
 * 키는 경로+크기+수정시각 → 파일이 바뀌면 자동으로 캐시 미스가 되어 재생성.
 *
 * 단순 LRU: Map의 삽입 순서를 이용해 접근 시 재삽입, 상한 초과 시 가장 오래된 항목 제거.
 */

const MAX_ENTRIES = 4000;
const cache = new Map<string, string>();

export function thumbKey(path: string, size: number, modified: number): string {
  return `${path}|${size}|${modified}`;
}

/** 캐시 조회. undefined=미조회(요청 필요), ''=썸네일 없음 확정, 그 외=asset URL */
export function getThumb(key: string): string | undefined {
  const v = cache.get(key);
  if (v !== undefined) {
    // LRU: 최근 사용으로 갱신
    cache.delete(key);
    cache.set(key, v);
  }
  return v;
}

export function setThumb(key: string, url: string): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, url);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}
