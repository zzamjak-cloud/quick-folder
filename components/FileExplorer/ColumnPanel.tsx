import React, { memo, useEffect, useRef, useMemo, useCallback } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { FileEntry } from '../../types';
import { ThemeVars } from './types';
import { FileTypeIcon, iconColor, getFileIconShadowStyle } from './fileUtils';
import { useNativeIcon } from './hooks/useNativeIcon';
import { useRenameInput } from './hooks/useRenameInput';
import { ColumnData } from './hooks/useColumnView';
import { createScrollStorageKey, usePersistentScroll } from './hooks/usePersistentScroll';

// 개별 행 컴포넌트
const ColumnRow = memo(function ColumnRow({
  entry,
  isSelected,
  isFocused,
  isRenaming,
  themeVars,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragMouseDown,
  onRenameCommit,
}: {
  entry: FileEntry;
  isSelected: boolean;
  isFocused: boolean;
  isRenaming: boolean;
  themeVars: ThemeVars | null;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragMouseDown: (e: React.MouseEvent, entryPath: string) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
}) {
  const nativeIcon = useNativeIcon(entry, 16);
  const iconShadowStyle = getFileIconShadowStyle(themeVars, true);
  const rowRef = useRef<HTMLDivElement>(null);
  const wasFocusedRef = useRef(isFocused);
  const {
    renameValue,
    setRenameValue,
    inputRef,
    handleKeyDown,
    handleBlur,
  } = useRenameInput({
    name: entry.name,
    isDir: entry.is_dir,
    isRenaming,
    onRenameCommit,
    path: entry.path,
    selectBeforeExtension: true,
  });

  // 포커스된 항목 자동 스크롤
  useEffect(() => {
    if (isFocused && !wasFocusedRef.current && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    wasFocusedRef.current = isFocused;
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
      onMouseDown={(e) => {
        if (isRenaming) return;
        e.stopPropagation();
        onDragMouseDown(e, entry.path);
      }}
    >
      {/* 아이콘 */}
      {nativeIcon ? (
        <img src={nativeIcon} alt="" style={{ width: 16, height: 16, flexShrink: 0, ...iconShadowStyle }} draggable={false} />
      ) : (
        <span style={{ color: iconColor(entry.file_type, entry.name), flexShrink: 0, ...iconShadowStyle }}>
          <FileTypeIcon fileType={entry.file_type} size={16} fileName={entry.name} />
        </span>
      )}

      {/* 파일명 */}
      {isRenaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onClick={e => e.stopPropagation()}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className="min-w-0 flex-1 rounded px-1 text-xs outline-none"
          style={{
            backgroundColor: themeVars?.surface2 ?? '#1f2937',
            color: themeVars?.text ?? '#e5e7eb',
            border: `1px solid ${themeVars?.accent ?? '#3b82f6'}`,
          }}
        />
      ) : (
        <span
          className="flex-1 min-w-0 truncate"
          style={{ color: themeVars?.text ?? '#e5e7eb' }}
        >
          {entry.name}
        </span>
      )}

      {/* 폴더면 ChevronRight */}
      {entry.is_dir && !isRenaming && (
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
  renamingPath: string | null;
  instanceId?: string;
  width?: number;
  onResize?: (delta: number) => void;
  onSelect: (colIndex: number, entry: FileEntry, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onDragMouseDown: (e: React.MouseEvent, entryPath: string) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
}

export default memo(function ColumnPanel({
  column,
  colIndex,
  isFocusedCol,
  focusedRow,
  themeVars,
  selectedPaths,
  renamingPath,
  instanceId,
  width = 220,
  onResize,
  onSelect,
  onOpen,
  onContextMenu,
  onDragMouseDown,
  onRenameCommit,
}: ColumnPanelProps) {
  const resizeStartRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollStorageKey = createScrollStorageKey('column-panel', instanceId ?? 'default', 'vertical', column.path);
  const { handleScroll } = usePersistentScroll(scrollRef, scrollStorageKey, [column.entries.length]);

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
      className="flex-shrink-0 h-full flex overflow-hidden"
      style={{
        width,
      }}
    >
      <div
        ref={scrollRef}
        className="qf-scrollable min-w-0 flex-1 h-full overflow-y-auto overflow-x-hidden py-0.5"
        onScroll={handleScroll}
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
              isRenaming={renamingPath === entry.path}
              themeVars={themeVars}
              onClick={(e) => handleClick(e, entry)}
              onDoubleClick={() => onOpen(entry)}
              onContextMenu={(e) => handleContextMenu(e, entry.path)}
              onDragMouseDown={onDragMouseDown}
              onRenameCommit={onRenameCommit}
            />
          ))
        )}
      </div>
      {/* 리사이즈 핸들 */}
      {onResize ? (
        <div
          className="h-full w-2 flex-shrink-0 cursor-col-resize border-l hover:bg-blue-500/30"
          style={{ borderColor: themeVars?.border ?? '#334155' }}
          onMouseDown={handleResizeStart}
        />
      ) : (
        <div
          className="h-full w-px flex-shrink-0"
          style={{ backgroundColor: themeVars?.border ?? '#334155' }}
        />
      )}
    </div>
  );
});
