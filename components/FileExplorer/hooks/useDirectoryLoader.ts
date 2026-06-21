import { useCallback, useRef } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { FileEntry, ThumbnailSize, ViewMode } from '../../../types';
import { tauriCommands } from '../../../utils/tauriCommands';
import { RECENT_PATH, SYSTEM_ROOT_PATH } from '../constants';
import type { EntrySortBy, EntrySortDir } from '../entrySorting';
import { cancelAllQueued, queuedInvokeLow } from './invokeQueue';

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
      let count = 0;
      for (const entry of list) {
        if (count >= 120) break;
        if (entry.is_dir) continue;
        const lower = entry.name.toLowerCase();
        if (lower.endsWith('.psd') || lower.endsWith('.psb')) continue;
        let command = '';
        if (entry.file_type === 'image') command = 'get_file_thumbnail_path';
        else if (entry.file_type === 'video') command = 'get_video_thumbnail_path';
        else continue;
        count++;
        queuedInvokeLow(command, { path: entry.path, size }).promise.catch(() => {});
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
          setEntries(sortEntries(diskCached, sortBy, sortDir));
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
      if (!isRecent && !isSystemRoot) {
        cacheEntries(path, result);
        tauriCommands.writeCachedListing(path, result).catch(() => {});
      }
      const sortedResult = (isRecent || isSystemRoot) ? result : sortEntries(result, sortBy, sortDir);
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
