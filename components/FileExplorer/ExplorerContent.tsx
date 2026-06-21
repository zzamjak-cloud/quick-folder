import React from 'react';
import type { ClipboardData, FileEntry, ThumbnailSize, ViewMode } from '../../types';
import type { Tab, ThemeVars } from './types';
import type { useColumnView } from './hooks/useColumnView';
import ColumnView from './ColumnView';
import FileGrid from './FileGrid';
import NavigationBar from './NavigationBar';
import StatusBar from './StatusBar';
import TabBar from './TabBar';

type SortBy = 'name' | 'size' | 'modified' | 'type';
type SortDir = 'asc' | 'desc';
type SplitMode = 'single' | 'horizontal' | 'vertical';
type ColumnViewState = ReturnType<typeof useColumnView>;

interface ExplorerContentProps {
  tabs: Tab[];
  activeTabId: string;
  instanceId: string;
  folderTags: Record<string, string>;
  themeVars: ThemeVars | null;
  currentPath: string | null;
  splitMode?: SplitMode;
  onSplitModeChange?: (mode: SplitMode, options?: { closingInstanceId?: string; closedPaths?: string[] }) => void;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabReorder: (fromIndex: number, toIndex: number) => void;
  onTabReceive: (tab: Tab, insertIndex: number) => void;
  onTabRemove: (tabId: string) => void;
  onTogglePin: (tabId: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onNavigate: (path: string) => void;
  onCreateDirectory: () => void;
  sortBy: SortBy;
  sortDir: SortDir;
  onSortChange: (by: SortBy, dir: SortDir) => void;
  thumbnailSize: ThumbnailSize;
  onThumbnailSizeChange: (size: ThumbnailSize) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  isSearchActive: boolean;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSearchToggle: () => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  activeExtFilters: Set<string>;
  availableExtensions: Set<string>;
  onExtFilterToggle: (ext: string) => void;
  onExtFilterClear: () => void;
  hideText: boolean;
  onHideTextToggle: () => void;
  columnView: ColumnViewState;
  selectedPaths: string[];
  renamingPath: string | null;
  loading: boolean;
  error: string | null;
  onColumnSelect: (colIndex: number, entry: FileEntry, multi: boolean, range: boolean) => void;
  onOpenEntry: (entry: FileEntry) => void;
  onContextMenu: (event: React.MouseEvent, paths: string[]) => void;
  onDragMouseDown: (event: React.MouseEvent, entryPath: string) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  displayEntries: FileEntry[];
  clipboard: ClipboardData | null;
  focusedIndex: number;
  gridRef: React.RefObject<HTMLDivElement | null>;
  dropTargetPath: string | null;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onSelectPaths: (paths: string[]) => void;
  onDeselectAll: () => void;
  onOpenInNewTab: (entry: FileEntry) => void;
  onHoverFolder: (path: string) => void;
  onGridSortChange: (by: string) => void;
  pendingCopyPaths: Set<string>;
  draggedPaths: Set<string>;
  isDraggingNow: boolean;
  fuzzyMatchIndices: Map<string, number[]>;
  isFuzzyFiltering: boolean;
  fuzzyMatchCount: number;
  onFuzzyFilterClear: () => void;
  onFilterInputFocus: () => void;
  videoCompression: {
    fileName: string;
    percent: number;
    speed?: string;
    current?: number;
    total?: number;
  } | null;
  gsSetup: { fileName: string } | null;
}

export default function ExplorerContent({
  tabs,
  activeTabId,
  instanceId,
  folderTags,
  themeVars,
  currentPath,
  splitMode,
  onSplitModeChange,
  onTabSelect,
  onTabClose,
  onTabReorder,
  onTabReceive,
  onTabRemove,
  onTogglePin,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onUp,
  onNavigate,
  onCreateDirectory,
  sortBy,
  sortDir,
  onSortChange,
  thumbnailSize,
  onThumbnailSizeChange,
  viewMode,
  onViewModeChange,
  isSearchActive,
  searchQuery,
  onSearchQueryChange,
  onSearchToggle,
  searchInputRef,
  activeExtFilters,
  availableExtensions,
  onExtFilterToggle,
  onExtFilterClear,
  hideText,
  onHideTextToggle,
  columnView,
  selectedPaths,
  renamingPath,
  loading,
  error,
  onColumnSelect,
  onOpenEntry,
  onContextMenu,
  onDragMouseDown,
  onRenameCommit,
  displayEntries,
  clipboard,
  focusedIndex,
  gridRef,
  dropTargetPath,
  onSelect,
  onSelectPaths,
  onDeselectAll,
  onOpenInNewTab,
  onHoverFolder,
  onGridSortChange,
  pendingCopyPaths,
  draggedPaths,
  isDraggingNow,
  fuzzyMatchIndices,
  isFuzzyFiltering,
  fuzzyMatchCount,
  onFuzzyFilterClear,
  onFilterInputFocus,
  videoCompression,
  gsSetup,
}: ExplorerContentProps) {
  return (
    <>
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={onTabSelect}
        onTabClose={onTabClose}
        onTabReorder={onTabReorder}
        onTabReceive={onTabReceive}
        onTabRemove={onTabRemove}
        onTogglePin={onTogglePin}
        instanceId={instanceId}
        themeVars={themeVars}
        folderTags={folderTags}
      />

      {currentPath ? (
        <>
          <NavigationBar
            currentPath={currentPath}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onBack={onBack}
            onForward={onForward}
            onUp={onUp}
            onNavigate={onNavigate}
            onCreateDirectory={onCreateDirectory}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={onSortChange}
            thumbnailSize={thumbnailSize}
            onThumbnailSizeChange={onThumbnailSizeChange}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            isSearchActive={isSearchActive}
            searchQuery={searchQuery}
            onSearchQueryChange={onSearchQueryChange}
            onSearchToggle={onSearchToggle}
            searchInputRef={searchInputRef}
            activeExtFilters={activeExtFilters}
            availableExtensions={availableExtensions}
            onExtFilterToggle={onExtFilterToggle}
            onExtFilterClear={onExtFilterClear}
            hideText={hideText}
            onHideTextToggle={onHideTextToggle}
            splitMode={splitMode}
            onSplitModeChange={onSplitModeChange}
            themeVars={themeVars}
          />

          {viewMode === 'columns' ? (
            <ColumnView
              columns={columnView.columns}
              preview={columnView.preview}
              focusedCol={columnView.focusedCol}
              focusedRow={columnView.focusedRow}
              selectedPaths={selectedPaths}
              renamingPath={renamingPath}
              loading={loading}
              error={error}
              themeVars={themeVars}
              instanceId={instanceId}
              currentPath={currentPath}
              onSelectInColumn={onColumnSelect}
              onOpenEntry={onOpenEntry}
              onContextMenu={onContextMenu}
              onDragMouseDown={onDragMouseDown}
              onRenameCommit={onRenameCommit}
            />
          ) : (
            <FileGrid
              entries={displayEntries}
              selectedPaths={selectedPaths}
              clipboard={clipboard}
              renamingPath={renamingPath}
              thumbnailSize={thumbnailSize}
              viewMode={viewMode}
              sortBy={sortBy}
              sortDir={sortDir}
              focusedIndex={focusedIndex}
              gridRef={gridRef}
              currentPath={currentPath}
              loading={loading}
              error={error}
              dropTargetPath={dropTargetPath}
              onDragMouseDown={onDragMouseDown}
              onSelect={onSelect}
              onSelectPaths={onSelectPaths}
              onDeselectAll={onDeselectAll}
              onOpen={onOpenEntry}
              onOpenInNewTab={onOpenInNewTab}
              onContextMenu={onContextMenu}
              onRenameCommit={onRenameCommit}
              onHoverFolder={onHoverFolder}
              onSortChange={onGridSortChange}
              themeVars={themeVars}
              hideText={hideText}
              folderTags={folderTags}
              instanceId={instanceId}
              pendingCopyPaths={pendingCopyPaths}
              draggedPaths={draggedPaths}
              isDraggingNow={isDraggingNow}
              fuzzyMatchIndices={fuzzyMatchIndices}
              isFuzzyFiltering={isFuzzyFiltering}
              fuzzyQuery={searchQuery}
              fuzzyMatchCount={fuzzyMatchCount}
              onFuzzyFilterClear={onFuzzyFilterClear}
              onFilterInputFocus={onFilterInputFocus}
            />
          )}

          {videoCompression && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 text-xs"
              style={{ backgroundColor: 'var(--qf-surface-2)', color: 'var(--qf-text)', borderTop: '1px solid var(--qf-border)' }}
            >
              <span className="shrink-0">
                🎬 압축 중... {videoCompression.total && videoCompression.total > 1
                  ? `${videoCompression.current}/${videoCompression.total}개 `
                  : ''}
                {videoCompression.fileName}
              </span>
              <span className="text-[var(--qf-muted)]">
                ({Math.floor(videoCompression.percent)}초{videoCompression.speed ? ` · ${videoCompression.speed}` : ''})
              </span>
            </div>
          )}

          {gsSetup && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 text-xs"
              style={{ backgroundColor: 'var(--qf-surface-2)', color: 'var(--qf-text)', borderTop: '1px solid var(--qf-border)' }}
            >
              <span>⏳ Ghostscript 다운로드/설치 중... {gsSetup.fileName}</span>
            </div>
          )}

          <StatusBar
            entries={displayEntries}
            selectedPaths={selectedPaths}
            themeVars={themeVars}
          />
        </>
      ) : (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-3"
          style={{ color: themeVars?.muted ?? '#94a3b8' }}
        >
          <div className="text-5xl opacity-30">📁</div>
          <p className="text-sm">왼쪽 즐겨찾기에서 폴더를 클릭하면 여기에 파일 목록이 표시됩니다</p>
        </div>
      )}
    </>
  );
}
