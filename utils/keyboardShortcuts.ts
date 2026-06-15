const FUZZY_FILTER_FORWARD_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
  'Enter',
  'F2',
]);

export interface FuzzyFilterForwardOptions {
  key: string;
  query: string;
  isMac: boolean;
  isComposing?: boolean;
  keyCode?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/** hidden input 포커스 중 탐색기 전역 단축키로 다시 전달할 키인지 판단한다. */
export function shouldForwardFuzzyFilterKeyToExplorer({
  key,
  query,
  isMac,
  isComposing = false,
  keyCode,
  ctrlKey = false,
  metaKey = false,
  altKey = false,
}: FuzzyFilterForwardOptions): boolean {
  if (isComposing || keyCode === 229) return false;
  if (ctrlKey || metaKey || altKey) return true;
  if (FUZZY_FILTER_FORWARD_KEYS.has(key)) return true;
  if (key === 'Delete') return true;
  if (key === 'Backspace') return isMac && query.length === 0;
  if (key === ' ') return true;
  return false;
}

export interface DeleteLikeShortcutSuppressOptions {
  key: string;
  isFuzzyFilterInput: boolean;
  isFiltering: boolean;
  isSearchActive: boolean;
}

/** 검색 입력 보호 때문에 탐색기 Backspace/Delete 처리를 막아야 하는지 판단한다. */
export function shouldSuppressDeleteLikeExplorerShortcut({
  key,
  isFuzzyFilterInput,
  isFiltering,
  isSearchActive,
}: DeleteLikeShortcutSuppressOptions): boolean {
  if (key !== 'Backspace' && key !== 'Delete') return false;
  if (isSearchActive) return true;
  if (key === 'Backspace') return isFuzzyFilterInput || isFiltering;
  return false;
}
