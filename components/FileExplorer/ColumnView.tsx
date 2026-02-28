import React, { memo, useRef, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { FileEntry } from '../../types';
import { ThemeVars } from './types';
import { ColumnData, ColumnPreviewData } from './hooks/useColumnView';
import ColumnPanel from './ColumnPanel';
import ColumnPreviewPanel from './ColumnPreviewPanel';

interface ColumnViewProps {
  columns: ColumnData[];
  preview: ColumnPreviewData | null;
  focusedCol: number;
  focusedRow: number;
  loading: boolean;
  error: string | null;
  themeVars: ThemeVars | null;
  onSelectInColumn: (colIndex: number, entry: FileEntry) => void;
  onOpenEntry: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
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
}: ColumnViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 컬럼 추가 시 자동 가로 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
      });
    }
  }, [columns.length, preview]);

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
      className="flex-1 flex overflow-x-auto overflow-y-hidden"
      style={{ backgroundColor: themeVars?.bg ?? '#0f172a' }}
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
          themeVars={themeVars}
          onSelect={onSelectInColumn}
          onOpen={onOpenEntry}
          onContextMenu={onContextMenu}
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
