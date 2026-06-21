import React, { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { FileEntry, ThumbnailSize, ClipboardData, ViewMode } from '../../types';
import { ThemeVars } from './types';
import { normalizeFsPath } from '../../utils/pathUtils';
import FileCard from './FileCard';
import InlineFuzzyFilterBar from './InlineFuzzyFilterBar';
import { createScrollStorageKey, usePersistentScroll } from './hooks/usePersistentScroll';
import { DetailsTable, ListRow } from './fileGrid/FileGridRows';

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
  currentPath: string;
  loading: boolean;
  error: string | null;
  dropTargetPath: string | null;
  onDragMouseDown: (e: React.MouseEvent, entryPath: string) => void;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onSelectPaths: (paths: string[]) => void;
  onDeselectAll: () => void;
  onOpen: (entry: FileEntry) => void;
  onOpenInNewTab?: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  onSortChange?: (by: string) => void;
  onHoverFolder?: (path: string) => void;
  themeVars: ThemeVars | null;
  hideText?: boolean;
  folderTags?: Record<string, string>;
  instanceId?: string;
  pendingCopyPaths?: Set<string>;
  draggedPaths?: Set<string>;
  isDraggingNow?: boolean;
  fuzzyMatchIndices?: Map<string, number[]>;
  isFuzzyFiltering?: boolean;
  fuzzyQuery?: string;
  fuzzyMatchCount?: number;
  onFuzzyFilterClear?: () => void;
  onFilterInputFocus?: () => void;
}

