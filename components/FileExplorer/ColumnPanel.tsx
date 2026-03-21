import React, { memo, useEffect, useRef, useMemo, useCallback } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { FileEntry } from '../../types';
import { ThemeVars } from './types';
import { FileTypeIcon, iconColor } from './fileUtils';
import { useNativeIcon } from './hooks/useNativeIcon';
import { ColumnData } from './hooks/useColumnView';

// 개별 행 컴포넌트
const ColumnRow = memo(function ColumnRow({
  entry,
  isSelected,
  isFocused,
  themeVars,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragMouseDown,
}: {
  entry: FileEntry;
  isSelected: boolean;
  isFocused: boolean;
  themeVars: ThemeVars | null;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragMouseDown: (e: React.MouseEvent, entryPath: string) => void;
}) {
  const nativeIcon = useNativeIcon(entry, 16);
  const rowRef = useRef<HTMLDivElement>(null);

  // 포커스된 항목 자동 스크롤
  useEffect(() => {
    if (isFocused && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isFocused]);

  const bg = isSelected
    ? (themeVars?.accent20 ?? 'rgba(59,130,246,0.2)')
    : isFocused
      ? (themeVars?.surfaceHover ?? '#334155')
      : 'transparent';

  return (
    <div
      ref={rowRef}
      data-file-path={entry.path}
      className="flex items-center gap-1.5 px-2 py-1 cursor-pointer select-none text-xs rounded-sm mx-0.5"
      style={{ backgroundColor: bg }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseDown={(e) => { e.stopPropagation(); onDragMouseDown(e, entry.path); }}
    >
      {/* 아이콘 */}
      {nativeIcon ? (
        <img src={nativeIcon} alt="" style={{ width: 16, height: 16, flexShrink: 0 }} draggable={false} />
      ) : (
        <span style={{ color: iconColor(entry.file_type, entry.name), flexShrink: 0 }}>
          <FileTypeIcon fileType={entry.file_type} size={16} fileName={entry.name} />
        </span>
      )}

      {/* 파일명 */}
      <span
        className="flex-1 min-w-0 truncate"
        style={{ color: themeVars?.text ?? '#e5e7eb' }}
      >
        {entry.name}
      </span>

      {/* 폴더면 ChevronRight */}
      {entry.is_dir && (
        <ChevronRight size={12} style={{ color: themeVars?.muted ?? '#94a3b8', flexShrink: 0 }} />
      )}
    </div>
  );
});

interface ColumnPanelProps {
  column: ColumnData;
  colIndex: number;
  isFocusedCol: boolean;
  focusedRow: number;
  themeVars: ThemeVars | null;
  selectedPaths: string[];
  width?: number;
  onResize?: (delta: number) => void;
  onSelect: (colIndex: number, entry: FileEntry, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onDragMouseDown: (e: React.MouseEvent, entryPath: string) => void;
}

export default memo(function ColumnPanel({
  column,
  colIndex,
  isFocusedCol,
  focusedRow,
  themeVars,
  selectedPaths,
  width = 220,
  onResize,
  onSelect,
  onOpen,
  onContextMenu,
  onDragMouseDown,
}: ColumnPanelProps) {
  const resizeStartRef = useRef<number | null>(null);

  // selectedPaths를 Set으로 변환 — O(1) 조회
  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    resizeStartRef.current = startX;

    const onMove = (ev: MouseEvent) => {
      if (resizeStartRef.current === null) return;
      const delta = ev.clientX - resizeStartRef.current;
      resizeStartRef.current = ev.clientX;
      onResize?.(delta);
    };
    const onUp = () => {
      resizeStartRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [onResize]);

  // 안정적인 핸들러 참조 — colIndex를 ref로 캡처하여 인라인 클로저 제거
  const colIndexRef = useRef(colIndex);
  colIndexRef.current = colIndex;

  const handleClick = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    e.stopPropagation();
    onSelect(colIndexRef.current, entry, e.ctrlKey || e.metaKey, e.shiftKey);
  }, [onSelect]);

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    e.preventDefault();
    onContextMenu(e, [path]);
  }, [onContextMenu]);

  return (
    <div
      className="flex-shrink-0 h-full overflow-y-auto overflow-x-hidden border-r py-0.5 relative"
      style={{
        width,
        borderColor: themeVars?.border ?? '#334155',
      }}
    >
      {column.loading ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 size={18} className="animate-spin" style={{ color: themeVars?.accent ?? '#3b82f6' }} />
        </div>
      ) : column.entries.length === 0 ? (
        <div
          className="flex items-center justify-center h-full text-xs"
          style={{ color: themeVars?.muted ?? '#94a3b8' }}
        >
          빈 폴더
        </div>
      ) : (
        column.entries.map((entry, rowIdx) => (
          <ColumnRow
            key={entry.path}
            entry={entry}
            isSelected={selectedSet.has(entry.path)}
            isFocused={isFocusedCol && focusedRow === rowIdx}
            themeVars={themeVars}
            onClick={(e) => handleClick(e, entry)}
            onDoubleClick={() => onOpen(entry)}
            onContextMenu={(e) => handleContextMenu(e, entry.path)}
            onDragMouseDown={onDragMouseDown}
          />
        ))
      )}
      {/* 리사이즈 핸들 */}
      {onResize && (
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/30"
          onMouseDown={handleResizeStart}
        />
      )}
    </div>
  );
});
