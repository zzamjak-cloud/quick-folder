import { useCallback, useRef } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { FileEntry, ThumbnailSize, ViewMode } from '../../../types';
import { convertFileSrc } from '@tauri-apps/api/core';
import { tauriCommands } from '../../../utils/tauriCommands';
import { RECENT_PATH, SYSTEM_ROOT_PATH } from '../constants';
import type { EntrySortBy, EntrySortDir } from '../entrySorting';
import { cancelAllQueued, queuedInvokeLow } from './invokeQueue';
import { thumbKey, getThumb, setThumb, FIXED_GRID_THUMB_SIZE } from './thumbnailCache';
import { isCloudPath } from '../../../utils/pathUtils';

// PSD/PSB와 동일 이름의 이미지 형제가 있으면 그 이미지를 PSD 썸네일 소스로 지정한다.
// 임베드 썸네일이 없는 PSD도 형제 이미지로 즉시 표시 → QuickLook/원본 파싱 회피.
function attachPsdThumbnailSiblings(list: FileEntry[]): FileEntry[] {
  const imageByStem = new Map<string, string>();
  for (const e of list) {
    if (e.is_dir) continue;
    const m = /^(.*)\.(jpe?g|png|gif|webp|bmp)$/i.exec(e.name);
    if (m) imageByStem.set(m[1].toLowerCase(), e.path);
  }
  if (imageByStem.size === 0) return list;

  let changed = false;
  const out = list.map(e => {
    if (e.is_dir) return e;
    const pm = /^(.*)\.(psd|psb)$/i.exec(e.name);
    if (!pm) return e;
    const sibling = imageByStem.get(pm[1].toLowerCase());
    if (!sibling) return e;
    changed = true;
    return { ...e, thumbnailPath: sibling };
  });
  return changed ? out : list;
}

interface UseDirectoryLoaderOptions {
  gridRef: RefObject<HTMLDivElement | null>;
  scrollPositionRef: MutableRefObject<Map<string, number>>;
  viewModeRef: MutableRefObject<ViewMode>;
  thumbnailSize: ThumbnailSize;
  sortBy: EntrySortBy;
  sortDir: EntrySortDir;
  recentRoots: string[];
  sortEntries: (list: FileEntry[], by: EntrySortBy, dir: EntrySortDir) => FileEntry[];
  setEntries: Dispatch<SetStateAction<FileEntry[]>>;
  setSelectedPaths: Dispatch<SetStateAction<string[]>>;
  setFocusedIndex: Dispatch<SetStateAction<number>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
}