// content-visibility 최적화를 켜는 항목 수 임계치 (이하에서는 오버헤드 회피)
const CV_THRESHOLD = 150;

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
  currentPath,
  loading,
  error,
  dropTargetPath,
  onDragMouseDown,
  onSelect,
  onSelectPaths,
  onDeselectAll,
  onOpen,
  onOpenInNewTab,
  onContextMenu,
  onRenameCommit,
  onSortChange,
  onHoverFolder,
  themeVars,
  hideText = false,
  folderTags,
  instanceId,
  pendingCopyPaths,
  draggedPaths,
  isDraggingNow = false,
  fuzzyMatchIndices,
  isFuzzyFiltering = false,
  fuzzyQuery = '',
  fuzzyMatchCount = 0,
  onFuzzyFilterClear,
  onFilterInputFocus,
}: FileGridProps) {
  const isFuzzyNonMatch = useCallback(
    (path: string) => isFuzzyFiltering && !fuzzyMatchIndices?.has(path),
    [isFuzzyFiltering, fuzzyMatchIndices],
  );
  // 대용량 폴더에서만 content-visibility 활성화
  const cvEnabled = entries.length > CV_THRESHOLD;
  const scrollStorageKey = useMemo(
    () => currentPath ? createScrollStorageKey('file-grid', instanceId ?? 'default', viewMode, currentPath) : null,
    [currentPath, instanceId, viewMode],
  );
  const { handleScroll } = usePersistentScroll(gridRef, scrollStorageKey, [entries.length, viewMode]);

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
  // NOTE: 간헐적으로 mouse release 후 박스가 유지되는 버그 대응:
  //   - mouseup이 어떤 이유로 누락될 때를 대비해 mouseleave/blur/visibilitychange/contextmenu/Escape에서도 강제 종료
  //   - mousemove에서도 e.buttons===0이면 (어떤 이유든 마우스가 이미 떼어진 상태) 즉시 종료
  useEffect(() => {
    const endDrag = () => {
      if (!dragState.current) return;
      dragState.current = null;
      setSelectionBox(null);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const state = dragState.current;
      if (!state) return;

      // 안전장치: 브라우저가 mouseup을 누락한 경우 buttons 비트마스크로 감지하여 종료
      // (e.buttons === 0 → 모든 버튼이 떼어진 상태)
      if (e.buttons === 0) {
        endDrag();
        return;
      }

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

    const handleMouseUp = () => endDrag();
    const handleBlur = () => endDrag();
    const handleVisibility = () => { if (document.hidden) endDrag(); };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') endDrag(); };
    // 마우스가 윈도우 밖으로 나갔다가 돌아오지 못한 채 release된 경우 대응
    const handleDocLeave = (e: MouseEvent) => {
      // relatedTarget 이 null이면 윈도우 밖으로 나간 상태
      if (!e.relatedTarget && !(e as any).toElement) endDrag();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp, true);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('keydown', handleKey, true);
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('mouseleave', handleDocLeave);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp, true);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('keydown', handleKey, true);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('mouseleave', handleDocLeave);
    };
  }, [gridRef]);

  // 빈 영역 mousedown → 박스 드래그 시작
  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-file-path]')) return;
    if (e.button !== 0) return; // 왼쪽 버튼만
    // 이전 드래그가 잔존해있다면 먼저 정리 (이중 시작 방지)
    if (dragState.current) {
      dragState.current = null;
      setSelectionBox(null);
    }
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
      className="qf-scrollable flex-1 overflow-y-auto p-3 relative"
      style={{ backgroundColor: themeVars?.bg ?? '#0f172a' }}
      onClick={handleContainerClick}
      onContextMenu={handleContainerContextMenu}
      onMouseDown={handleContainerMouseDown}
      onPointerDownCapture={() => onFilterInputFocus?.()}
      onScroll={handleScroll}
    >
      {isFuzzyFiltering && fuzzyQuery && onFuzzyFilterClear && (
        <InlineFuzzyFilterBar
          query={fuzzyQuery}
          matchCount={fuzzyMatchCount}
          themeVars={themeVars}
          onClear={onFuzzyFilterClear}
        />
      )}
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
            // 타입별 정렬 시 확장자가 바뀌는 지점에 구분선 삽입
            const getExtKey = (e: FileEntry) => e.is_dir ? 'folder' : (e.name.includes('.') ? e.name.slice(e.name.lastIndexOf('.') + 1).toLowerCase() : '');
            const prevExt = idx > 0 ? getExtKey(entries[idx - 1]) : null;
            const showSep = sortBy === 'type' && idx > 0 && getExtKey(entry) !== prevExt;
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
                  fuzzyHighlightIndices={fuzzyMatchIndices?.get(entry.path)}
                  thumbnailSize={thumbnailSize}
                  onDragMouseDown={onDragMouseDown}
                  onSelect={onSelect}
                  onOpen={onOpen}
                  onOpenInNewTab={onOpenInNewTab}
                  onContextMenu={onContextMenu}
                  onRenameCommit={onRenameCommit}
                  onHoverFolder={onHoverFolder}
                  themeVars={themeVars}
                  hideText={hideText}
                  tag={folderTags?.[entry.path]}
                  isPending={pendingCopyPaths?.has(normalizeFsPath(entry.path))}
                  isDimmed={(isDraggingNow && !!draggedPaths?.has(entry.path)) || isFuzzyNonMatch(entry.path)}
                  cvEnabled={cvEnabled}
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
            const getExtKey = (e: FileEntry) => e.is_dir ? 'folder' : (e.name.includes('.') ? e.name.slice(e.name.lastIndexOf('.') + 1).toLowerCase() : '');
            const prevExt = idx > 0 ? getExtKey(entries[idx - 1]) : null;
            const showSep = sortBy === 'type' && idx > 0 && getExtKey(entry) !== prevExt;
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
                  isPending={pendingCopyPaths?.has(normalizeFsPath(entry.path))}
                  isDimmed={(isDraggingNow && !!draggedPaths?.has(entry.path)) || isFuzzyNonMatch(entry.path)}
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
        </div>
      )}

      {/* 세부사항 뷰 */}
      {viewMode === 'details' && (
        <DetailsTable
          entries={entries}
          cvEnabled={cvEnabled}
          onHoverFolder={onHoverFolder}
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
          onOpenInNewTab={onOpenInNewTab}
          onContextMenu={onContextMenu}
          onRenameCommit={onRenameCommit}
          onSortChange={onSortChange}
          themeVars={themeVars}
          instanceId={instanceId}
          pendingCopyPaths={pendingCopyPaths}
          draggedPaths={draggedPaths}
          isDraggingNow={isDraggingNow}
          fuzzyMatchIndices={fuzzyMatchIndices}
          isFuzzyNonMatch={isFuzzyNonMatch}
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
