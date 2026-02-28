import React, { memo, useEffect, useRef } from 'react';
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
}: {
  entry: FileEntry;
  isSelected: boolean;
  isFocused: boolean;
  themeVars: ThemeVars | null;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
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
        style={{ color: isSelected ? (themeVars?.text ?? '#e5e7eb') : (themeVars?.text ?? '#e5e7eb') }}
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
  onSelect: (colIndex: number, entry: FileEntry) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
}

export default memo(function ColumnPanel({
  column,
  colIndex,
  isFocusedCol,
  focusedRow,
  themeVars,
  onSelect,
  onOpen,
  onContextMenu,
}: ColumnPanelProps) {
  return (
    <div
      className="flex-shrink-0 h-full overflow-y-auto overflow-x-hidden border-r py-0.5"
      style={{
        width: 220,
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
            isSelected={column.selectedPath === entry.path}
            isFocused={isFocusedCol && focusedRow === rowIdx}
            themeVars={themeVars}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(colIndex, entry);
            }}
            onDoubleClick={() => onOpen(entry)}
            onContextMenu={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onContextMenu(e, [entry.path]);
            }}
          />
        ))
      )}
    </div>
  );
});
