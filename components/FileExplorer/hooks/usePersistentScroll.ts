import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { DependencyList, RefObject } from 'react';

interface ScrollPosition {
  top: number;
  left: number;
}

export function createScrollStorageKey(scope: string, instanceId: string, mode: string, path: string) {
  return `qf_scroll:${scope}:${instanceId}:${mode}:${path}`;
}

function readScrollPosition(storageKey: string | null): ScrollPosition | null {
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ScrollPosition>;
    return {
      top: Number.isFinite(parsed.top) ? Number(parsed.top) : 0,
      left: Number.isFinite(parsed.left) ? Number(parsed.left) : 0,
    };
  } catch {
    return null;
  }
}

function writeScrollPosition(storageKey: string | null, position: ScrollPosition) {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(position));
  } catch {
    // localStorage가 가득 찼거나 비활성화된 환경에서는 스크롤 저장만 포기한다.
  }
}

export function usePersistentScroll<T extends HTMLElement>(
  ref: RefObject<T | null>,
  storageKey: string | null,
  restoreDeps: DependencyList = [],
) {
  const activeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestKeyRef = useRef<string | null>(storageKey);
  const latestPositionRef = useRef<ScrollPosition>({ top: 0, left: 0 });

  const saveScroll = useCallback((key = latestKeyRef.current) => {
    const el = ref.current;
    const position = el
      ? { top: el.scrollTop, left: el.scrollLeft }
      : latestPositionRef.current;
    latestPositionRef.current = position;
    writeScrollPosition(key, position);
  }, [ref]);

  useLayoutEffect(() => {
    const previousKey = latestKeyRef.current;
    const keyChanged = previousKey !== storageKey;
    if (previousKey && previousKey !== storageKey) {
      saveScroll(previousKey);
    }

    latestKeyRef.current = storageKey;
    const el = ref.current;
    if (!el || !storageKey) return;

    const frame = requestAnimationFrame(() => {
      const position = readScrollPosition(storageKey);
      if (!ref.current) return;
      if (position) {
        ref.current.scrollTop = position.top;
        ref.current.scrollLeft = position.left;
        latestPositionRef.current = position;
      } else if (keyChanged) {
        ref.current.scrollTop = 0;
        ref.current.scrollLeft = 0;
        latestPositionRef.current = { top: 0, left: 0 };
      }
    });

    return () => cancelAnimationFrame(frame);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, saveScroll, ref, ...restoreDeps]);

  useEffect(() => {
    return () => {
      saveScroll();
      if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
    };
  }, [saveScroll]);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const position = { top: el.scrollTop, left: el.scrollLeft };
    latestPositionRef.current = position;
    writeScrollPosition(latestKeyRef.current, position);

    el.classList.add('qf-scroll-active');
    if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
    activeTimerRef.current = setTimeout(() => {
      el.classList.remove('qf-scroll-active');
    }, 900);
  }, [ref]);

  return { handleScroll, saveScroll };
}
