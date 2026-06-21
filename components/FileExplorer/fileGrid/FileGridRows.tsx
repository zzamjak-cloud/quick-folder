import React, { memo, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ClipboardData, FileEntry } from '../../../types';
import { normalizeFsPath } from '../../../utils/pathUtils';
import { readJsonStorage, storageKeys, writeJsonStorage } from '../../../utils/storage';
import { ThemeVars } from '../types';
import {
  FileTypeIcon,
  formatSize,
  formatTooltip,
  getFileIconShadowStyle,
  iconColor,
} from '../fileUtils';
import FuzzyHighlightedName from '../FuzzyHighlightedName';
import { useNativeIcon } from '../hooks/useNativeIcon';
import { useRenameInput } from '../hooks/useRenameInput';

interface FileGridRowProps {
  entry: FileEntry;
  isSelected: boolean;
  isFocused: boolean;
  isRenaming: boolean;
  isCut: boolean;
  isDropTarget: boolean;
  isPending?: boolean;
  isDimmed?: boolean;
  fuzzyHighlightIndices?: number[];
  onDragMouseDown: (e: React.MouseEvent, entryPath: string) => void;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onOpenInNewTab?: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  onHoverFolder?: (path: string) => void;
  themeVars: ThemeVars | null;
  cvEnabled?: boolean;
}

export const ListRow = memo(function ListRow({
  entry,
  isSelected,
  isFocused,
  isRenaming,
  isCut,
  isDropTarget,
  isPending,
  isDimmed,
  fuzzyHighlightIndices,
  onDragMouseDown,
  onSelect,
  onOpen,
  onOpenInNewTab,
  onContextMenu,
  onRenameCommit,
  onHoverFolder,
  themeVars,
  cvEnabled,
}: FileGridRowProps) {
  const nativeIcon = useNativeIcon(entry, 16);
  const iconShadowStyle = getFileIconShadowStyle(themeVars, true);
  const {
    renameValue, setRenameValue, inputRef,
    handleKeyDown, handleBlur,
  } = useRenameInput({
    name: entry.name,
    isDir: entry.is_dir,
    isRenaming,
    onRenameCommit,
    path: entry.path,
  });

  const bg = isSelected
    ? (themeVars?.accent20 ?? 'rgba(59,130,246,0.2)')
    : isFocused ? (themeVars?.surfaceHover ?? '#334155') : 'transparent';
  const border = isDropTarget ? `1px solid ${themeVars?.accent ?? '#3b82f6'}` : '1px solid transparent';

  return (
    <div
      data-file-path={entry.path}
      {...(entry.is_dir ? { 'data-folder-drop-target': entry.path } : {})}
      className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer select-none"
      style={{ backgroundColor: bg, opacity: isPending ? 0.5 : isDimmed ? 0.35 : isCut ? 0.4 : 1, border, pointerEvents: isPending ? 'none' : undefined, ...(cvEnabled ? { contentVisibility: 'auto', containIntrinsicSize: '100% 28px' } as React.CSSProperties : {}) }}
      title={formatTooltip(entry)}
      onMouseEnter={entry.is_dir && onHoverFolder ? () => onHoverFolder(entry.path) : undefined}
      onClick={(e) => { e.stopPropagation(); if (isPending) return; onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey); }}
      onDoubleClick={(e) => {
        if (isPending) return;
        if ((e.ctrlKey || e.metaKey) && (entry.is_dir || entry.file_type === 'archive') && onOpenInNewTab) onOpenInNewTab(entry);
        else onOpen(entry);
      }}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e, [entry.path]); }}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (isRenaming) return;
        onDragMouseDown(e, entry.path);
      }}
    >
      <div className="relative flex-shrink-0" style={{ width: 16, height: 16 }}>
        {nativeIcon ? (
          <img src={nativeIcon} alt="" style={{ width: 16, height: 16, ...iconShadowStyle }} draggable={false} />
        ) : (
          <span style={{ color: iconColor(entry.file_type, entry.name), ...iconShadowStyle }}>
            <FileTypeIcon fileType={entry.file_type} size={16} fileName={entry.name} />
          </span>
        )}
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 4 }}>
            <Loader2 size={12} className="animate-spin text-white" />
          </div>
        )}
      </div>
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
          className="flex-1 min-w-0 text-xs px-1 rounded outline-none"
          style={{ backgroundColor: themeVars?.surface2, color: themeVars?.text, border: `1px solid ${themeVars?.accent}` }}
        />
      ) : fuzzyHighlightIndices?.length ? (
        <FuzzyHighlightedName
          name={entry.name}
          indices={fuzzyHighlightIndices}
          themeVars={themeVars}
          className="flex-1 min-w-0 text-xs truncate"
        />
      ) : (
        <span className="flex-1 min-w-0 text-xs truncate" style={{ color: themeVars?.text }}>
          {entry.name}
        </span>
      )}
    </div>
  );
});

