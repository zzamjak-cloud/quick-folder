// 패널 간 파일 변경 알림 이벤트.
// sourceId(패널 인스턴스 ID)를 실어, 자기 자신이 쏜 이벤트로 자기 패널을 다시 로드하는 것을 막는다.
// (자기 재로딩은 이미 각 작업 흐름이 직접 수행하며, 중복 재로딩은 대기 중 썸네일 요청까지
// 몰살시켜 여러 카드가 일제히 스피너로 복귀하는 원인이었다)

export const FILES_CHANGED_EVENT = 'qf-files-changed';

export function dispatchFilesChanged(sourceId?: string): void {
  window.dispatchEvent(new CustomEvent(FILES_CHANGED_EVENT, { detail: { sourceId } }));
}

/** 이벤트에서 발신 패널 ID 추출 (구형 Event 디스패치는 null) */
export function filesChangedSourceId(event: Event): string | null {
  const detail = (event as CustomEvent<{ sourceId?: string }>).detail;
  return detail?.sourceId ?? null;
}
