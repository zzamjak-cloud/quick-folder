import { useEffect } from 'react';

interface UseEscapeKeyOptions {
  enabled?: boolean;
  capture?: boolean;
  stopPropagation?: boolean;
}

export function useEscapeKey(
  onEscape: () => void,
  { enabled = true, capture = false, stopPropagation = false }: UseEscapeKeyOptions = {},
) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (stopPropagation) event.stopPropagation();
      onEscape();
    };

    window.addEventListener('keydown', handleKeyDown, capture);
    return () => window.removeEventListener('keydown', handleKeyDown, capture);
  }, [capture, enabled, onEscape, stopPropagation]);
}
