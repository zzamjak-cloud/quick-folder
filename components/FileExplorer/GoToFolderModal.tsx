import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry } from '../../types';
import { ThemeVars } from './types';
import { Folder } from 'lucide-react';

interface GoToFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  themeVars: ThemeVars | null;
}

export default function GoToFolderModal({ isOpen, onClose, onNavigate, themeVars }: GoToFolderModalProps) {
  const [inputPath, setInputPath] = useState('');
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<FileEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  // 제안 선택에 의한 입력 변경인지 추적 (재조회 방지)
  const skipFetchRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const requestIdRef = useRef(0);

  // 모달 열릴 때 자동 포커스 + 상태 초기화
  useEffect(() => {
    if (isOpen) {
      setInputPath('');
      setError('');
      setSuggestions([]);
      setSelectedIdx(-1);
      requestIdRef.current++;
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // 입력 경로에서 부모 디렉토리와 접두사 추출
  const parsePath = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return { parentDir: '', prefix: '' };

    const lastSep = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
    if (lastSep < 0) return { parentDir: '', prefix: trimmed };

    return {
      parentDir: trimmed.substring(0, lastSep + 1),
      prefix: trimmed.substring(lastSep + 1).toLowerCase(),
    };
  }, []);

  // 하위 폴더 조회 (디바운스)
  const fetchSuggestions = useCallback((rawPath: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = rawPath.trim();
    if (!trimmed) {
      setSuggestions([]);
      setSelectedIdx(-1);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const reqId = ++requestIdRef.current;
      try {
        // 1단계: 입력 경로 자체가 디렉토리이면 하위 폴더 직접 표시
        //        (슬래시 없이 /Users/woody/Downloads 입력해도 하위 표시)
        let dirs: FileEntry[] = [];
        let directHit = false;

        try {
          const entries = await invoke<FileEntry[]>('list_directory', { path: trimmed });
          if (reqId !== requestIdRef.current) return;
          dirs = entries.filter(e => e.is_dir).sort((a, b) => a.name.localeCompare(b.name));
          directHit = true;
        } catch {
          // list_directory 실패 = 디렉토리가 아님 → 2단계로
        }

        // 2단계: 부모 디렉토리에서 prefix 필터링
        if (!directHit) {
          const { parentDir, prefix } = parsePath(trimmed);
          if (!parentDir) { setSuggestions([]); setSelectedIdx(-1); return; }

          const entries = await invoke<FileEntry[]>('list_directory', { path: parentDir });
          if (reqId !== requestIdRef.current) return;
          dirs = entries
            .filter(e => e.is_dir && (!prefix || e.name.toLowerCase().startsWith(prefix)))
            .sort((a, b) => a.name.localeCompare(b.name));
        }

        setSuggestions(dirs);
        setSelectedIdx(-1);
      } catch {
        if (reqId !== requestIdRef.current) return;
        setSuggestions([]);
        setSelectedIdx(-1);
      }
    }, 150);
  }, [parsePath]);

  // 입력 변경 시 자동완성 조회
  useEffect(() => {
    if (!isOpen) return;
    // 제안 선택에 의한 변경이면 재조회 건너뜀
    if (skipFetchRef.current) {
      skipFetchRef.current = false;
      return;
    }
    fetchSuggestions(inputPath);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [inputPath, fetchSuggestions, isOpen]);

  // 선택된 항목 자동 스크롤
  useEffect(() => {
    if (!isOpen || !listRef.current || selectedIdx < 0) return;
    const el = listRef.current.querySelector(`[data-suggest-index="${selectedIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const trimmed = inputPath.trim();
    if (!trimmed) return;

    try {
      const isDir = await invoke<boolean>('is_directory', { path: trimmed });
      if (isDir) {
        onNavigate(trimmed);
        onClose();
      } else {
        setError('유효한 폴더 경로가 아닙니다');
      }
    } catch {
      setError('경로를 확인할 수 없습니다');
    }
  };

  // 제안 선택: 입력 필드를 해당 경로로 동기화 + 하위 폴더 조회
  const handleSelectSuggestion = (entry: FileEntry) => {
    const sep = entry.path.includes('/') ? '/' : '\\';
    const newPath = entry.path + sep;
    skipFetchRef.current = false; // 이 경우는 하위 조회를 해야 함
    setInputPath(newPath);
    setError('');
    setSelectedIdx(-1);
    inputRef.current?.focus();
  };

  // Enter 또는 더블 클릭: 해당 폴더로 이동
  const handleConfirmSuggestion = (entry: FileEntry) => {
    onNavigate(entry.path);
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
      if (suggestions.length > 0) {
        setSelectedIdx(prev => {
          const next = Math.min(prev + 1, suggestions.length - 1);
          // 화살표 선택 시 입력 필드 동기화
          syncInputFromSelection(next);
          return next;
        });
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => {
        const next = Math.max(prev - 1, -1);
        if (next >= 0) syncInputFromSelection(next);
        return next;
      });
      return;
    }

    if (e.key === 'Tab' && suggestions.length > 0 && selectedIdx >= 0) {
      // Tab: 선택된 폴더로 자동완성 + 하위 탐색
      e.preventDefault();
      handleSelectSuggestion(suggestions[selectedIdx]);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdx >= 0 && suggestions.length > 0) {
        handleConfirmSuggestion(suggestions[selectedIdx]);
      } else {
        handleSubmit();
      }
      return;
    }
  };

  // 화살표 키 탐색 시 입력 필드를 선택된 항목 경로로 동기화 (재조회 방지)
  const syncInputFromSelection = (idx: number) => {
    if (idx < 0 || idx >= suggestions.length) return;
    skipFetchRef.current = true;
    setInputPath(suggestions[idx].path);
    setError('');
  };

  const bgColor = themeVars?.surface ?? '#1e293b';
  const borderColor = themeVars?.border ?? '#334155';
  const textColor = themeVars?.text ?? '#f8fafc';
  const mutedColor = themeVars?.muted ?? '#94a3b8';
  const accentColor = themeVars?.accent ?? '#3b82f6';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[20vh]"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-[500px] rounded-lg shadow-2xl overflow-hidden"
        style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}`, maxHeight: '50vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-3 pb-2">
          <input
            ref={inputRef}
            type="text"
            value={inputPath}
            onChange={e => { setInputPath(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="경로를 입력하세요... (예: /Users/name/Documents)"
            className="w-full px-3 py-2 rounded text-sm outline-none"
            style={{
              backgroundColor: themeVars?.bg ?? '#0f172a',
              color: textColor,
              border: `1px solid ${error ? '#ef4444' : borderColor}`,
            }}
          />
          {error && (
            <p className="mt-1 text-xs" style={{ color: '#ef4444' }}>{error}</p>
          )}
        </div>

        {/* 하위 폴더 제안 리스트 */}
        {suggestions.length > 0 && (
          <div
            ref={listRef}
            className="overflow-y-auto"
            style={{ borderTop: `1px solid ${borderColor}`, maxHeight: 'calc(50vh - 80px)' }}
          >
            {suggestions.map((entry, i) => {
              const isSelected = i === selectedIdx;
              return (
                <div
                  key={entry.path}
                  data-suggest-index={i}
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer"
                  style={{
                    backgroundColor: isSelected ? (accentColor + '22') : 'transparent',
                    borderLeft: isSelected ? `2px solid ${accentColor}` : '2px solid transparent',
                  }}
                  onClick={() => handleSelectSuggestion(entry)}
                  onDoubleClick={() => handleConfirmSuggestion(entry)}
                  onMouseEnter={() => setSelectedIdx(i)}
                >
                  <Folder size={14} style={{ color: '#fbbf24', flexShrink: 0 }} />
                  <span className="text-xs truncate" style={{ color: textColor }}>{entry.name}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* 하단 힌트 */}
        <div
          className="px-3 py-1.5 text-[10px] flex items-center gap-3"
          style={{ borderTop: `1px solid ${borderColor}`, color: mutedColor }}
        >
          <span>↑↓ 탐색</span>
          <span>Tab 하위 탐색</span>
          <span>Enter 이동</span>
          <span>클릭 선택 · 더블클릭 이동</span>
        </div>
      </div>
    </div>
  );
}
