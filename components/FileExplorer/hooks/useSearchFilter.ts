import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { FileEntry } from '../../../types';

export interface UseSearchFilterConfig {
  entries: FileEntry[];
  currentPath: string | null;
}

/**
 * 검색어·확장자 필터·텍스트 숨김 상태를 관리하고,
 * 필터링된 displayEntries를 파생하는 훅.
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

  // 검색 + 확장자 필터로 표시할 항목 파생
  const displayEntries = useMemo(() => {
    let result = entries;
    if (activeExtFilters.size > 0) {
      result = result.filter(e => activeExtFilters.has(getExt(e)));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e => e.name.toLowerCase().includes(q));
    }
    return result;
  }, [entries, activeExtFilters, searchQuery, getExt]);

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
  };
}
