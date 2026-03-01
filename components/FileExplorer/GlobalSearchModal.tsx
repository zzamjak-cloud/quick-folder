import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry } from '../../types';
import { ThemeVars } from './types';
import { Search, Folder, FileText, Loader2 } from 'lucide-react';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
  onSelect: (entry: FileEntry) => void;
  themeVars: ThemeVars | null;
}

export default function GlobalSearchModal({ isOpen, onClose, currentPath, onSelect, themeVars }: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const requestIdRef = useRef(0);

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setLoading(false);
      setSelectedIndex(0);
      requestIdRef.current++;
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // 디바운스 검색
  const performSearch = useCallback((searchQuery: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!searchQuery.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const reqId = ++requestIdRef.current;
      try {
        const res = await invoke<FileEntry[]>('search_files', {
          root: currentPath,
          query: searchQuery.trim(),
          maxResults: 200,
        });
        // stale 응답 무시
        if (reqId !== requestIdRef.current) return;
        setResults(res);
        setSelectedIndex(0);
      } catch {
        if (reqId !== requestIdRef.current) return;
        setResults([]);
      } finally {
        if (reqId === requestIdRef.current) setLoading(false);
      }
    }, 300);
  }, [currentPath]);

  // query 변경 시 검색
  useEffect(() => {
    performSearch(query);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, performSearch]);

  // 상대 경로 계산
  const getRelativePath = (fullPath: string) => {
    if (fullPath.startsWith(currentPath)) {
      const rel = fullPath.slice(currentPath.length);
      return rel.startsWith('/') || rel.startsWith('\\') ? rel.slice(1) : rel;
    }
    return fullPath;
  };

  const handleSelect = (entry: FileEntry) => {
    onSelect(entry);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
      return;
    }
  };

  // 선택된 항목 자동 스크롤
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-search-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  const bgColor = themeVars?.surface ?? '#1e293b';
  const borderColor = themeVars?.border ?? '#334155';
  const textColor = themeVars?.text ?? '#f8fafc';
  const mutedColor = themeVars?.muted ?? '#94a3b8';
  const accentColor = themeVars?.accent ?? '#3b82f6';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-[600px] rounded-lg shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}`, maxHeight: '60vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 검색 입력 */}
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${borderColor}` }}>
          <Search size={16} style={{ color: mutedColor, flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="파일 이름으로 검색..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: textColor }}
          />
          {loading && <Loader2 size={16} className="animate-spin" style={{ color: mutedColor, flexShrink: 0 }} />}
        </div>

        {/* 결과 리스트 */}
        <div ref={listRef} className="overflow-y-auto flex-1" style={{ maxHeight: 'calc(60vh - 48px)' }}>
          {!query.trim() ? (
            <div className="py-8 text-center text-xs" style={{ color: mutedColor }}>
              검색어를 입력하세요
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="py-8 text-center text-xs" style={{ color: mutedColor }}>
              일치하는 파일이 없습니다
            </div>
          ) : (
            results.map((entry, i) => {
              const relPath = getRelativePath(entry.path);
              const dirPart = relPath.includes('/') || relPath.includes('\\')
                ? relPath.replace(/[/\\][^/\\]*$/, '')
                : '';
              const isSelected = i === selectedIndex;

              return (
                <div
                  key={entry.path}
                  data-search-index={i}
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer"
                  style={{
                    backgroundColor: isSelected ? (accentColor + '22') : 'transparent',
                    borderLeft: isSelected ? `2px solid ${accentColor}` : '2px solid transparent',
                  }}
                  onClick={() => handleSelect(entry)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  {entry.is_dir
                    ? <Folder size={14} style={{ color: '#fbbf24', flexShrink: 0 }} />
                    : <FileText size={14} style={{ color: mutedColor, flexShrink: 0 }} />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate" style={{ color: textColor }}>{entry.name}</div>
                    {dirPart && (
                      <div className="text-[10px] truncate" style={{ color: mutedColor }}>{dirPart}</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 하단 힌트 */}
        <div
          className="px-3 py-1.5 text-[10px] flex items-center gap-3"
          style={{ borderTop: `1px solid ${borderColor}`, color: mutedColor }}
        >
          <span>↑↓ 탐색</span>
          <span>Enter 선택</span>
          <span>Escape 닫기</span>
        </div>
      </div>
    </div>
  );
}
