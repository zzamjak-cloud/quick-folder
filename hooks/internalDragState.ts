// 내부 드래그 상태 (tauri-plugin-drag → 같은 창 드롭 감지용)
// OS 드래그는 같은 창에 drop 이벤트를 발생시키지 않으므로,
// over 이벤트 위치 + start_drag 완료 시점을 조합하여 처리

let dragPaths: string[] | null = null;

export function setInternalDragPaths(paths: string[]) {
  dragPaths = paths;
}

export function getInternalDragPaths(): string[] | null {
  return dragPaths;
}

export function clearInternalDragPaths() {
  dragPaths = null;
}