export const DetailsRow = memo(function DetailsRow({
  entry,
  isSelected,
  isFocused,
  isRenaming,
  isCut,
  isDropTarget,
  isPending,
  isDimmed,
  fuzzyHighlightIndices,
  onDragMouseDown,
  onSelect,
  onOpen,
  onOpenInNewTab,
  onContextMenu,
  onRenameCommit,
  onHoverFolder,
  themeVars,
  cvEnabled,
}: FileGridRowProps) {
  const nativeIcon = useNativeIcon(entry, 14);
  const iconShadowStyle = getFileIconShadowStyle(themeVars, true);
  const {
    renameValue, setRenameValue,
    handleKeyDown, handleBlur,
  } = useRenameInput({
    name: entry.name,
    isDir: entry.is_dir,
    isRenaming,
    onRenameCommit,
    path: entry.path,
  });

  const typeLabels: Record<string, string> = {
    directory: '폴더', image: '이미지', video: '비디오',
    document: '문서', code: '코드', archive: '압축', other: '기타',
  };

  function fmtDate(ms: number) {
    if (!ms) return '-';
    return new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  const bg = isSelected ? themeVars?.accent20 : isFocused ? themeVars?.surfaceHover : 'transparent';
  const outline = isDropTarget ? `2px solid ${themeVars?.accent ?? '#3b82f6'}` : undefined;

  return (
    <tr
      data-file-path={entry.path}
      {...(entry.is_dir ? { 'data-folder-drop-target': entry.path } : {})}
      style={{ backgroundColor: bg ?? undefined, opacity: isPending ? 0.5 : isDimmed ? 0.35 : isCut ? 0.4 : 1, outline, pointerEvents: isPending ? 'none' : undefined, ...(cvEnabled ? { contentVisibility: 'auto', containIntrinsicSize: '100% 26px' } as React.CSSProperties : {}) }}
      className="cursor-pointer hover:opacity-80"
      title={formatTooltip(entry)}
      onMouseEnter={entry.is_dir && onHoverFolder ? () => onHoverFolder(entry.path) : undefined}
      onClick={(e) => { e.stopPropagation(); if (isPending) return; onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey); }}
      onDoubleClick={(e) => {
        if (isPending) return;
        if ((e.ctrlKey || e.metaKey) && (entry.is_dir || entry.file_type === 'archive') && onOpenInNewTab) onOpenInNewTab(entry);
        else onOpen(entry);
      }}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e, [entry.path]); }}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (isRenaming) return;
        onDragMouseDown(e, entry.path);
      }}
    >
      <td className="px-3 py-1">
        <div className="flex items-center gap-2">
          <div className="relative flex-shrink-0" style={{ width: 14, height: 14 }}>
            {nativeIcon ? (
              <img src={nativeIcon} alt="" style={{ width: 14, height: 14, ...iconShadowStyle }} draggable={false} />
            ) : (
              <span style={{ color: iconColor(entry.file_type, entry.name), ...iconShadowStyle }}>
                <FileTypeIcon fileType={entry.file_type} size={14} fileName={entry.name} />
              </span>
            )}
            {isPending && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 3 }}>
                <Loader2 size={10} className="animate-spin text-white" />
              </div>
            )}
          </div>
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              onClick={e => e.stopPropagation()}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="flex-1 min-w-0 px-1 rounded outline-none"
              style={{ backgroundColor: themeVars?.surface2, color: themeVars?.text, border: `1px solid ${themeVars?.accent}` }}
            />
          ) : fuzzyHighlightIndices?.length ? (
            <FuzzyHighlightedName
              name={entry.name}
              indices={fuzzyHighlightIndices}
              themeVars={themeVars}
              className="truncate text-xs"
            />
          ) : (
            <span className="truncate text-xs" style={{ color: themeVars?.text }}>{entry.name}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-1 text-xs" style={{ color: themeVars?.muted }}>{fmtDate(entry.modified)}</td>
      <td className="px-3 py-1 text-right text-xs" style={{ color: themeVars?.muted }}>
        {formatSize(entry.size, entry.is_dir)}
      </td>
      <td className="px-3 py-1 text-xs" style={{ color: themeVars?.muted }}>{typeLabels[entry.file_type] ?? '기타'}</td>
    </tr>
  );
});

interface DetailsTableProps {
  entries: FileEntry[];
  selectedPaths: string[];
  focusedIndex: number;
  renamingPath: string | null;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  clipboard: ClipboardData | null;
  dropTargetPath: string | null;
  onDragMouseDown: (e: React.MouseEvent, entryPath: string) => void;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onOpenInNewTab?: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  onSortChange?: (by: string) => void;
  onHoverFolder?: (path: string) => void;
  themeVars: ThemeVars | null;
  instanceId?: string;
  pendingCopyPaths?: Set<string>;
  draggedPaths?: Set<string>;
  isDraggingNow?: boolean;
  cvEnabled?: boolean;
  fuzzyMatchIndices?: Map<string, number[]>;
  isFuzzyNonMatch?: (path: string) => boolean;
}

