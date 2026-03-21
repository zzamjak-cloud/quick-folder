import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { FileEntry, ThumbnailSize, ClipboardData, ViewMode } from '../../types';
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
  viewMode: ViewMode;
  sortBy: 'name' | 'size' | 'modified' | 'type';
  sortDir: 'asc' | 'desc';
  focusedIndex: number;
  gridRef: React.RefObject<HTMLDivElement>;
  loading: boolean;
  error: string | null;
  dropTargetPath: string | null;
  onDragMouseDown: (e: React.MouseEvent, entryPath: string) => void;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onSelectPaths: (paths: string[]) => void;
  onDeselectAll: () => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  onSortChange?: (by: string) => void;
  themeVars: ThemeVars | null;
  hideText?: boolean;
  folderTags?: Record<string, string>;
  instanceId?: string;
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
      onMouseDown={(e) => { e.stopPropagation(); onDragMouseDown(e, entry.path); }}
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
      onMouseDown={(e) => { e.stopPropagation(); onDragMouseDown(e, entry.path); }}
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
      <td className="px-3 py-1 text-xs" style={{ color: themeVars?.muted }}>{fmtDate(entry.modified)}</td>
      <td className="px-3 py-1 text-right text-xs" style={{ color: themeVars?.muted }}>
        {formatSize(entry.size, entry.is_dir)}
      </td>
      <td className="px-3 py-1 text-xs" style={{ color: themeVars?.muted }}>{typeLabels[entry.file_type] ?? '기타'}</td>
    </tr>
  );
});