export function useDirectoryLoader({
  gridRef,
  scrollPositionRef,
  viewModeRef,
  thumbnailSize,
  sortBy,
  sortDir,
  recentRoots,
  sortEntries,
  setEntries,
  setSelectedPaths,
  setFocusedIndex,
  setLoading,
  setError,
}: UseDirectoryLoaderOptions) {
  const currentPathRef = useRef<string | null>(null);
  const lastVisitedChildRef = useRef<string | null>(null);
  const loadRequestRef = useRef(0);
  const entriesCacheRef = useRef<Map<string, FileEntry[]>>(new Map());
  const prefetchInFlightRef = useRef<Set<string>>(new Set());
  const thumbnailSizeRef = useRef(thumbnailSize);
  thumbnailSizeRef.current = thumbnailSize;

  const cacheEntries = useCallback((path: string, list: FileEntry[]) => {
    const cache = entriesCacheRef.current;
    if (cache.has(path)) cache.delete(path);
    cache.set(path, list);
    if (cache.size > 50) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }, []);

  const prewarmThumbnails = useCallback((list: FileEntry[]) => {
    const size = thumbnailSizeRef.current;
    const run = () => {
      // 표시 크기 배치: 로컬 이미지/비디오 + PSD-형제(생성이 싸므로 표시 크기 그대로).
      const items: { path: string; fileType: 'image' | 'video' | 'psd' }[] = [];
      const targetKeys: string[] = [];
      // 고정 320 배치: PSD(형제 없음) + 클라우드 이미지(전체 다운로드+디코드 → 크기 무관).
      // 카드 renderSize와 키를 일치시켜 줌/크기변경 시 재생성·재다운로드를 없앤다.
      const fixedItems: { path: string; fileType: 'image' | 'video' | 'psd' }[] = [];
      const fixedKeys: string[] = [];
      let count = 0;
      // 앞쪽 항목을 한 배치로 워밍(Rust ensure_thumbnails_batch 상한 200과 동일).
      for (const entry of list) {
        if (count >= 200) break;
        if (entry.is_dir) continue;
        // 동일 이름 이미지 형제가 있는 PSD는 그 이미지를 표시 크기로 가볍게 워밍(키도 표시 크기)
        if (entry.thumbnailPath) {
          items.push({ path: entry.thumbnailPath, fileType: 'image' });
          targetKeys.push(thumbKey(entry.path, size, entry.modified));
          count++;
          continue;
        }
        const lower = entry.name.toLowerCase();
        if (lower.endsWith('.psd') || lower.endsWith('.psb')) {
          fixedItems.push({ path: entry.path, fileType: 'psd' });
          fixedKeys.push(thumbKey(entry.path, FIXED_GRID_THUMB_SIZE, entry.modified));
          count++;
          continue;
        }
        if (entry.file_type === 'image' && isCloudPath(entry.path)) {
          fixedItems.push({ path: entry.path, fileType: 'image' });
          fixedKeys.push(thumbKey(entry.path, FIXED_GRID_THUMB_SIZE, entry.modified));
          count++;
          continue;
        }
        if (entry.file_type === 'image' || entry.file_type === 'video') {
          items.push({ path: entry.path, fileType: entry.file_type });
          targetKeys.push(thumbKey(entry.path, size, entry.modified));
        } else continue;
        count++;
      }
      // 배치 결과(입력과 1:1 순서)를 메모리 캐시에 주입 → prewarm된 항목은 카드가 IPC 없이 즉시 표시
      const inject = (keys: string[]) => (results: { cachedPath?: string | null }[]) => {
        results.forEach((result, index) => {
          const key = keys[index];
          if (!key || !result || !result.cachedPath) return;
          if (getThumb(key) === undefined) setThumb(key, convertFileSrc(result.cachedPath));
        });
      };
      if (items.length > 0) {
        tauriCommands.ensureThumbnailsBatch(items, size).then(inject(targetKeys)).catch(() => {});
      }
      if (fixedItems.length > 0) {
        tauriCommands.ensureThumbnailsBatch(fixedItems, FIXED_GRID_THUMB_SIZE).then(inject(fixedKeys)).catch(() => {});
      }
    };
    const requestIdleCallback = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback;
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 300);
  }, []);

  const loadDirectory = useCallback(async (path: string) => {
    if (!path) return;
    if (gridRef.current && currentPathRef.current) {
      scrollPositionRef.current.set(`${viewModeRef.current}:${currentPathRef.current}`, gridRef.current.scrollTop);
    }
    currentPathRef.current = path;
    cancelAllQueued();
    setError(null);

    const isRecent = path === RECENT_PATH;
    const isSystemRoot = path === SYSTEM_ROOT_PATH;
    const cached = (isRecent || isSystemRoot) ? null : entriesCacheRef.current.get(path);
    if (cached) {
      setEntries(sortEntries(cached, sortBy, sortDir));
      setSelectedPaths([]);
      setFocusedIndex(-1);
    }

    setLoading(true);
    const requestId = ++loadRequestRef.current;
    let freshArrived = false;

    if (!cached && !isRecent && !isSystemRoot) {
      tauriCommands.readCachedListing(path)
        .then(diskCached => {
          if (requestId !== loadRequestRef.current || freshArrived) return;
          if (!diskCached || diskCached.length === 0) return;
          setEntries(sortEntries(attachPsdThumbnailSiblings(diskCached), sortBy, sortDir));
        })
        .catch(() => {});
    }

    try {
      const result = isRecent
        ? await tauriCommands.getRecentFiles(recentRoots, 7)
        : isSystemRoot
          ? await tauriCommands.listSystemRoots()
          : await tauriCommands.listDirectory(path);
      if (requestId !== loadRequestRef.current) return;
      freshArrived = true;
      const augmented = (isRecent || isSystemRoot) ? result : attachPsdThumbnailSiblings(result);
      if (!isRecent && !isSystemRoot) {
        cacheEntries(path, augmented);
        tauriCommands.writeCachedListing(path, result).catch(() => {});
      }
      const sortedResult = (isRecent || isSystemRoot) ? result : sortEntries(augmented, sortBy, sortDir);
      setEntries(sortedResult);
      if (!isRecent && !isSystemRoot) prewarmThumbnails(sortedResult);
      if (!cached) {
        setSelectedPaths([]);
        setFocusedIndex(-1);
      }
      if (lastVisitedChildRef.current) {
        const prevPath = lastVisitedChildRef.current;
        lastVisitedChildRef.current = null;
        const index = sortedResult.findIndex(entry => entry.path === prevPath);
        if (index >= 0) {
          setSelectedPaths([sortedResult[index].path]);
          setFocusedIndex(index);
        }
      }
      const savedScroll = scrollPositionRef.current.get(`${viewModeRef.current}:${path}`);
      if (savedScroll != null && gridRef.current) {
        requestAnimationFrame(() => {
          if (gridRef.current) gridRef.current.scrollTop = savedScroll;
        });
      }
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      setError(String(error));
      setEntries([]);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [
    cacheEntries,
    gridRef,
    prewarmThumbnails,
    recentRoots,
    scrollPositionRef,
    setEntries,
    setError,
    setFocusedIndex,
    setLoading,
    setSelectedPaths,
    sortBy,
    sortDir,
    sortEntries,
    viewModeRef,
  ]);

  const prefetchDirectory = useCallback((path: string) => {
    if (!path) return;
    if (entriesCacheRef.current.has(path)) return;
    if (prefetchInFlightRef.current.has(path)) return;
    prefetchInFlightRef.current.add(path);
    const run = () => {
      const { promise } = queuedInvokeLow<FileEntry[]>('list_directory', { path });
      promise
        .then(result => {
          cacheEntries(path, result);
          tauriCommands.writeCachedListing(path, result).catch(() => {});
        })
        .catch(() => {})
        .finally(() => { prefetchInFlightRef.current.delete(path); });
    };
    const requestIdleCallback = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback;
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1000 });
    else setTimeout(run, 200);
  }, [cacheEntries]);

  return {
    loadDirectory,
    prefetchDirectory,
    lastVisitedChildRef,
  };
}
