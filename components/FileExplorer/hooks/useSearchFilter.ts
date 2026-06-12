import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { FileEntry } from '../../../types';
import { fuzzyMatch } from '../../../utils/fuzzyMatch';

export interface UseSearchFilterConfig {
  entries: FileEntry[];
  currentPath: string | null;
}

/**
 * 검색어·확장자 필터·텍스트 숨김 상태를 관리한다.
 * 퍼지 검색 시 목록에서 항목을 제거하지 않고, 매칭 글자만 강조·비매칭은 흐리게 표시한다.
 */
export function useSearchFilter({ entries, currentPath }: UseSearchFilterConfig) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeExtFilters, setActiveExtFilters] = useState<Set<string>>(new Set());
  const [hideText, setHideText] = useState(false);

  // 파일 확장자 추출 유틸
  const getExt = useCallback((entry: FileEntry): string => {
    if (entry.is_dir) return 'folder';
    const dot = entry.name.lastIndexOf('.');
    return dot > 0 ? entry.name.slice(dot + 1).toLowerCase() : 'other';
  }, []);

  // 현재 디렉토리에 존재하는 확장자 목록 (폴더 포함)
  const availableExtensions = useMemo(() => {
    const exts = new Set<string>();
    entries.forEach(e => exts.add(getExt(e)));
    return exts;
  }, [entries, getExt]);

  const isFiltering = searchQuery.trim().length > 0;

  // 확장자 필터만 displayEntries에 반영 (퍼지 검색은 항목 숨기지 않음)
  const displayEntries = useMemo(() => {
    if (activeExtFilters.size === 0) return entries;
    return entries.filter(e => activeExtFilters.has(getExt(e)));
  }, [entries, activeExtFilters, getExt]);

  // 퍼지 매칭 메타데이터 (하이라이트·자동 스크롤·흐림 처리용)
  const { fuzzyMatchIndices, fuzzyBestPath, fuzzyMatchCount } = useMemo(() => {
    const indicesMap = new Map<string, number[]>();
    if (!isFiltering) {
      return { fuzzyMatchIndices: indicesMap, fuzzyBestPath: null as string | null, fuzzyMatchCount: 0 };
    }

    const q = searchQuery.trim();
    let bestPath: string | null = null;
    let bestScore = -Infinity;

    for (const entry of displayEntries) {
      const result = fuzzyMatch(q, entry.name);
      if (!result) continue;
      indicesMap.set(entry.path, result.indices);
      if (result.score > bestScore) {
        bestScore = result.score;
        bestPath = entry.path;
      }
    }

    return {
      fuzzyMatchIndices: indicesMap,
      fuzzyBestPath: bestPath,
      fuzzyMatchCount: indicesMap.size,
    };
  }, [displayEntries, searchQuery, isFiltering]);

  // 폴더/탭 전환 시 확장자 필터 초기화
  useEffect(() => {
    setActiveExtFilters(new Set());
  }, [currentPath]);

  return {
    searchQuery, setSearchQuery,
    isSearchActive, setIsSearchActive,
    activeExtFilters, setActiveExtFilters,
    hideText, setHideText,
    searchInputRef,
    getExt,
    availableExtensions,
    displayEntries,
    fuzzyMatchIndices,
    fuzzyBestPath,
    fuzzyMatchCount,
    isFiltering,
  };
}