export function DetailsTable({
  entries,
  selectedPaths,
  focusedIndex,
  renamingPath,
  sortBy,
  sortDir,
  clipboard,
  dropTargetPath,
  onDragMouseDown,
  onSelect,
  onOpen,
  onOpenInNewTab,
  onContextMenu,
  onRenameCommit,
  onSortChange,
  onHoverFolder,
  themeVars,
  instanceId,
  pendingCopyPaths,
  draggedPaths,
  isDraggingNow,
  cvEnabled,
  fuzzyMatchIndices,
  isFuzzyNonMatch,
}: DetailsTableProps) {
  const storageKey = storageKeys.detailsColumns(instanceId ?? 'default');

  const [colWidths, setColWidths] = useState<{ name: number; modified: number; size: number; type: number }>(() => {
    const defaults = { name: 0, modified: 140, size: 80, type: 70 };
    return { ...defaults, ...readJsonStorage(storageKey, {}) };
  });
  const resizingRef = useRef<{ col: keyof typeof colWidths; startX: number; startW: number } | null>(null);
  const nameManuallyResized = colWidths.name > 0;

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const delta = e.clientX - r.startX;
      setColWidths(prev => {
        const minW = r.col === 'name' ? 100 : 50;
        const baseW = r.col === 'name' && r.startW === 0 ? 200 : r.startW;
        return { ...prev, [r.col]: Math.max(minW, baseW + delta) };
      });
    };
    const onUp = () => {
      if (resizingRef.current) {
        resizingRef.current = null;
        setColWidths(prev => {
          writeJsonStorage(storageKey, prev);
          return prev;
        });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [storageKey]);

  const startResize = (col: keyof typeof colWidths, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { col, startX: e.clientX, startW: colWidths[col] };
  };

  const sortIndicator = (col: string) => sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const headerStyle: React.CSSProperties = {
    cursor: onSortChange ? 'pointer' : 'default',
    userSelect: 'none',
    position: 'relative',
  };

  return (
    <table className="text-xs border-collapse" style={{ tableLayout: 'auto' }}>
      <colgroup>
        <col style={nameManuallyResized ? { width: colWidths.name } : undefined} />
        <col style={{ width: colWidths.modified }} />
        <col style={{ width: colWidths.size }} />
        <col style={{ width: colWidths.type }} />
      </colgroup>
      <thead>
        <tr style={{ backgroundColor: themeVars?.surface2, color: themeVars?.muted }}>
          {(['name', 'modified', 'size', 'type'] as const).map((col) => (
            <th
              key={col}
              className={`${col === 'size' ? 'text-right' : 'text-left'} px-3 py-1.5 font-medium`}
              style={{ ...headerStyle, borderRight: `1px solid ${themeVars?.border ?? '#334155'}` }}
              onClick={() => onSortChange?.(col)}
            >
              {{ name: '이름', modified: '날짜', size: '크기', type: '형식' }[col]}{sortIndicator(col)}
              <div
                className="absolute top-0 w-2 h-full cursor-col-resize hover:bg-blue-500/40"
                style={{ right: -4 }}
                onMouseDown={(e) => startResize(col, e)}
              />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, idx) => {
          const getExtKey = (e: FileEntry) => e.is_dir ? 'folder' : (e.name.includes('.') ? e.name.slice(e.name.lastIndexOf('.') + 1).toLowerCase() : '');
          const prevExt = idx > 0 ? getExtKey(entries[idx - 1]) : null;
          const showSep = sortBy === 'type' && idx > 0 && getExtKey(entry) !== prevExt;
          return (
            <React.Fragment key={entry.path}>
              {showSep && (
                <tr>
                  <td colSpan={4} className="px-3 py-1">
                    <div className="border-t" style={{ borderColor: themeVars?.border ?? '#334155' }} />
                  </td>
                </tr>
              )}
              <DetailsRow
                entry={entry}
                isSelected={selectedPaths.includes(entry.path)}
                isFocused={focusedIndex === idx}
                isRenaming={renamingPath === entry.path}
                isCut={clipboard?.action === 'cut' && clipboard.paths.includes(entry.path)}
                isDropTarget={dropTargetPath === entry.path && entry.is_dir}
                isPending={pendingCopyPaths?.has(normalizeFsPath(entry.path))}
                isDimmed={(!!isDraggingNow && !!draggedPaths?.has(entry.path)) || !!isFuzzyNonMatch?.(entry.path)}
                fuzzyHighlightIndices={fuzzyMatchIndices?.get(entry.path)}
                onDragMouseDown={onDragMouseDown}
                onSelect={onSelect}
                onOpen={onOpen}
                onOpenInNewTab={onOpenInNewTab}
                onContextMenu={onContextMenu}
                onRenameCommit={onRenameCommit}
                onHoverFolder={onHoverFolder}
                themeVars={themeVars}
                cvEnabled={cvEnabled}
              />
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