// --- DetailsTable 컴포넌트 ---
function DetailsTable({ entries, selectedPaths, focusedIndex, renamingPath, sortBy, sortDir, clipboard, dropTargetPath, onDragMouseDown, onSelect, onOpen, onContextMenu, onRenameCommit, onSortChange, themeVars, instanceId }: {
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
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  onSortChange?: (by: string) => void;
  themeVars: ThemeVars | null;
  instanceId?: string;
}) {
  const storageKey = `qf_details_cols_${instanceId ?? 'default'}`;

  // 컬럼 너비 상태 — localStorage에서 복원
  const [colWidths, setColWidths] = useState<{ name: number; modified: number; size: number; type: number }>(() => {
    const defaults = { name: 0, modified: 140, size: 80, type: 70 }; // name=0: auto
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return { ...defaults, ...JSON.parse(saved) };
    } catch { /* 무시 */ }
    return defaults;
  });
  const resizingRef = useRef<{ col: keyof typeof colWidths; startX: number; startW: number } | null>(null);
  // 사용자가 이름 컬럼 너비를 수동 조정했는지 여부
  const nameManuallyResized = colWidths.name > 0;

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const delta = e.clientX - r.startX;
      setColWidths(prev => {
        const minW = r.col === 'name' ? 100 : 50;
        const baseW = r.col === 'name' && r.startW === 0 ? 200 : r.startW; // auto → 기본 200 기준
        return { ...prev, [r.col]: Math.max(minW, baseW + delta) };
      });
    };
    const onUp = () => {
      if (resizingRef.current) {
        resizingRef.current = null;
        // 리사이즈 완료 시 localStorage 저장
        setColWidths(prev => {
          localStorage.setItem(storageKey, JSON.stringify(prev));
          return prev;
        });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
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
              {/* 리사이즈 핸들 — 넓은 투명 영역(8px)으로 잡기 쉽게 */}
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
export default memo(function FileGrid({
  entries,
  selectedPaths,
  clipboard,
  renamingPath,
  thumbnailSize,
  viewMode,
  sortBy,
  sortDir,
  focusedIndex,
  gridRef,
  loading,
  error,
  dropTargetPath,
  onDragMouseDown,
  onSelect,
  onSelectPaths,
  onDeselectAll,
  onOpen,
  onContextMenu,
  onRenameCommit,
  onSortChange,
  themeVars,
  hideText = false,
  folderTags,
  instanceId,
}: FileGridProps) {

  // --- 박스 드래그 선택 ---
  const dragState = useRef<{
    origin: { x: number; y: number };
    isActive: boolean;
    ctrlHeld: boolean;
    prevSelection: string[];
  } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{
    left: number; top: number; width: number; height: number;
  } | null>(null);
  const skipNextClick = useRef(false);

  // 콜백 ref (이벤트 핸들러에서 최신 값 접근)
  const onSelectPathsRef = useRef(onSelectPaths);
  onSelectPathsRef.current = onSelectPaths;

  // 박스 드래그 window 이벤트 리스너
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = dragState.current;
      if (!state) return;

      const dx = e.clientX - state.origin.x;
      const dy = e.clientY - state.origin.y;
      // 5px 이상 이동해야 박스 드래그로 인식
      if (!state.isActive && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

      state.isActive = true;
      skipNextClick.current = true;

      const left = Math.min(state.origin.x, e.clientX);
      const top = Math.min(state.origin.y, e.clientY);
      const width = Math.abs(dx);
      const height = Math.abs(dy);
      setSelectionBox({ left, top, width, height });

      // 파일 카드와 교차 판정 (일부만 겹쳐도 선택)
      const container = gridRef.current;
      if (!container) return;
      const fileElements = container.querySelectorAll('[data-file-path]');
      const intersected: string[] = [];
      fileElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.right > left && rect.left < left + width &&
            rect.bottom > top && rect.top < top + height) {
          const path = el.getAttribute('data-file-path');
          if (path) intersected.push(path);
        }
      });

      // Ctrl 누른 채 드래그 시 기존 선택에 추가
      const newSelection = state.ctrlHeld
        ? [...new Set([...state.prevSelection, ...intersected])]
        : intersected;
      onSelectPathsRef.current(newSelection);
    };

    const handleMouseUp = () => {
      if (!dragState.current) return;
      dragState.current = null;
      setSelectionBox(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [gridRef]);

  // 빈 영역 mousedown → 박스 드래그 시작
  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-file-path]')) return;
    if (e.button !== 0) return; // 왼쪽 버튼만
    dragState.current = {
      origin: { x: e.clientX, y: e.clientY },
      isActive: false,
      ctrlHeld: e.ctrlKey || e.metaKey,
      prevSelection: (e.ctrlKey || e.metaKey) ? selectedPaths : [],
    };
    skipNextClick.current = false;
  }, [selectedPaths]);

  // 컨테이너 빈 공간 우클릭 시 빈 paths로 컨텍스트 메뉴 호출
  const handleContainerContextMenu = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-file-path]')) return;
    e.preventDefault();
    onContextMenu(e, []);
  }, [onContextMenu]);

  // 컨테이너 클릭 시 선택 해제 (박스 드래그 후에는 스킵)
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (skipNextClick.current) {
      skipNextClick.current = false;
      return;
    }
    if ((e.target as HTMLElement).closest('[data-file-path]')) return;
    onDeselectAll();
  }, [onDeselectAll]);

  // 첫 로드 시 (entries 없음 + 로딩 중) 전체 스피너 표시
  if (loading && entries.length === 0) {
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
        onContextMenu={handleContainerContextMenu}
      >
        <div className="text-4xl opacity-30">📂</div>
        <p className="text-xs">폴더가 비어 있습니다</p>
      </div>
    );
  }

  return (
    <div
      ref={gridRef}
      className="flex-1 overflow-y-auto p-3 relative"
      style={{ backgroundColor: themeVars?.bg ?? '#0f172a' }}
      onClick={handleContainerClick}
      onContextMenu={handleContainerContextMenu}
      onMouseDown={handleContainerMouseDown}
    >
      {/* 백그라운드 로딩 인디케이터 (기존 파일 표시 중 새 디렉토리 로드) */}
      {loading && entries.length > 0 && (
        <div className="absolute top-0 left-0 right-0 z-10 h-0.5 overflow-hidden" style={{ backgroundColor: `${themeVars?.accent ?? '#3b82f6'}20` }}>
          <div className="h-full animate-[loading-bar_1s_ease-in-out_infinite]" style={{ backgroundColor: themeVars?.accent ?? '#3b82f6', width: '40%' }} />
          <style>{`@keyframes loading-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
        </div>
      )}
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
                  hideText={hideText}
                  tag={folderTags?.[entry.path]}
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
          sortDir={sortDir}
          clipboard={clipboard}
          dropTargetPath={dropTargetPath}
          onDragMouseDown={onDragMouseDown}
          onSelect={onSelect}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
          onRenameCommit={onRenameCommit}
          onSortChange={onSortChange}
          themeVars={themeVars}
          instanceId={instanceId}
        />
      )}

      {/* 박스 드래그 선택 시각화 */}
      {selectionBox && (
        <div
          style={{
            position: 'fixed',
            left: selectionBox.left,
            top: selectionBox.top,
            width: selectionBox.width,
            height: selectionBox.height,
            border: `1px solid ${themeVars?.accent ?? '#3b82f6'}`,
            backgroundColor: themeVars?.accent20 ?? 'rgba(59,130,246,0.15)',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        />
      )}
    </div>
  );
});
