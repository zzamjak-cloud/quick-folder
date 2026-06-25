import { useCallback, useEffect } from 'react';

export interface UseInlineFuzzyFilterConfig {
  enabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
}

/** 다른 편집 가능 요소인지 (퍼지 hidden input 제외) */
function isOtherEditableElement(active: Element | null, filterInput: HTMLInputElement | null): boolean {
  if (!active) return false;
  if (active === filterInput) return false;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return true;
  return active instanceof HTMLElement && active.isContentEditable;
}

function isPrintableKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.isComposing || e.keyCode === 229) return false;
  return e.key.length === 1;
}

/**
 * 인라인 퍼지 필터 포커스·첫 글자 입력.
 * 평소 hidden input에 포커스를 강제하지 않아 탐색기 단축키가 유지된다.
 * 검색어가 있으면 input 포커스(IME), 첫 글자는 IME 조합 여부를 짧게 대기 후 영문만 반영한다.
 */
export function useInlineFuzzyFilter({
  enabled,
  inputRef,
  searchQuery,
  setSearchQuery,
}: UseInlineFuzzyFilterConfig) {
  // 패널이 활성화되어 있으면 hidden input에 포커스를 유지한다.
  // 한글 IME는 조합 시작 시점에 포커스된 요소로 입력되므로, 미리 포커스해 두지 않으면
  // 빠르게 입력할 때 첫 음절(예: "버")의 자모가 분리되어 "ㅂㅓ"처럼 깨진다.
  // (탐색기 전역 단축키는 useKeyboardShortcuts가 data-fuzzy-filter-input을 화이트리스트
  //  처리하므로 포커스를 유지해도 정상 동작한다.)
  useEffect(() => {
    if (!enabled) return;
    const input = inputRef.current;
    if (!input) return;

    const grabFocus = () => {
      if (!enabled) return;
      if (document.activeElement === input) return;
      if (isOtherEditableElement(document.activeElement, input)) return;
      if (isFuzzyFilterBlocked()) return;
      input.focus({ preventScroll: true });
    };

    grabFocus();

    // 탐색기 컨테이너/빈 영역 클릭으로 포커스가 빠지면 다시 hidden input으로 되돌린다.
    const container = input.parentElement;
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as Node | null;
      if (target === document.body || (container && target === container)) {
        grabFocus();
      }
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [enabled, searchQuery, inputRef]);

  // 검색어 없을 때 첫 입력 → input 포커스 (한글은 compositionstart로 영문 삽입 취소)
  useEffect(() => {
    if (!enabled) return;

    const input = inputRef.current;
    if (!input) return;

    let pendingChar: string | null = null;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;

    const clearPending = () => {
      pendingChar = null;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
    };

    const onCompositionStart = () => clearPending();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (searchQuery.length > 0) return;
      if (isFuzzyFilterBlocked()) return;
      if (document.activeElement === input) return;
      if (isOtherEditableElement(document.activeElement, input)) return;

      if (e.key === 'Process' || e.keyCode === 229) {
        input.focus();
        return;
      }

      if (!isPrintableKey(e) || e.key === ' ') return;

      e.preventDefault();
      e.stopPropagation();
      input.focus();
      pendingChar = e.key;
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => {
        if (pendingChar) {
          setSearchQuery(pendingChar);
          pendingChar = null;
        }
        pendingTimer = null;
      }, 30);
    };

    input.addEventListener('compositionstart', onCompositionStart);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      input.removeEventListener('compositionstart', onCompositionStart);
      window.removeEventListener('keydown', handleKeyDown, true);
      clearPending();
    };
  }, [enabled, searchQuery, setSearchQuery, inputRef]);

  const focusFilterInput = useCallback(() => {
    if (!enabled) return;
    if (isOtherEditableElement(document.activeElement, inputRef.current)) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [enabled, inputRef]);

  return { focusFilterInput };
}

/** 모달·편집기가 열려 있으면 인라인 필터 입력 차단 */
export function isFuzzyFilterBlocked(): boolean {
  return !!(
    document.querySelector('[data-md-preview]') ||
    document.querySelector('[data-json-preview]') ||
    document.querySelector('[data-markdown-editor]') ||
    document.querySelector('[data-audio-preview]')
  );
}
