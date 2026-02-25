import React, { memo } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { FileEntry, ThumbnailSize, ClipboardData } from '../../types';
import { ThemeVars } from './types';
import { FileTypeIcon, iconColor, formatSize, formatTooltip } from './fileUtils';
import FileCard from './FileCard';
import { useRenameInput } from './hooks/useRenameInput';
import { useNativeIcon } from './hooks/useNativeIcon';

interface FileGridProps {
  entries: FileEntry[];
  selectedPaths: string[];
  clipboard: ClipboardData | null;
  renamingPath: string | null;
  thumbnailSize: ThumbnailSize;
  viewMode: 'grid' | 'list' | 'details';
  sortBy: 'name' | 'size' | 'modified' | 'type';
  focusedIndex: number;
  gridRef: React.RefObject<HTMLDivElement>;
  loading: boolean;
  error: string | null;
  dropTargetPath: string | null;
  onDragMouseDown: (e: React.MouseEvent, entryPath: string) => void;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onDeselectAll: () => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  themeVars: ThemeVars | null;
}

// --- ListRow 컴포넌트 ---
const ListRow = memo(function ListRow({ entry, isSelected, isFocused, isRenaming, isCut, isDropTarget, onDragMouseDown, onSelect, onOpen, onContextMenu, onRenameCommit, themeVars }: {
  entry: FileEntry;
  isSelected: boolean;
  isFocused: boolean;
  isRenaming: boolean;
  isCut: boolean;
  isDropTarget: boolean;
  onDragMouseDown: (e: React.MouseEvent, entryPath: string) => void;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  themeVars: ThemeVars | null;
}) {
  const nativeIcon = useNativeIcon(entry, 16);
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
      style={{ backgroundColor: bg, opacity: isCut ? 0.4 : 1, border }}
      title={formatTooltip(entry)}
      onClick={(e) => { e.stopPropagation(); onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey); }}
      onDoubleClick={() => onOpen(entry)}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e, [entry.path]); }}
      onMouseDown={(e) => onDragMouseDown(e, entry.path)}
    >
      {/* 아이콘 (네이티브 우선, lucide 폴백) */}
      {nativeIcon ? (
        <img src={nativeIcon} alt="" style={{ width: 16, height: 16, flexShrink: 0 }} draggable={false} />
      ) : (
        <span style={{ color: iconColor(entry.file_type, entry.name), flexShrink: 0 }}>
          <FileTypeIcon fileType={entry.file_type} size={16} fileName={entry.name} />
        </span>
      )}
      {/* 이름 */}
      {isRenaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onClick={e => e.stopPropagation()}
          className="flex-1 min-w-0 text-xs px-1 rounded outline-none"
          style={{ backgroundColor: themeVars?.surface2, color: themeVars?.text, border: `1px solid ${themeVars?.accent}` }}
        />
      ) : (
        <span className="flex-1 min-w-0 text-xs truncate" style={{ color: themeVars?.text }}>
          {entry.name}
        </span>
      )}
    </div>
  );
});

