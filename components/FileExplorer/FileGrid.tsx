import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { FileEntry, ThumbnailSize } from '../../types';
import { ThemeVars } from './types';
import { FileTypeIcon, iconColor, formatSize } from './fileUtils';
import FileCard from './FileCard';

interface FileGridProps {
  entries: FileEntry[];
  selectedPaths: string[];
  renamingPath: string | null;
  thumbnailSize: ThumbnailSize;
  viewMode: 'grid' | 'list' | 'details';
  focusedIndex: number;
  gridRef: React.RefObject<HTMLDivElement>;
  loading: boolean;
  error: string | null;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  themeVars: ThemeVars | null;
}

// --- ListRow 컴포넌트 ---
function ListRow({ entry, isSelected, isFocused, isRenaming, onSelect, onOpen, onContextMenu, onRenameCommit, themeVars }: {
  entry: FileEntry; isSelected: boolean; isFocused: boolean; isRenaming: boolean;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  themeVars: ThemeVars | null;
}) {
  const [renameValue, setRenameValue] = useState(entry.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setRenameValue(entry.name); }, [entry.name]);
  useEffect(() => {
    if (isRenaming && inputRef.current) { inputRef.current.select(); }
  }, [isRenaming]);

  const bg = isSelected
    ? (themeVars?.accent20 ?? 'rgba(59,130,246,0.2)')
    : isFocused ? (themeVars?.surfaceHover ?? '#334155') : 'transparent';

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer select-none"
      style={{ backgroundColor: bg }}
      onClick={(e) => onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey)}
      onDoubleClick={() => onOpen(entry)}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e, [entry.path]); }}
    >
      {/* 아이콘 */}
      <span style={{ color: iconColor(entry.file_type), flexShrink: 0 }}>
        <FileTypeIcon fileType={entry.file_type} size={16} />
      </span>
      {/* 이름 */}
      {isRenaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onRenameCommit(entry.path, renameValue);
            if (e.key === 'Escape') onRenameCommit(entry.path, entry.name);
          }}
          onBlur={() => onRenameCommit(entry.path, renameValue)}
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
}

// --- DetailsRow 컴포넌트 (상태를 포함하므로 별도 컴포넌트로 분리) ---
function DetailsRow({ entry, isSelected, isFocused, isRenaming, onSelect, onOpen, onContextMenu, onRenameCommit, themeVars }: {
  entry: FileEntry; isSelected: boolean; isFocused: boolean; isRenaming: boolean;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  themeVars: ThemeVars | null;
}) {
  const [renameValue, setRenameValue] = useState(entry.name);

  useEffect(() => { setRenameValue(entry.name); }, [entry.name]);

  const typeLabels: Record<string, string> = {
    directory: '폴더', image: '이미지', video: '비디오',
    document: '문서', code: '코드', archive: '압축', other: '기타',
  };

  function fmtDate(ms: number) {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  const bg = isSelected ? themeVars?.accent20 : isFocused ? themeVars?.surfaceHover : 'transparent';

  return (
    <tr
      style={{ backgroundColor: bg ?? undefined }}
      className="cursor-pointer hover:opacity-80"
      onClick={(e) => onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey)}
      onDoubleClick={() => onOpen(entry)}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e, [entry.path]); }}
    >
      <td className="px-3 py-1">
        <div className="flex items-center gap-2">
          <span style={{ color: iconColor(entry.file_type), flexShrink: 0 }}>
            <FileTypeIcon fileType={entry.file_type} size={14} />
          </span>
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onRenameCommit(entry.path, renameValue);
                if (e.key === 'Escape') onRenameCommit(entry.path, entry.name);
              }}
              onBlur={() => onRenameCommit(entry.path, renameValue)}
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
}

// --- DetailsTable 컴포넌트 ---
function DetailsTable({ entries, selectedPaths, focusedIndex, renamingPath, onSelect, onOpen, onContextMenu, onRenameCommit, themeVars }: {
  entries: FileEntry[]; selectedPaths: string[]; focusedIndex: number; renamingPath: string | null;
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
        {entries.map((entry, idx) => (
          <React.Fragment key={entry.path}>
            <DetailsRow
              entry={entry}
              isSelected={selectedPaths.includes(entry.path)}
              isFocused={focusedIndex === idx}
              isRenaming={renamingPath === entry.path}
              onSelect={onSelect}
              onOpen={onOpen}
              onContextMenu={onContextMenu}
              onRenameCommit={onRenameCommit}
              themeVars={themeVars}
            />
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}

// --- 메인 FileGrid 컴포넌트 ---
export default function FileGrid({
  entries,
  selectedPaths,
  renamingPath,
  thumbnailSize,
  viewMode,
  focusedIndex,
  gridRef,
  loading,
  error,
  onSelect,
  onOpen,
  onContextMenu,
  onRenameCommit,
  themeVars,
}: FileGridProps) {
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
    >
      {/* 그리드 뷰 */}
      {viewMode === 'grid' && (
        <div className="flex flex-wrap gap-2 content-start">
          {entries.map((entry, idx) => (
            <React.Fragment key={entry.path}>
              <FileCard
                entry={entry}
                isSelected={selectedPaths.includes(entry.path)}
                isFocused={focusedIndex === idx}
                isRenaming={renamingPath === entry.path}
                thumbnailSize={thumbnailSize}
                dragPaths={
                  selectedPaths.includes(entry.path) && selectedPaths.length > 1
                    ? selectedPaths
                    : [entry.path]
                }
                onSelect={onSelect}
                onOpen={onOpen}
                onContextMenu={onContextMenu}
                onRenameCommit={onRenameCommit}
                themeVars={themeVars}
              />
            </React.Fragment>
          ))}
        </div>
      )}

      {/* 리스트 뷰 */}
      {viewMode === 'list' && (
        <div className="flex flex-col gap-0.5">
          {entries.map((entry, idx) => (
            <React.Fragment key={entry.path}>
              <ListRow
                entry={entry}
                isSelected={selectedPaths.includes(entry.path)}
                isFocused={focusedIndex === idx}
                isRenaming={renamingPath === entry.path}
                onSelect={onSelect}
                onOpen={onOpen}
                onContextMenu={onContextMenu}
                onRenameCommit={onRenameCommit}
                themeVars={themeVars}
              />
            </React.Fragment>
          ))}
        </div>
      )}

      {/* 세부사항 뷰 */}
      {viewMode === 'details' && (
        <DetailsTable
          entries={entries}
          selectedPaths={selectedPaths}
          focusedIndex={focusedIndex}
          renamingPath={renamingPath}
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
