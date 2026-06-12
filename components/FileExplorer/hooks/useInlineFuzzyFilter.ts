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
  // 검색 중에만 hidden input 포커스 (IME 편집)
  useEffect(() => {
    if (!enabled || !searchQuery) return;
    if (isOtherEditableElement(document.activeElement, inputRef.current)) return;
    inputRef.current?.focus({ preventScroll: true });
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