// --- DetailsRow 컴포넌트 ---
const DetailsRow = memo(function DetailsRow({ entry, isSelected, isFocused, isRenaming, isCut, isDropTarget, onDragMouseDown, onSelect, onOpen, onContextMenu, onRenameCommit, themeVars }: {
  entry: FileEntry;
  isSelected: boolean;
  isFocused: boolean;
  isRenaming: boolean;
  isCut: boolean;
  isDropTarget: boolean;
  onDragMouseDown: (e: React.MouseEvent, entryPath: string) => void;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  themeVars: ThemeVars | null;
}) {
  const nativeIcon = useNativeIcon(entry, 14);
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
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  const bg = isSelected ? themeVars?.accent20 : isFocused ? themeVars?.surfaceHover : 'transparent';
  const outline = isDropTarget ? `2px solid ${themeVars?.accent ?? '#3b82f6'}` : undefined;

  return (
    <tr
      data-file-path={entry.path}
      {...(entry.is_dir ? { 'data-folder-drop-target': entry.path } : {})}
      style={{ backgroundColor: bg ?? undefined, opacity: isCut ? 0.4 : 1, outline }}
      className="cursor-pointer hover:opacity-80"
      title={formatTooltip(entry)}
      onClick={(e) => { e.stopPropagation(); onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey); }}
      onDoubleClick={() => onOpen(entry)}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e, [entry.path]); }}
      onMouseDown={(e) => onDragMouseDown(e, entry.path)}
    >
      <td className="px-3 py-1">
        <div className="flex items-center gap-2">
          {/* 아이콘 (네이티브 우선, lucide 폴백) */}
          {nativeIcon ? (
            <img src={nativeIcon} alt="" style={{ width: 14, height: 14, flexShrink: 0 }} draggable={false} />
          ) : (
            <span style={{ color: iconColor(entry.file_type, entry.name), flexShrink: 0 }}>
              <FileTypeIcon fileType={entry.file_type} size={14} fileName={entry.name} />
            </span>
          )}
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              onClick={e => e.stopPropagation()}
              className="flex-1 min-w-0 px-1 rounded outline-none"
              style={{ backgroundColor: themeVars?.surface2, color: themeVars?.text, border: `1px solid ${themeVars?.accent}` }}
            />
          ) : (
            <span className="truncate text-xs" style={{ color: themeVars?.text }}>{entry.name}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-1 text-right text-xs" style={{ color: themeVars?.muted }}>
        {formatSize(entry.size, entry.is_dir)}
      </td>
      <td className="px-3 py-1 text-xs" style={{ color: themeVars?.muted }}>{fmtDate(entry.modified)}</td>
      <td className="px-3 py-1 text-xs" style={{ color: themeVars?.muted }}>{typeLabels[entry.file_type] ?? '기타'}</td>
    </tr>
  );
});

