/**
 * Tauri WebView에서 IPC(`__TAURI_INTERNALS__`)가 주입된 경우에만 true.
 * `vite`만 실행한 일반 브라우저에서는 false — 이 경우 Tauri API 호출을 건너뛰어야 한다.
 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__;
  return typeof internals?.invoke === 'function';
}
