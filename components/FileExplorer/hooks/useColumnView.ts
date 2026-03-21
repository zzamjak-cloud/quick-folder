import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry } from '../../../types';
import { queuedInvoke } from './invokeQueue';

// 컬럼 데이터 구조
export interface ColumnData {
  path: string;                 // 디렉토리 경로
  entries: FileEntry[];         // 파일 목록
  loading: boolean;
  selectedPath: string | null;  // 이 컬럼에서 선택된 항목 경로
}

// 파일 미리보기 데이터
export interface ColumnPreviewData {
  entry: FileEntry;
  thumbnail: string | null;     // base64 데이터 URL
  textContent: string | null;   // 텍스트/마크다운/코드 파일 내용
  videoPath: string | null;     // 동영상 경로 (convertFileSrc용)
  loading: boolean;
}

/**
 * macOS Finder 스타일 컬럼 뷰 상태 관리 훅
 * - columns: 현재 열려있는 컬럼 스택
 * - preview: 파일 선택 시 미리보기 데이터
 * - focusedCol/focusedRow: 키보드 포커스 위치
 */
export function useColumnView() {
  const [columns, setColumns] = useState<ColumnData[]>([]);
  const [preview, setPreview] = useState<ColumnPreviewData | null>(null);
  const [focusedCol, setFocusedCol] = useState(0);
  const [focusedRow, setFocusedRow] = useState(0);

  // 경쟁 조건 방지: 각 컬럼 로딩 요청의 path 추적
  const loadRequestRef = useRef<Map<number, string>>(new Map());
  // 디렉토리 캐시 — 동일 경로 재방문 시 IPC 호출 없이 즉시 표시
  const dirCacheRef = useRef<Map<string, FileEntry[]>>(new Map());
  // 썸네일 로딩 취소용
  const thumbnailCancelRef = useRef<(() => void) | null>(null);

  // 뷰 모드 전환 시 첫 컬럼 초기화 (첫 번째 항목 자동 선택)
  const initColumns = useCallback((rootPath: string, entries: FileEntry[]) => {
    const firstEntry = entries.length > 0 ? entries[0] : null;
    setColumns([{
      path: rootPath,
      entries,
      loading: false,
      selectedPath: firstEntry?.path ?? null,
    }]);
    setPreview(null);
    setFocusedCol(0);
    setFocusedRow(0);
    loadRequestRef.current.clear();
  }, []);

  // 컬럼 정리 (다른 뷰로 전환 시)
  const clearColumns = useCallback(() => {
    setColumns([]);
    setPreview(null);
    setFocusedCol(0);
    setFocusedRow(0);
    loadRequestRef.current.clear();
    if (thumbnailCancelRef.current) {
      thumbnailCancelRef.current();
      thumbnailCancelRef.current = null;
    }
  }, []);

  // 썸네일 로딩 헬퍼 (이미지, PSD, 동영상, 텍스트/코드/문서 지원)
  const loadThumbnail = useCallback((entry: FileEntry) => {
    // 이전 썸네일 로딩 취소
    if (thumbnailCancelRef.current) {
      thumbnailCancelRef.current();
      thumbnailCancelRef.current = null;
    }

    const isPsd = /\.(psd|psb)$/i.test(entry.name);
    const isVideo = entry.file_type === 'video';
    const isText = entry.file_type === 'code' || entry.file_type === 'document' ||
      /\.(txt|md|json|xml|yaml|yml|toml|ini|cfg|log|csv|tsx?|jsx?|py|rs|go|java|c|cpp|h|hpp|css|scss|less|html?|sh|bash|zsh|bat|ps1|sql|rb|php|swift|kt|dart|lua|r|m|mm)$/i.test(entry.name);

    // 동영상: 썸네일 + videoPath 설정
    if (isVideo) {
      setPreview({ entry, thumbnail: null, textContent: null, videoPath: entry.path, loading: true });
      const { promise, cancel } = queuedInvoke<string | null>(
        'get_video_thumbnail',
        { path: entry.path, size: 1024 },
      );
      thumbnailCancelRef.current = cancel;
      promise
        .then(b64 => {
          setPreview(prev => {
            if (!prev || prev.entry.path !== entry.path) return prev;
            return { ...prev, thumbnail: b64 ? `data:image/png;base64,${b64}` : null, loading: false };
          });
        })
        .catch(() => {
          setPreview(prev => {
            if (!prev || prev.entry.path !== entry.path) return prev;
            return { ...prev, loading: false };
          });
        });
      return;
    }

    // 텍스트/코드/문서: 텍스트 내용 로딩
    if (isText) {
      setPreview({ entry, thumbnail: null, textContent: null, videoPath: null, loading: true });
      invoke<string>('read_text_file', { path: entry.path, maxBytes: 8192 })
        .then(content => {
          setPreview(prev => {
            if (!prev || prev.entry.path !== entry.path) return prev;
            return { ...prev, textContent: content, loading: false };
          });
        })
        .catch(() => {
          setPreview(prev => {
            if (!prev || prev.entry.path !== entry.path) return prev;
            return { ...prev, loading: false };
          });
        });
      return;
    }

    // 이미지 또는 PSD/PSB: 썸네일 로딩
    if (entry.file_type === 'image' || isPsd) {
      setPreview({ entry, thumbnail: null, textContent: null, videoPath: null, loading: true });
      const cmd = isPsd ? 'get_psd_thumbnail' : 'get_file_thumbnail';
      const { promise, cancel } = queuedInvoke<string | null>(
        cmd,
        { path: entry.path, size: 1024 },
      );
      thumbnailCancelRef.current = cancel;
      promise
        .then(b64 => {
          setPreview(prev => {
            if (!prev || prev.entry.path !== entry.path) return prev;
            return { ...prev, thumbnail: b64 ? `data:image/png;base64,${b64}` : null, loading: false };
          });
        })
        .catch(() => {
          setPreview(prev => {
            if (!prev || prev.entry.path !== entry.path) return prev;
            return { ...prev, loading: false };
          });
        });
      return;
    }

    // 기타 파일: 미리보기 없음
    setPreview({ entry, thumbnail: null, textContent: null, videoPath: null, loading: false });
  }, []);

  // 정렬 함수 (폴더 우선, 이름순 - 자연 정렬)
  const sortEntries = useCallback((list: FileEntry[]): FileEntry[] => {
    return [...list].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      const re = /(\d+)|(\D+)/g;
      const aParts = a.name.match(re) || [];
      const bParts = b.name.match(re) || [];
      const len = Math.min(aParts.length, bParts.length);
      for (let i = 0; i < len; i++) {
        const aIsNum = /^\d/.test(aParts[i]);
        const bIsNum = /^\d/.test(bParts[i]);
        if (aIsNum && bIsNum) {
          const diff = parseInt(aParts[i], 10) - parseInt(bParts[i], 10);
          if (diff !== 0) return diff;
          if (aParts[i].length !== bParts[i].length) return aParts[i].length - bParts[i].length;
        } else if (aIsNum !== bIsNum) {
          return aIsNum ? -1 : 1;
        } else {
          const cmp = aParts[i].localeCompare(bParts[i], 'ko');
          if (cmp !== 0) return cmp;
        }
      }
      return aParts.length - bParts.length;
    });
  }, []);

  // 컬럼 내 항목 선택 — 단일 setColumns로 리렌더 최소화
  const selectInColumn = useCallback((colIndex: number, entry: FileEntry) => {
    // 포커스 위치 업데이트 (columns ref 없이 setColumns 내부에서 계산)
    setFocusedCol(colIndex);
    setColumns(prev => {
      const col = prev[colIndex];
      if (col) {
        const rowIdx = col.entries.findIndex(e => e.path === entry.path);
        if (rowIdx >= 0) setFocusedRow(rowIdx);
      }
      return prev; // 실제 업데이트는 아래에서
    });

    if (entry.is_dir) {
      // 폴더: 선택 상태 업데이트 + 서브 컬럼 추가
      setPreview(null);
      const newColIndex = colIndex + 1;
      const requestPath = entry.path;
      const cached = dirCacheRef.current.get(requestPath);

      if (cached) {
        // 캐시 히트: 스피너 없이 즉시 표시
        setColumns(prev => {
          const updated = prev.slice(0, colIndex + 1).map((col, i) => {
            if (i === colIndex) return { ...col, selectedPath: entry.path };
            return col;
          });
          updated.push({
            path: requestPath,
            entries: cached,
            loading: false,
            selectedPath: null,
          });
          return updated;
        });
        // 백그라운드에서 최신 데이터 갱신 (캐시 → 즉시 표시 → 변경분만 반영)
        invoke<FileEntry[]>('list_directory', { path: requestPath })
          .then(result => {
            const sorted = sortEntries(result);
            dirCacheRef.current.set(requestPath, sorted);
            setColumns(prev => {
              const idx = prev.findIndex(c => c.path === requestPath);
              if (idx < 0) return prev;
              // 캐시와 동일하면 업데이트 스킵
              const existing = prev[idx].entries;
              if (existing.length === sorted.length &&
                existing.every((e, i) => e.path === sorted[i].path && e.modified === sorted[i].modified)) {
                return prev;
              }
              const updated = [...prev];
              updated[idx] = { ...updated[idx], entries: sorted };
              return updated;
            });
          })
          .catch(() => {});
      } else {
        // 캐시 미스: 로딩 표시 후 IPC 호출
        loadRequestRef.current.set(newColIndex, requestPath);
        setColumns(prev => {
          const updated = prev.slice(0, colIndex + 1).map((col, i) => {
            if (i === colIndex) return { ...col, selectedPath: entry.path };
            return col;
          });
          updated.push({
            path: requestPath,
            entries: [],
            loading: true,
            selectedPath: null,
          });
          return updated;
        });

        // 디렉토리 로딩
        invoke<FileEntry[]>('list_directory', { path: requestPath })
          .then(result => {
            if (loadRequestRef.current.get(newColIndex) !== requestPath) return;
            loadRequestRef.current.delete(newColIndex);
            const sorted = sortEntries(result);
            dirCacheRef.current.set(requestPath, sorted);
            setColumns(prev => {
              if (prev.length <= newColIndex) return prev;
              if (prev[newColIndex].path !== requestPath) return prev;
              const updated = [...prev];
              updated[newColIndex] = {
                ...updated[newColIndex],
                entries: sorted,
                loading: false,
              };
              return updated;
            });
          })
          .catch(() => {
            if (loadRequestRef.current.get(newColIndex) !== requestPath) return;
            loadRequestRef.current.delete(newColIndex);
            setColumns(prev => {
              if (prev.length <= newColIndex) return prev;
              if (prev[newColIndex].path !== requestPath) return prev;
              const updated = [...prev];
              updated[newColIndex] = {
                ...updated[newColIndex],
                entries: [],
                loading: false,
              };
              return updated;
            });
          });
      }
    } else {
      // 파일: 선택 상태만 업데이트
      setColumns(prev => {
        const updated = prev.slice(0, colIndex + 1).map((col, i) => {
          if (i === colIndex) return { ...col, selectedPath: entry.path };
          return col;
        });
        return updated;
      });
      loadThumbnail(entry);
    }
  }, [sortEntries, loadThumbnail]);

  // 지정 컬럼 이후의 모든 컬럼 제거 (← 화살표 뒤로 이동 시)
  // 마지막 유지 컬럼의 selectedPath도 초기화 (서브 컬럼이 제거되었으므로)
  const trimColumnsAfter = useCallback((colIndex: number) => {
    setColumns(prev => {
      if (prev.length <= colIndex + 1) return prev;
      const trimmed = prev.slice(0, colIndex + 1);
      return trimmed.map((col, i) => {
        if (i === colIndex) return { ...col, selectedPath: null };
        return col;
      });
    });
    setPreview(null);
    loadRequestRef.current.forEach((_, key) => {
      if (key > colIndex) loadRequestRef.current.delete(key);
    });
  }, []);

  // 첫 번째 컬럼 entries 업데이트 (정렬/검색 변경 시)
  const updateFirstColumn = useCallback((entries: FileEntry[]) => {
    setColumns(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[0] = { ...updated[0], entries };
      return updated;
    });
  }, []);

  return {
    columns,
    preview,
    focusedCol,
    focusedRow,
    setFocusedCol,
    setFocusedRow,
    initColumns,
    clearColumns,
    selectInColumn,
    trimColumnsAfter,
    updateFirstColumn,
  };
}
