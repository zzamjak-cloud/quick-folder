import React, { memo, useRef, useEffect, useState, useCallback } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { FileEntry } from '../../types';
import { ThemeVars } from './types';
import { ColumnData, ColumnPreviewData } from './hooks/useColumnView';
import ColumnPanel from './ColumnPanel';
import ColumnPreviewPanel from './ColumnPreviewPanel';
import { createScrollStorageKey, usePersistentScroll } from './hooks/usePersistentScroll';
import { readNumberStorage, storageKeys, writeNumberStorage } from '../../utils/storage';

interface ColumnViewProps {
  columns: ColumnData[];
  preview: ColumnPreviewData | null;
  focusedCol: number;
  focusedRow: number;
  selectedPaths: string[];
  renamingPath: string | null;
  loading: boolean;
  error: string | null;
  themeVars: ThemeVars | null;
  instanceId?: string;
  currentPath: string;
  onSelectInColumn: (colIndex: number, entry: FileEntry, multi: boolean, range: boolean) => void;
  onOpenEntry: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onDragMouseDown: (e: React.MouseEvent, entryPath: string) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
}

export default memo(function ColumnView({
  columns,
  preview,
  focusedCol,
  focusedRow,
  loading,
  error,
  themeVars,
  onSelectInColumn,
  onOpenEntry,
  onContextMenu,
  onDragMouseDown,
  selectedPaths,
  renamingPath,
  onRenameCommit,
  instanceId,
  currentPath,
}: ColumnViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const storageKey = storageKeys.columnViewWidth(instanceId ?? 'default');
  const horizontalScrollKey = currentPath
    ? createScrollStorageKey('column-view', instanceId ?? 'default', 'horizontal', currentPath)
    : null;
  const { handleScroll } = usePersistentScroll(scrollRef, horizontalScrollKey, [
    columns.length,
    preview?.entry.path ?? '',
  ]);

  // 컬럼 너비 — 모든 컬럼에 동일하게 적용 (단일 값, 저장소 영속화)
  const [columnWidth, setColumnWidth] = useState<number>(() => {
    return Math.max(150, readNumberStorage(storageKey, 220));
  });
  const handleColumnResize = useCallback((_colIdx: number, delta: number) => {
    setColumnWidth(prev => {
      const next = Math.max(150, prev + delta);
      writeNumberStorage(storageKey, next);
      return next;
    });
  }, [storageKey]);

  // 새 컬럼/미리보기 추가 시에만 자동 가로 스크롤
  const prevColumnCountRef = useRef(columns.length);
  const prevPreviewPathRef = useRef(preview?.entry.path ?? null);
  useEffect(() => {
    const prevColumnCount = prevColumnCountRef.current;
    const prevPreviewPath = prevPreviewPathRef.current;
    const currentPreviewPath = preview?.entry.path ?? null;
    const shouldScrollToEnd =
      columns.length > prevColumnCount ||
      (!!currentPreviewPath && currentPreviewPath !== prevPreviewPath);

    prevColumnCountRef.current = columns.length;
    prevPreviewPathRef.current = currentPreviewPath;

    if (!shouldScrollToEnd) return;
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
      });
    }
  }, [columns.length, preview?.entry.path]);

  // 첫 로딩 (컬럼이 없는 상태)
  if (loading && columns.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2
          size={28}
          className="animate-spin"
          style={{ color: themeVars?.accent ?? '#3b82f6' }}
        />
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <AlertCircle size={28} style={{ color: '#f87171' }} />
        <p className="text-xs text-center max-w-xs" style={{ color: '#f87171' }}>
          {error}
        </p>
      </div>
    );
  }

  // 빈 상태
  if (columns.length === 0) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-2 select-none"
        style={{ color: themeVars?.muted ?? '#94a3b8' }}
      >
        <div className="text-4xl opacity-30">📂</div>
        <p className="text-xs">폴더가 비어 있습니다</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="qf-scrollable flex-1 flex overflow-x-auto overflow-y-hidden"
      style={{ backgroundColor: themeVars?.bg ?? '#0f172a' }}
      onScroll={handleScroll}
    >
      {/* 백그라운드 로딩 인디케이터 */}
      {loading && columns.length > 0 && (
        <div className="absolute top-0 left-0 right-0 z-10 h-0.5 overflow-hidden" style={{ backgroundColor: `${themeVars?.accent ?? '#3b82f6'}20` }}>
          <div className="h-full animate-[loading-bar_1s_ease-in-out_infinite]" style={{ backgroundColor: themeVars?.accent ?? '#3b82f6', width: '40%' }} />
          <style>{`@keyframes loading-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
        </div>
      )}

      {/* 컬럼 패널 배열 */}
      {columns.map((col, idx) => (
        <ColumnPanel
          key={col.path}
          column={col}
          colIndex={idx}
          isFocusedCol={focusedCol === idx}
          focusedRow={focusedRow}
          selectedPaths={selectedPaths}
          renamingPath={renamingPath}
          themeVars={themeVars}
          instanceId={instanceId}
          width={columnWidth}
          onResize={(delta) => handleColumnResize(idx, delta)}
          onSelect={onSelectInColumn}
          onOpen={onOpenEntry}
          onContextMenu={onContextMenu}
          onDragMouseDown={onDragMouseDown}
          onRenameCommit={onRenameCommit}
        />
      ))}

      {/* 파일 미리보기 패널 */}
      {preview && (
        <ColumnPreviewPanel
          preview={preview}
          themeVars={themeVars}
        />
      )}
    </div>
  );
});
