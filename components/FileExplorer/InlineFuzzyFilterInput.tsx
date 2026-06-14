import React, { forwardRef, memo, useCallback, useEffect, useState } from 'react';

interface InlineFuzzyFilterInputProps {
  value: string;
  enabled: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
}

/** hidden input 포커스 중 탐색기로 넘길 키 (방향키·단축키 등) */
function shouldForwardToExplorer(key: string, query: string, e: React.KeyboardEvent): boolean {
  if (e.nativeEvent.isComposing) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'F2'].includes(key)) {
    return true;
  }
  // Space는 미리보기 전역 단축키라 검색어가 있어도 탐색기로 넘긴다.
  if (key === ' ') return true;
  // Backspace/Delete는 탐색기로 넘기지 않음 (연타 시 파일 삭제·뒤로가기 사고 방지)
  return false;
}

/**
 * IME(한글 등) 입력용 hidden input.
 * 조합 중에도 검색 state를 갱신하되, input 값은 로컬 state로 유지해 IME 조합을 깨뜨리지 않는다.
 */
const InlineFuzzyFilterInput = memo(forwardRef<HTMLInputElement, InlineFuzzyFilterInputProps>(
  function InlineFuzzyFilterInput({ value, enabled, onChange, onClear }, ref) {
    const [isComposing, setIsComposing] = useState(false);
    const [innerValue, setInnerValue] = useState(value);

    useEffect(() => {
      if (!isComposing) setInnerValue(value);
    }, [value, isComposing]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        onClear();
        return;
      }

      if (shouldForwardToExplorer(e.key, innerValue, e)) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.blur();
        const { key, code, ctrlKey, metaKey, shiftKey, altKey } = e.nativeEvent;
        queueMicrotask(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', {
            key,
            code,
            ctrlKey,
            metaKey,
            shiftKey,
            altKey,
            bubbles: true,
            cancelable: true,
          }));
        });
        return;
      }

      if (!e.nativeEvent.isComposing) {
        e.stopPropagation();
      }
    }, [innerValue, onClear]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setInnerValue(next);
      onChange(next);
    }, [onChange]);

    const handleCompositionUpdate = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
      const next = e.currentTarget.value;
      setInnerValue(next);
      onChange(next);
    }, [onChange]);

    const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
      setIsComposing(false);
      const next = e.currentTarget.value;
      setInnerValue(next);
      onChange(next);
    }, [onChange]);

    if (!enabled) return null;

    return (
      <input
        ref={ref}
        type="text"
        value={innerValue}
        onChange={handleChange}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionUpdate={handleCompositionUpdate}
        onCompositionEnd={handleCompositionEnd}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="파일 퍼지 검색"
        data-fuzzy-filter-input=""
        tabIndex={-1}
        style={{
          position: 'fixed',
          left: -10000,
          top: 0,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
    );
  },
));

export default InlineFuzzyFilterInput;
