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
  // 썸네일 로딩 취소용
  const thumbnailCancelRef = useRef<(() => void) | null>(null);

  // 뷰 모드 전환 시 첫 컬럼 초기화
  const initColumns = useCallback((rootPath: string, entries: FileEntry[]) => {
    setColumns([{
      path: rootPath,
      entries,
      loading: false,
      selectedPath: null,
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

  // 썸네일 로딩 헬퍼
  const loadThumbnail = useCallback((entry: FileEntry) => {
    // 이전 썸네일 로딩 취소
    if (thumbnailCancelRef.current) {
      thumbnailCancelRef.current();
      thumbnailCancelRef.current = null;
    }

    // 이미지 파일만 썸네일 로딩
    if (entry.file_type !== 'image') {
      setPreview({ entry, thumbnail: null, loading: false });
      return;
    }

    setPreview({ entry, thumbnail: null, loading: true });

    const { promise, cancel } = queuedInvoke<string | null>(
      'get_file_thumbnail',
      { path: entry.path, size: 260 },
    );
    thumbnailCancelRef.current = cancel;

    promise
      .then(b64 => {
        if (b64) {
          setPreview(prev => {
            if (!prev || prev.entry.path !== entry.path) return prev;
            return { ...prev, thumbnail: `data:image/png;base64,${b64}`, loading: false };
          });
        } else {
          setPreview(prev => {
            if (!prev || prev.entry.path !== entry.path) return prev;
            return { ...prev, loading: false };
          });
        }
      })
      .catch(() => {
        setPreview(prev => {
          if (!prev || prev.entry.path !== entry.path) return prev;
          return { ...prev, loading: false };
        });
      });
  }, []);

  // 정렬 함수 (폴더 우선, 이름순)
  const sortEntries = useCallback((list: FileEntry[]): FileEntry[] => {
    return [...list].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      return a.name.localeCompare(b.name, 'ko');
    });
  }, []);

  // 컬럼 내 항목 선택
  const selectInColumn = useCallback((colIndex: number, entry: FileEntry) => {
    // 해당 컬럼의 선택 상태 업데이트 + 오른쪽 컬럼 모두 제거
    setColumns(prev => {
      const updated = prev.slice(0, colIndex + 1).map((col, i) => {
        if (i === colIndex) {
          return { ...col, selectedPath: entry.path };
        }
        return col;
      });
      return updated;
    });

    // 포커스 위치 업데이트
    setFocusedCol(colIndex);
    const col = columns[colIndex];
    if (col) {
      const rowIdx = col.entries.findIndex(e => e.path === entry.path);
      if (rowIdx >= 0) setFocusedRow(rowIdx);
    }

    if (entry.is_dir) {
      // 폴더: 새 컬럼 추가 (로딩 상태)
      setPreview(null);
      const newColIndex = colIndex + 1;
      const requestPath = entry.path;
      loadRequestRef.current.set(newColIndex, requestPath);

      // 로딩 컬럼 추가
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
          // stale 응답 무시
          if (loadRequestRef.current.get(newColIndex) !== requestPath) return;
          loadRequestRef.current.delete(newColIndex);
          const sorted = sortEntries(result);
          setColumns(prev => {
            // 해당 컬럼이 아직 존재하는지 확인
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
    } else {
      // 파일: 미리보기 표시
      loadThumbnail(entry);
    }
  }, [columns, sortEntries, loadThumbnail]);

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
    updateFirstColumn,
  };
}
