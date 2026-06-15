import React, { forwardRef, memo, useCallback, useEffect, useState } from 'react';
import { shouldForwardFuzzyFilterKeyToExplorer } from '../../utils/keyboardShortcuts';

interface InlineFuzzyFilterInputProps {
  value: string;
  enabled: boolean;
  isMac: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
}

/**
 * IME(한글 등) 입력용 hidden input.
 * 조합 중에도 검색 state를 갱신하되, input 값은 로컬 state로 유지해 IME 조합을 깨뜨리지 않는다.
 */
const InlineFuzzyFilterInput = memo(forwardRef<HTMLInputElement, InlineFuzzyFilterInputProps>(
  function InlineFuzzyFilterInput({ value, enabled, isMac, onChange, onClear }, ref) {
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

      if (shouldForwardFuzzyFilterKeyToExplorer({
        key: e.key,
        query: innerValue,
        isMac,
        isComposing: e.nativeEvent.isComposing,
        keyCode: e.nativeEvent.keyCode,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
      })) {
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
    }, [innerValue, isMac, onClear]);

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