// --- DetailsTable 컴포넌트 ---
function DetailsTable({ entries, selectedPaths, focusedIndex, renamingPath, sortBy, clipboard, dropTargetPath, onDragMouseDown, onSelect, onOpen, onContextMenu, onRenameCommit, themeVars }: {
  entries: FileEntry[];
  selectedPaths: string[];
  focusedIndex: number;
  renamingPath: string | null;
  sortBy: string;
  clipboard: ClipboardData | null;
  dropTargetPath: string | null;
  onDragMouseDown: (e: React.MouseEvent, entryPath: string) => void;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  themeVars: ThemeVars | null;
}) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr style={{ backgroundColor: themeVars?.surface2, color: themeVars?.muted }}>
          <th className="text-left px-3 py-1.5 font-medium">이름</th>
          <th className="text-right px-3 py-1.5 font-medium w-20">크기</th>
          <th className="text-left px-3 py-1.5 font-medium w-28">날짜</th>
          <th className="text-left px-3 py-1.5 font-medium w-16">형식</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, idx) => {
          const prevType = idx > 0 ? entries[idx - 1].file_type : null;
          const showSep = sortBy === 'type' && idx > 0 && entry.file_type !== prevType;
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
              onDragMouseDown={onDragMouseDown}
              onSelect={onSelect}
              onOpen={onOpen}
              onContextMenu={onContextMenu}
              onRenameCommit={onRenameCommit}
              themeVars={themeVars}
            />
          </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// --- 메인 FileGrid 컴포넌트 ---
export default function FileGrid({
  entries,
  selectedPaths,
  clipboard,
  renamingPath,
  thumbnailSize,
  viewMode,
  sortBy,
  focusedIndex,
  gridRef,
  loading,
  error,
  dropTargetPath,
  onDragMouseDown,
  onSelect,
  onDeselectAll,
  onOpen,
  onContextMenu,
  onRenameCommit,
  themeVars,
}: FileGridProps) {
  // 컨테이너 클릭 시 선택 해제 (파일 요소가 아닌 경우)
  const handleContainerClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-file-path]')) return;
    onDeselectAll();
  };

  // 로딩 상태
  if (loading) {
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

  // 빈 폴더 상태
  if (entries.length === 0) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-2 select-none"
        style={{ color: themeVars?.muted ?? '#94a3b8' }}
        onClick={handleContainerClick}
      >
        <div className="text-4xl opacity-30">📂</div>
        <p className="text-xs">폴더가 비어 있습니다</p>
      </div>
    );
  }

  return (
    <div
      ref={gridRef}
      className="flex-1 overflow-y-auto p-3"
      style={{ backgroundColor: themeVars?.bg ?? '#0f172a' }}
      onClick={handleContainerClick}
    >
      {/* 그리드 뷰 */}
      {viewMode === 'grid' && (
        <div className="flex flex-wrap gap-2 content-start">
          {entries.map((entry, idx) => {
            // 타입별 정렬 시 종류가 바뀌는 지점에 구분선 삽입
            const prevType = idx > 0 ? entries[idx - 1].file_type : null;
            const showSep = sortBy === 'type' && idx > 0 && entry.file_type !== prevType;
            return (
              <React.Fragment key={entry.path}>
                {showSep && (
                  <div className="w-full my-1 px-1">
                    <div className="border-t" style={{ borderColor: themeVars?.border ?? '#334155' }} />
                  </div>
                )}
                <FileCard
                  entry={entry}
                  isSelected={selectedPaths.includes(entry.path)}
                  isFocused={focusedIndex === idx}
                  isRenaming={renamingPath === entry.path}
                  isCut={clipboard?.action === 'cut' && clipboard.paths.includes(entry.path)}
                  isDropTarget={dropTargetPath === entry.path && entry.is_dir}
                  thumbnailSize={thumbnailSize}
                  onDragMouseDown={onDragMouseDown}
                  onSelect={onSelect}
                  onOpen={onOpen}
                  onContextMenu={onContextMenu}
                  onRenameCommit={onRenameCommit}
                  themeVars={themeVars}
                />
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* 리스트 뷰 */}
      {viewMode === 'list' && (
        <div className="flex flex-col gap-0.5">
          {entries.map((entry, idx) => {
            const prevType = idx > 0 ? entries[idx - 1].file_type : null;
            const showSep = sortBy === 'type' && idx > 0 && entry.file_type !== prevType;
            return (
              <React.Fragment key={entry.path}>
                {showSep && (
                  <div className="my-1 px-2">
                    <div className="border-t" style={{ borderColor: themeVars?.border ?? '#334155' }} />
                  </div>
                )}
                <ListRow
                  entry={entry}
                  isSelected={selectedPaths.includes(entry.path)}
                  isFocused={focusedIndex === idx}
                  isRenaming={renamingPath === entry.path}
                  isCut={clipboard?.action === 'cut' && clipboard.paths.includes(entry.path)}
                  isDropTarget={dropTargetPath === entry.path && entry.is_dir}
                  onDragMouseDown={onDragMouseDown}
                  onSelect={onSelect}
                  onOpen={onOpen}
                  onContextMenu={onContextMenu}
                  onRenameCommit={onRenameCommit}
                  themeVars={themeVars}
                />
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* 세부사항 뷰 */}
      {viewMode === 'details' && (
        <DetailsTable
          entries={entries}
          selectedPaths={selectedPaths}
          focusedIndex={focusedIndex}
          renamingPath={renamingPath}
          sortBy={sortBy}
          clipboard={clipboard}
          dropTargetPath={dropTargetPath}
          onDragMouseDown={onDragMouseDown}
          onSelect={onSelect}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
          onRenameCommit={onRenameCommit}
          themeVars={themeVars}
        />
      )}
    </div>
  );
}
