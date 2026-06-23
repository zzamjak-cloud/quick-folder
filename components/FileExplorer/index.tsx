import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FileEntry, ClipboardData, ThumbnailSize, ViewMode } from '../../types';
import { ThemeVars, ContextMenuSection } from './types';
import {
  ExternalLink, Folder, Copy, CopyPlus, Scissors, Clipboard as ClipboardIcon,
  Edit2, Trash2, Hash, Star, FileArchive, Eye, Film, Grid3x3, LayoutGrid, Ungroup, Tag,
  FolderPlus, FileText, Image, List, Eraser, Type,
} from 'lucide-react';
import ExplorerContent from './ExplorerContent';
import ExplorerLayout from './ExplorerLayout';
import ExplorerModalBridge from './ExplorerModalBridge';
import { useInternalDragDrop, type PendingDrop } from './hooks/useInternalDragDrop';
import { usePreview } from './hooks/usePreview';
import { useTabManagement } from './hooks/useTabManagement';
import { cancelAllQueued } from './hooks/invokeQueue';
import { runTransferWithProgress } from './hooks/runTransferWithProgress';
import { detectFolderMergeScenario } from '../../utils/folderMerge';
import { useColumnView } from './hooks/useColumnView';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import {
  buildArchiveBrowsePath,
  getArchiveVirtualParent,
  getFileName,
  getFolderSizeChildNavigationTarget,
  getPathSeparator,
  getParentDir,
  isArchiveVirtualPath,
  isBrowsableArchiveFilePath,
  normalizeFsPath,
  sameVolume,
  shouldOpenArchiveInCurrentPane,
} from '../../utils/pathUtils';
import { isTauri } from '../../utils/isTauri';
import { useUndoStack } from './hooks/useUndoStack';
import { useModalStates } from './hooks/useModalStates';
import { useSearchFilter } from './hooks/useSearchFilter';
import { useInlineFuzzyFilter, isFuzzyFilterBlocked } from './hooks/useInlineFuzzyFilter';
import { useClipboard } from './hooks/useClipboard';
import { useFileOperations, type FolderSizeDialogState } from './hooks/useFileOperations';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useContextMenuBuilder } from './hooks/useContextMenuBuilder';
import { useDirectoryLoader } from './hooks/useDirectoryLoader';
import { useExplorerSelection } from './hooks/useExplorerSelection';
import { usePreviewAutoRefresh, usePreviewPrewarm, usePreviewRouting } from './hooks/usePreviewRouting';
import { tauriCommands } from '../../utils/tauriCommands';
import { RECENT_PATH, SYSTEM_ROOT_PATH } from './constants';
import { sortEntries } from './entrySorting';
import {
  readJsonStorage,
  readNumberStorage,
  readStorage,
  storageKeys,
  writeJsonStorage,
  writeNumberStorage,
  writeStorage,
} from '../../utils/storage';

interface FileExplorerProps {
  instanceId?: string;   // 분할 뷰 시 저장소 키 분리용 (기본: 'default')
  isFocused?: boolean;   // 포커스된 패널만 키보드 단축키 응답 (기본: true)
  splitMode?: 'single' | 'horizontal' | 'vertical';
  onSplitModeChange?: (mode: 'single' | 'horizontal' | 'vertical', options?: { closingInstanceId?: string; closedPaths?: string[] }) => void;
  initialPath: string;
  initialPathKey?: number;  // 같은 경로를 다시 요청할 때도 반응하기 위한 키
  onPathChange: (path: string) => void;
  onAddToFavorites: (path: string, name: string) => void;
  onAddToCategory?: (categoryId: string, path: string, name: string) => void;
  themeVars: ThemeVars | null;
  // 분할 뷰에서 클립보드 공유용 (App.tsx에서 상태 관리)
  sharedClipboard?: ClipboardData | null;
  onClipboardChange?: (cb: ClipboardData | null) => void;
  onStageFilesToTray?: (paths: string[]) => void;
  /** 분할 뷰에서 트레이 드롭존 시각화를 App 레벨로 올리기 위한 콜백 */
  onTrayDragStateChange?: (dragging: boolean, trayActive: boolean) => void;
  // 최근항목 조회 시 사용할 즐겨찾기 폴더 경로 목록
  recentRoots?: string[];
}

const THUMBNAIL_SIZES: ThumbnailSize[] = [40, 60, 80, 100, 120, 160, 200, 240, 280, 320];

export default function FileExplorer({
  instanceId = 'default',
  isFocused = true,
  splitMode,
  onSplitModeChange,
  initialPath,
  onPathChange,
  onAddToFavorites,
  onAddToCategory,
  themeVars,
  sharedClipboard,
  onClipboardChange,
  onStageFilesToTray,
  onTrayDragStateChange,
  recentRoots = [],
  initialPathKey = 0,
}: FileExplorerProps) {
  // --- 상태 ---
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);

  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified' | 'type'>(() => {
    const saved = readStorage(storageKeys.explorerSortBy(instanceId));
    return (saved as 'name' | 'size' | 'modified' | 'type') || 'modified';
  });
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => {
    const saved = readStorage(storageKeys.explorerSortDir(instanceId));
    return (saved as 'asc' | 'desc') || 'desc';
  });
  const [thumbnailSize, setThumbnailSize] = useState<ThumbnailSize>(() => {
    const parsed = readNumberStorage(storageKeys.explorerThumbnailSize(instanceId), 120);
    return ([40, 60, 80, 100, 120, 160, 200, 240, 280, 320].includes(parsed) ? parsed : 120) as ThumbnailSize;
  });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; paths: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = readStorage(storageKeys.explorerViewMode(instanceId));
    return (['grid', 'columns', 'list', 'details'].includes(saved ?? '') ? saved : 'grid') as ViewMode;
  });
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // --- 컬럼 뷰 상태 ---
  const columnView = useColumnView();
  const columnRootPath = columnView.columns[0]?.path ?? null;

  // --- 실행취소 스택 ---
  const undoStack = useUndoStack();

  // --- 모달 상태 (커스텀 훅) ---
  const modals = useModalStates();

  // --- 폴더 태그 (프로젝트명) ---
  const [folderTags, setFolderTags] = useState<Record<string, string>>(() => {
    return readJsonStorage<Record<string, string>>(storageKeys.folderTags, {});
  });

  // --- 스크롤 위치 복원용 ---
  const scrollPositionRef = useRef<Map<string, number>>(new Map());
  const viewModeRef = useRef<ViewMode>(viewMode);
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  const pendingSelectRef = useRef<string | null>(null);

  // --- 미리보기 (비디오/이미지/텍스트) ---
  const preview = usePreview();
  const isMac = navigator.platform.startsWith('Mac');

  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const fuzzyFilterInputRef = useRef<HTMLInputElement>(null);
  const { loadDirectory, prefetchDirectory, lastVisitedChildRef } = useDirectoryLoader({
    gridRef,
    scrollPositionRef,
    viewModeRef,
    thumbnailSize,
    sortBy,
    sortDir,
    recentRoots,
    sortEntries,
    setEntries,
    setSelectedPaths,
    setFocusedIndex,
    setLoading,
    setError,
  });

  // --- 탭 관리 ---
  const {
    tabs, activeTabId, activeTab, currentPath,
    canGoBack, canGoForward,
    openTab, navigateTo, goBack: tabGoBack, goForward,
    handleTabSelect, handleTabClose, handleTabReorder,
    handleTabReceive, handleTabRemove,
    duplicateTab, closeOtherTabs, togglePinTab,
  } = useTabManagement({ instanceId, loadDirectory, onPathChange, onSplitModeChange });

  // 정렬 변경 시 재정렬 + 저장소 반영
  useEffect(() => {
    setEntries(prev => sortEntries(prev, sortBy, sortDir));
    writeStorage(storageKeys.explorerSortBy(instanceId), sortBy);
    writeStorage(storageKeys.explorerSortDir(instanceId), sortDir);
  }, [sortBy, sortDir, instanceId]);

  // 썸네일 크기·뷰 모드 변경 시 저장소 반영
  useEffect(() => {
    writeNumberStorage(storageKeys.explorerThumbnailSize(instanceId), thumbnailSize);
  }, [thumbnailSize, instanceId]);

  useEffect(() => {
    writeStorage(storageKeys.explorerViewMode(instanceId), viewMode);
  }, [viewMode, instanceId]);

  // 폴더 태그 변경 시 저장소 반영
  useEffect(() => {
    writeJsonStorage(storageKeys.folderTags, folderTags);
  }, [folderTags]);

  // --- 검색/필터 (커스텀 훅) ---
  const searchFilter = useSearchFilter({ entries, currentPath });
  const { displayEntries, fuzzyMatchIndices, fuzzyBestPath, fuzzyMatchCount, isFiltering } = searchFilter;
  const {
    selectionAnchorRef,
    selectEntry,
    selectAll,
    deselectAll,
    handleSelectPaths,
  } = useExplorerSelection({
    isFocused,
    splitMode,
    displayEntries,
    selectedPaths,
    setSelectedPaths,
    focusedIndex,
    setFocusedIndex,
  });

  // 복사/이동 진행 중인 대상 경로 (ghost 항목 pending 표시용)
  const [pendingCopyPaths, setPendingCopyPaths] = useState<string[]>([]);
  const pendingCopySet = useMemo(() => new Set(pendingCopyPaths.map(normalizeFsPath)), [pendingCopyPaths]);

  // --- 클립보드 (커스텀 훅) ---
  const clipboardHook = useClipboard({
    selectedPaths,
    currentPath,
    loadDirectory,
    setSelectedPaths,
    sharedClipboard,
    onClipboardChange,
    setEntries,
    entries,
    setPendingCopyPaths,
    onFolderMergeRequest: modals.setFolderMergeRequest,
  });

  // --- 파일 조작 (커스텀 훅) ---
  const fileOps = useFileOperations({
    currentPath, entries, selectedPaths,
    setSelectedPaths, setEntries, setFocusedIndex,
    loadDirectory, undoStack,
    sortBy, sortDir, sortEntries,
    sheetPackPaths: modals.sheetPackPaths,
    setBulkRenamePaths: modals.setBulkRenamePaths,
    setSheetPackPaths: modals.setSheetPackPaths,
    setContextMenu, setRenamingPath: modals.setRenamingPath,
    setError,
  });

  const fileOperationPendingSet = useMemo(() => {
    if (fileOps.extractingZipPaths.size === 0) return pendingCopySet;
    const merged = new Set(pendingCopySet);
    fileOps.extractingZipPaths.forEach(path => merged.add(normalizeFsPath(path)));
    return merged;
  }, [pendingCopySet, fileOps.extractingZipPaths]);

  // --- 컬럼 뷰 초기화/정리 ---
  // viewMode 변경 시: 컬럼뷰 퇴장 처리
  useEffect(() => {
    if (viewMode !== 'columns') {
      columnView.clearColumns();
    }
  }, [columnView.clearColumns, viewMode]);

  // displayEntries 또는 currentPath 변경 시 컬럼 뷰 동기화
  useEffect(() => {
    if (viewMode !== 'columns' || !currentPath) return;
    // 현재 컬럼의 루트 경로와 currentPath가 불일치하면 전체 재초기화
    if (columnRootPath !== currentPath) {
      // 탭 전환 또는 내비게이션: 컬럼 전체 리셋
      if (displayEntries.length > 0) {
        columnView.initColumns(currentPath, displayEntries);
        const firstEntry = displayEntries[0];
        if (firstEntry) {
          setSelectedPaths([firstEntry.path]);
          requestAnimationFrame(() => {
            columnView.selectInColumn(0, firstEntry);
          });
        }
      } else {
        // entries가 아직 로드되지 않음 → 빈 상태로 초기화 (loadDirectory 완료 시 다시 호출됨)
        columnView.clearColumns();
      }
    } else {
      // 같은 경로 내 변경 (검색/필터/파일 목록 갱신) → 첫 번째 컬럼만 업데이트
      columnView.updateFirstColumn(displayEntries);
    }
  }, [
    columnRootPath,
    columnView.clearColumns,
    columnView.initColumns,
    columnView.selectInColumn,
    columnView.updateFirstColumn,
    currentPath,
    displayEntries,
    setSelectedPaths,
    viewMode,
  ]);

  // --- initialPath 변경 시 현재 탭 경로 변경 (탭이 없으면 새 탭 생성) ---
  const handledInitialPathKeyRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!initialPath) return;
    if (handledInitialPathKeyRef.current === initialPathKey) return;
    handledInitialPathKeyRef.current = initialPathKey;
    // 현재 활성 탭이 이미 같은 경로면 불필요
    if (activeTab && activeTab.path === initialPath) return;
    if (activeTab) {
      // 기존 활성 탭의 경로를 변경 (새 탭 추가 안 함)
      navigateTo(initialPath);
    } else {
      // 탭이 없으면 새 탭 생성
      openTab(initialPath);
    }
  }, [activeTab, initialPath, initialPathKey, navigateTo, openTab]);

  // 앱 시작 시 저장된 탭이 있으면 마지막 활성 탭 로드
  const didLoadInitialActiveTabRef = useRef(false);

  useEffect(() => {
    if (didLoadInitialActiveTabRef.current) return;
    if (activeTab && !initialPath) {
      didLoadInitialActiveTabRef.current = true;
      loadDirectory(activeTab.path);
    }
  }, [activeTab, initialPath, loadDirectory]);

  // navigateTo 래퍼: 검색 상태 초기화
  const handleNavigateTo = useCallback((path: string) => {
    searchFilter.setSearchQuery('');
    searchFilter.setIsSearchActive(false);
    navigateTo(path);
  }, [navigateTo, searchFilter.setSearchQuery, searchFilter.setIsSearchActive]);

  // 글로벌 검색 결과 선택 핸들러
  const handleGlobalSearchSelect = useCallback((entry: FileEntry) => {
    if (entry.is_dir) {
      // 폴더 선택: 해당 폴더로 이동
      handleNavigateTo(entry.path);
    } else {
      // 파일 선택: 부모 폴더로 이동 + 해당 파일 자동 선택
      const parentDir = getParentDir(entry.path);
      pendingSelectRef.current = entry.path;
      handleNavigateTo(parentDir);
    }
  }, [handleNavigateTo]);

  const selectVisiblePath = useCallback((targetPath: string) => {
    const idx = entries.findIndex(entry => entry.path === targetPath);
    if (idx < 0) return false;
    setSelectedPaths([entries[idx].path]);
    setFocusedIndex(idx);
    pendingSelectRef.current = null;
    requestAnimationFrame(() => {
      const el = gridRef.current?.querySelector(`[data-file-path="${CSS.escape(targetPath)}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return true;
  }, [entries]);

  const handleFolderSizeChildSelect = useCallback((child: NonNullable<FolderSizeDialogState['children']>[number]) => {
    const target = getFolderSizeChildNavigationTarget({
      path: child.path,
      isDir: child.isDir,
    });
    if (target.selectPath) {
      pendingSelectRef.current = target.selectPath;
    }
    fileOps.closeFolderSizeDialog();
    if (target.navigatePath === currentPath) {
      if (target.selectPath) {
        selectVisiblePath(target.selectPath);
      }
      return;
    }
    handleNavigateTo(target.navigatePath);
  }, [currentPath, fileOps.closeFolderSizeDialog, handleNavigateTo, selectVisiblePath]);

  // 중복 파일 모달에서 삭제
  const handleDuplicateFileDelete = useCallback(async (path: string) => {
    await fileOps.handleDelete([path], false);
  }, [fileOps.handleDelete]);

  // goBack 래퍼: 이전 경로 자동 선택
  const goBack = useCallback(() => {
    const prevPath = tabGoBack();
    if (prevPath) lastVisitedChildRef.current = prevPath;
  }, [tabGoBack]);

  // goUp: 상위 경로로 이동
  const goUp = useCallback(() => {
    if (!currentPath) return;
    if (currentPath === SYSTEM_ROOT_PATH) return;

    if (isArchiveVirtualPath(currentPath)) {
      const parent = getArchiveVirtualParent(currentPath);
      if (!parent) return;
      lastVisitedChildRef.current = currentPath;
      handleNavigateTo(parent);
      return;
    }

    // Windows 드라이브 루트(C:\)에서는 가상 루트(내 PC)로 이동
    if (/^[A-Za-z]:[\\/]*$/.test(currentPath)) {
      lastVisitedChildRef.current = currentPath.replace(/\//g, '\\').replace(/[\\]+$/, '\\');
      handleNavigateTo(SYSTEM_ROOT_PATH);
      return;
    }

    // macOS 최상위 루트(/)에서는 가상 루트(Macintosh HD)로 이동
    if (currentPath === '/') {
      lastVisitedChildRef.current = currentPath;
      handleNavigateTo(SYSTEM_ROOT_PATH);
      return;
    }

    const sep = getPathSeparator(currentPath);
    const parts = currentPath.replace(/[/\\]+$/, '').split(sep);
    if (parts.length <= 1) return;
    parts.pop();
    const parent = parts.join(sep) || sep;
    lastVisitedChildRef.current = currentPath;
    handleNavigateTo(parent);
  }, [currentPath, handleNavigateTo]);

  const openArchiveEntry = useCallback((path: string) => {
    const browsePath = buildArchiveBrowsePath(path);
    if (shouldOpenArchiveInCurrentPane(currentPath, path)) {
      handleNavigateTo(browsePath);
      return;
    }

    window.dispatchEvent(new CustomEvent('qf-open-archive-pane', {
      detail: {
        path: browsePath,
        sourceInstanceId: instanceId,
      },
    }));
  }, [currentPath, handleNavigateTo, instanceId]);

  const { previewFile, openEntry } = usePreviewRouting({
    preview,
    isMac,
    thumbnailSize,
    onNavigateTo: handleNavigateTo,
    onOpenArchiveEntry: openArchiveEntry,
  });

  // Ctrl+더블클릭 → 폴더를 새 탭으로 열기
  const openEntryInNewTab = useCallback((entry: FileEntry) => {
    if (entry.is_dir) {
      openTab(entry.path);
      return;
    }
    if (entry.file_type === 'archive' && isBrowsableArchiveFilePath(entry.path)) {
      openTab(buildArchiveBrowsePath(entry.path));
    }
  }, [openTab]);

  const openInOsExplorer = useCallback(async (path: string) => {
    try {
      await tauriCommands.openFolder(path);
    } catch (e) {
      console.error('탐색기 열기 실패:', e);
    }
  }, []);

  // 폴더 태그 추가 (모달 상태 기반)
  const handleAddTag = useCallback((path: string) => {
    modals.setTagPrompt({ path, defaultName: getFileName(path) });
  }, [modals.setTagPrompt]);

  // 폴더 태그 해제
  const handleRemoveTag = useCallback((path: string) => {
    setFolderTags(prev => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

  const handleFuzzyFilterClear = useCallback(() => {
    searchFilter.setSearchQuery('');
    searchFilter.setIsSearchActive(false);
    setFocusedIndex(-1);
    deselectAll();
    // 포커스 유지 — 다음 한글/영문 입력이 IME에서 끊기지 않도록
    requestAnimationFrame(() => fuzzyFilterInputRef.current?.focus({ preventScroll: true }));
  }, [searchFilter.setSearchQuery, searchFilter.setIsSearchActive, deselectAll]);

  const fuzzyFilterInputEnabled = isFocused
    && !modals.renamingPath
    && !searchFilter.isSearchActive
    && !isFuzzyFilterBlocked();

  // --- 인라인 퍼지 필터: IME 지원 hidden input 포커스 관리 ---
  const { focusFilterInput } = useInlineFuzzyFilter({
    enabled: fuzzyFilterInputEnabled,
    inputRef: fuzzyFilterInputRef,
    searchQuery: searchFilter.searchQuery,
    setSearchQuery: searchFilter.setSearchQuery,
  });

  // 퍼지 필터 시작 시 기존 선택 해제 (Backspace 삭제 오동작 방지)
  const prevSearchQueryRef = useRef('');
  useEffect(() => {
    const prev = prevSearchQueryRef.current.trim();
    const next = searchFilter.searchQuery.trim();
    if (!prev && next) {
      deselectAll();
    }
    if (prev && !next) {
      setFocusedIndex(-1);
      deselectAll();
    }
    prevSearchQueryRef.current = searchFilter.searchQuery;
  }, [searchFilter.searchQuery, deselectAll]);

  // 퍼지 필터 쿼리 변경 시 최상위 매칭 항목으로 스크롤만 (선택하지 않음 — 삭제 사고 방지)
  const lastFuzzyScrollQueryRef = useRef('');
  useEffect(() => {
    const q = searchFilter.searchQuery.trim();
    if (!q) {
      lastFuzzyScrollQueryRef.current = '';
      return;
    }
    if (lastFuzzyScrollQueryRef.current === q) return;
    lastFuzzyScrollQueryRef.current = q;

    if (!fuzzyBestPath) return;

    const bestIdx = displayEntries.findIndex(entry => entry.path === fuzzyBestPath);
    if (bestIdx < 0) return;

    setFocusedIndex(bestIdx);
    requestAnimationFrame(() => {
      const el = gridRef.current?.querySelector(`[data-file-path="${CSS.escape(fuzzyBestPath)}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [searchFilter.searchQuery, displayEntries, fuzzyBestPath]);

  // --- 키보드 단축키 (커스텀 훅) ---
  useKeyboardShortcuts({
    isFocused,
    renamingPath: modals.renamingPath,
    currentPath,
    viewMode,
    entries: displayEntries,
    selectedPaths,
    focusedIndex,
    clipboard: clipboardHook.clipboard,
    isSearchActive: searchFilter.isSearchActive,
    isFiltering,
    isMac,
    splitMode,
    tabs,
    activeTabId,
    activeTab,
    thumbnailSize,
    gridRef,
    selectionAnchorRef,
    handleCopy: clipboardHook.handleCopy,
    handleCut: clipboardHook.handleCut,
    handlePaste: clipboardHook.handlePaste,
    handleDuplicate: fileOps.handleDuplicate,
    handleDelete: fileOps.handleDelete,
    handleCreateDirectory: fileOps.handleCreateDirectory,
    handleGroupIntoFolder: fileOps.handleGroupIntoFolder,
    handleUngroupFolder: fileOps.handleUngroupFolder,
    handleRenameStart: fileOps.handleRenameStart,
    handleBulkRename: fileOps.handleBulkRename,
    handleCopyPath: fileOps.handleCopyPath,
    handleUndo: fileOps.handleUndo,
    selectAll,
    deselectAll,
    goBack,
    goForward,
    goUp,
    openEntry,
    previewFile,
    preview,
    setDiffViewerPaths: modals.setDiffViewerPaths,
    setViewMode,
    setThumbnailSize,
    setFocusedIndex,
    setSelectedPaths,
    setClipboard: clipboardHook.setClipboard,
    setSearchQuery: searchFilter.setSearchQuery,
    setIsSearchActive: searchFilter.setIsSearchActive,
    setIsGoToFolderOpen: modals.setIsGoToFolderOpen,
    setIsGlobalSearchOpen: modals.setIsGlobalSearchOpen,
    setError,
    handleTabSelect,
    handleTabClose,
    duplicateTab,
    closeOtherTabs,
    columnView,
    setMarkdownEditorPath: modals.setMarkdownEditorPath,
    handleCreateMarkdown: fileOps.handleCreateMarkdown,
    handleCompressVideo: fileOps.handleCompressVideo,
    handleCompressPdf: fileOps.handleCompressPdf,
    handleCompressZip: fileOps.handleCompressZip,
    handleExtractZip: fileOps.handleExtractZip,
    handleAddTag,
    handlePasteImageFromClipboard: fileOps.handlePasteImageFromClipboard,
    setFontMergePaths: modals.setFontMergePaths,
    setFontPreviewPath: modals.setFontPreviewPath,
    setPdfPreviewPath: modals.setPdfPreviewPath,
    setAudioPreviewPath: modals.setAudioPreviewPath,
  });

  // --- 컨텍스트 메뉴 ---
  // 선택된 항목 중 하나를 우클릭하면 선택 전체를 대상으로 메뉴 표시
  const handleContextMenu = useCallback((e: React.MouseEvent, paths: string[]) => {
    e.preventDefault();
    const clickedPath = paths[0];
    const menuPaths = (clickedPath && selectedPaths.includes(clickedPath))
      ? selectedPaths
      : paths;
    setContextMenu({ x: e.clientX, y: e.clientY, paths: menuPaths });
  }, [selectedPaths]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);


  // --- 컨텍스트 메뉴 섹션 빌더 (커스텀 훅) ---
  const { contextMenuSections } = useContextMenuBuilder({
    contextMenu,
    entries,
    folderTags,
    clipboardHook,
    fileOps,
    modals,
    preview,
    openEntry,
    openInOsExplorer,
    handleAddTag,
    handleRemoveTag,
    onAddToFavorites,
    loadDirectory,
    currentPath,
  });

  usePreviewAutoRefresh({ preview, selectedPaths, entries, previewFile });
  // 선택된 PSD 미리보기를 백그라운드로 미리 데워 스페이스바 즉시 표시
  usePreviewPrewarm({ selectedPaths, entries, isMac });

  // --- 글로벌 검색에서 파일 선택 후 자동 선택 ---
  useEffect(() => {
    if (!pendingSelectRef.current) return;
    const targetPath = pendingSelectRef.current;
    selectVisiblePath(targetPath);
  }, [entries, selectVisiblePath]);

  // --- 붙여넣기·복제 후 파일 자동 선택 (경로 슬래시 차이 흡수) ---
  useEffect(() => {
    const pathMatches = (a: string, b: string) => normalizeFsPath(a) === normalizeFsPath(b);

    if (clipboardHook.pendingPasteSelectRef.current.length > 0) {
      const targets = clipboardHook.pendingPasteSelectRef.current;
      const matched = entries.filter(e => targets.some(t => pathMatches(t, e.path)));
      if (matched.length > 0) {
        const matchedPaths = matched.map(e => e.path);
        setSelectedPaths(matchedPaths);
        const firstIdx = entries.findIndex(e => pathMatches(matchedPaths[0], e.path));
        if (firstIdx >= 0) setFocusedIndex(firstIdx);
        clipboardHook.pendingPasteSelectRef.current = [];
        requestAnimationFrame(() => {
          const el = gridRef.current?.querySelector(`[data-file-path="${CSS.escape(matchedPaths[0])}"]`);
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      }
    }

    if (fileOps.pendingDuplicateSelectRef.current.length > 0) {
      const targets = fileOps.pendingDuplicateSelectRef.current;
      const matched = entries.filter(e => targets.some(t => pathMatches(t, e.path)));
      if (matched.length > 0) {
        const matchedPaths = matched.map(e => e.path);
        setSelectedPaths(matchedPaths);
        const firstIdx = entries.findIndex(e => pathMatches(matchedPaths[0], e.path));
        if (firstIdx >= 0) setFocusedIndex(firstIdx);
        fileOps.pendingDuplicateSelectRef.current = [];
        // 렌더링이 끝난 뒤 즉시 스크롤 (smooth 사용 시 도중에 다른 effect가 끼어들어 실패할 수 있음)
        requestAnimationFrame(() => {
          const el = gridRef.current?.querySelector(`[data-file-path="${CSS.escape(matchedPaths[0])}"]`);
          el?.scrollIntoView({ block: 'center', behavior: 'auto' });
        });
      }
    }

    // 압축 해제된 폴더 자동 선택·스크롤
    if (fileOps.pendingExtractSelectRef.current.length > 0) {
      const targets = fileOps.pendingExtractSelectRef.current;
      const matched = entries.filter(e => targets.some(t => pathMatches(t, e.path)));
      if (matched.length > 0) {
        const matchedPaths = matched.map(e => e.path);
        setSelectedPaths(matchedPaths);
        const firstIdx = entries.findIndex(e => pathMatches(matchedPaths[0], e.path));
        if (firstIdx >= 0) setFocusedIndex(firstIdx);
        fileOps.pendingExtractSelectRef.current = [];
        requestAnimationFrame(() => {
          const el = gridRef.current?.querySelector(`[data-file-path="${CSS.escape(matchedPaths[0])}"]`);
          el?.scrollIntoView({ block: 'center', behavior: 'auto' });
        });
      }
    }
  }, [entries]);

  // --- 창 포커스 시 변경 감지 후 조건부 새로고침 ---
  // 파일이 변경되지 않았으면 리렌더링 하지 않아 깜빡임 방지
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const handleFocus = () => {
      if (!currentPath || modals.renamingPath) return;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        try {
          const result = await tauriCommands.listDirectory(currentPath);
          const sorted = sortEntries(result, sortBy, sortDir);
          const prev = entriesRef.current;
          // 파일 목록이 동일하면 업데이트 스킵 (깜빡임 방지)
          if (prev.length === sorted.length && prev.every((e, i) =>
            e.path === sorted[i].path && e.modified === sorted[i].modified && e.size === sorted[i].size
          )) return;
          setEntries(sorted);
        } catch { /* 무시 */ }
      }, 300);
    };
    window.addEventListener('focus', handleFocus);
    return () => { window.removeEventListener('focus', handleFocus); clearTimeout(timeoutId); };
  }, [currentPath, modals.renamingPath, sortBy, sortDir]);

  // --- 다른 패널에서 파일 이동 시 새로고침 ---
  useEffect(() => {
    const handler = async () => {
      if (!currentPath) return;
      await loadDirectory(currentPath);
      if (viewMode === 'columns') {
        await columnView.refreshOpenColumns();
      }
    };
    window.addEventListener('qf-files-changed', handler);
    return () => window.removeEventListener('qf-files-changed', handler);
  }, [currentPath, loadDirectory, viewMode, columnView.refreshOpenColumns]);

  // --- Ctrl+마우스 휠 썸네일 확대/축소 ---
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!isFocused || viewMode !== 'grid') return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const absDeltaY = Math.abs(e.deltaY);
      if (absDeltaY === 0) return;
      // 터치패드 precision wheel은 작은 pixel delta가 연속으로 들어오므로 무시한다.
      if (e.deltaMode === 0 && absDeltaY < 80) return;
      e.preventDefault();
      // 일반 마우스 휠 delta를 썸네일 크기 한 단계로 반영한다.
      cancelAllQueued();
      const direction = e.deltaY < 0 ? 1 : -1;
      setThumbnailSize(prev => {
        const idx = THUMBNAIL_SIZES.indexOf(prev);
        return THUMBNAIL_SIZES[Math.max(0, Math.min(THUMBNAIL_SIZES.length - 1, idx + direction))];
      });
    };
    window.addEventListener('wheel', handler, { passive: false });
    return () => window.removeEventListener('wheel', handler);
  }, [isFocused, viewMode]);

  // --- 드롭 중복 확인 다이얼로그 상태 (내부 드래그 + OS 드래그 공용) ---
  const [dropConfirm, setDropConfirm] = useState<PendingDrop | null>(null);

  const handleDropDuplicateDetected = useCallback(async (info: PendingDrop) => {
    const mergeAction = info.action === 'copy' ? 'copy' : 'move';
    const folderMerge = await detectFolderMergeScenario(info.sources, info.dest, info.duplicates, mergeAction);
    if (folderMerge) {
      modals.setFolderMergeRequest(folderMerge);
    } else {
      setDropConfirm(info);
    }
  }, [modals.setFolderMergeRequest]);

  const handleFolderMergeComplete = useCallback(() => {
    const req = modals.folderMergeRequest;
    modals.setFolderMergeRequest(null);
    if (req?.action === 'cut') {
      clipboardHook.setClipboard(null);
    }
    loadDirectory(currentPath);
    window.dispatchEvent(new Event('qf-files-changed'));
  }, [modals.folderMergeRequest, modals.setFolderMergeRequest, clipboardHook, currentPath, loadDirectory]);

  // --- 내부 드래그 → 폴더 이동 / 사이드바 즐겨찾기 등록 ---
  const {
    isDragging: isInternalDragging,
    activeDragPaths,
    isTrayTargetActive,
    dropTargetPath,
    handleDragMouseDown,
    executeDrop,
  } = useInternalDragDrop({
    selectedPaths,
    currentPath,
    onMoveComplete: () => loadDirectory(currentPath),
    onAddToCategory,
    onStageFilesToTray,
    onDuplicateDetected: handleDropDuplicateDetected,
    onError: setError,
  });

  useEffect(() => {
    onTrayDragStateChange?.(isInternalDragging, isTrayTargetActive);
    return () => {
      onTrayDragStateChange?.(false, false);
    };
  }, [isInternalDragging, isTrayTargetActive, onTrayDragStateChange]);

  // --- OS에서 파일 드래그 수신 (Tauri onDragDropEvent) ---
  useEffect(() => {
    if (!currentPath || !isTauri()) return;
    let isMounted = true;
    let unlisten: (() => void) | null = null;

    getCurrentWebview().onDragDropEvent(async (event) => {
      if (!isMounted) return;
      if (event.payload.type !== 'drop') return;

      const droppedPaths = event.payload.paths;
      if (!droppedPaths || droppedPaths.length === 0) return;

      // 드롭 위치가 이 패널 영역 안인지 확인
      const pos = event.payload.position;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const inBounds = (px: number, py: number) =>
        px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom;
      if (!inBounds(pos.x, pos.y) && !inBounds(pos.x / dpr, pos.y / dpr)) return;
      if (isArchiveVirtualPath(currentPath)) {
        setError('압축 내부는 읽기 전용입니다. 파일을 밖으로 꺼내서 사용하세요.');
        return;
      }

      // 이미 같은 디렉토리에 있는 파일은 제외
      const filtered = droppedPaths.filter(p => {
        return getParentDir(p) !== currentPath;
      });
      if (filtered.length === 0) return;

      // 같은 볼륨(로컬-로컬, 동일 클라우드 계정-계정) → 이동, 다른 볼륨 → 복사
      const shouldCopy = filtered.some(p => !sameVolume(p, currentPath));

      try {
        // 중복 확인
        const duplicates = await tauriCommands.checkDuplicateItems(filtered, currentPath);
        if (duplicates.length > 0) {
          const dropInfo: PendingDrop = {
            sources: filtered,
            dest: currentPath,
            action: shouldCopy ? 'copy' : 'move',
            duplicates,
          };
          const mergeAction = shouldCopy ? 'copy' : 'move';
          const folderMerge = await detectFolderMergeScenario(filtered, currentPath, duplicates, mergeAction);
          if (folderMerge) {
            modals.setFolderMergeRequest(folderMerge);
          } else {
            setDropConfirm(dropInfo);
          }
          return;
        }

        const dropLabel = filtered.length === 1
          ? getFileName(filtered[0])
          : `${getFileName(filtered[0])} 외 ${filtered.length - 1}개`;
        const sep = getPathSeparator(currentPath);
        const destPaths = filtered.map(p => normalizeFsPath(`${currentPath}${sep}${getFileName(p)}`));
        clipboardHook.pendingPasteSelectRef.current = destPaths;
        await runTransferWithProgress(
          shouldCopy ? 'copy' : 'move',
          filtered,
          currentPath,
          false,
          dropLabel,
        );
        loadDirectory(currentPath);
        window.dispatchEvent(new Event('qf-files-changed'));
      } catch (err) {
        console.error('파일 드롭 처리 실패:', err);
      }
    }).then(fn => {
      if (isMounted) unlisten = fn;
      else fn();
    });

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, [currentPath]);

  // 오디오 미리보기 열림 상태에서 선택이 다른 오디오로 변경되면 자동으로 재생 전환
  useEffect(() => {
    if (!modals.audioPreviewPath) return;
    if (selectedPaths.length !== 1) return;
    const sel = selectedPaths[0];
    if (sel === modals.audioPreviewPath) return;
    if (/\.(mp3|wav|aac|flac|ogg|m4a|opus|wma|aiff?|alac|mid|midi)$/i.test(sel)) {
      modals.setAudioPreviewPath(sel);
    }
  }, [selectedPaths, modals.audioPreviewPath, modals.setAudioPreviewPath]);

  // 외부 클릭 시 선택 해제
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedPaths([]);
    }
    closeContextMenu();
  }, [closeContextMenu]);

  const reloadCurrentPath = useCallback(() => {
    if (currentPath) loadDirectory(currentPath);
  }, [currentPath, loadDirectory]);

  const handlePreviewCropSave = useCallback((outputPath: string) => {
    fileOps.showCopyToast(`크롭 저장 완료: ${getFileName(outputPath)}`);
    pendingSelectRef.current = outputPath;
    reloadCurrentPath();
  }, [fileOps.showCopyToast, reloadCurrentPath]);

  const handleNavigationSortChange = useCallback((by: 'name' | 'size' | 'modified' | 'type', dir: 'asc' | 'desc') => {
    setSortBy(by);
    setSortDir(dir);
  }, []);

  const handleSearchToggle = useCallback(() => {
    searchFilter.setIsSearchActive(prev => {
      if (prev) {
        searchFilter.setSearchQuery('');
        return false;
      }
      setTimeout(() => searchFilter.searchInputRef.current?.focus(), 0);
      return true;
    });
  }, [searchFilter]);

  const handleExtFilterToggle = useCallback((ext: string) => {
    searchFilter.setActiveExtFilters(prev => {
      const next = new Set(prev);
      if (next.has(ext)) next.delete(ext);
      else next.add(ext);
      return next;
    });
  }, [searchFilter]);

  const handleHideTextToggle = useCallback(() => {
    searchFilter.setHideText(value => !value);
  }, [searchFilter]);

  const handleColumnSelect = useCallback((colIndex: number, entry: FileEntry, multi: boolean, range: boolean) => {
    const col = columnView.columns[colIndex];
    if (!col) return;
    const rowIdx = col.entries.findIndex(e => e.path === entry.path);

    if (multi) {
      setSelectedPaths(prev =>
        prev.includes(entry.path) ? prev.filter(p => p !== entry.path) : [...prev, entry.path]
      );
      columnView.setFocusedCol(colIndex);
      if (rowIdx >= 0) columnView.setFocusedRow(rowIdx);
    } else if (range) {
      if (selectionAnchorRef.current < 0) selectionAnchorRef.current = columnView.focusedRow;
      const from = Math.min(selectionAnchorRef.current, rowIdx);
      const to = Math.max(selectionAnchorRef.current, rowIdx);
      setSelectedPaths(col.entries.slice(from, to + 1).map(e => e.path));
      columnView.setFocusedCol(colIndex);
      if (rowIdx >= 0) columnView.setFocusedRow(rowIdx);
    } else {
      selectionAnchorRef.current = -1;
      columnView.selectInColumn(colIndex, entry);
      setSelectedPaths([entry.path]);
    }
  }, [columnView, selectionAnchorRef]);

  const handleGridSortChange = useCallback((by: string) => {
    const typedBy = by as 'name' | 'size' | 'modified' | 'type';
    if (sortBy === typedBy) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(typedBy);
      setSortDir('asc');
    }
  }, [sortBy]);

  const handleTagConfirm = useCallback((tag: string) => {
    if (!modals.tagPrompt) return;
    setFolderTags(prev => ({ ...prev, [modals.tagPrompt!.path]: tag }));
    modals.setTagPrompt(null);
  }, [modals]);

  const handleTagCancel = useCallback(() => {
    modals.setTagPrompt(null);
  }, [modals]);

  const draggedPaths = useMemo(
    () => new Set(activeDragPaths.length > 0 ? activeDragPaths : selectedPaths),
    [activeDragPaths, selectedPaths],
  );

  return (
    <ExplorerLayout
      containerRef={containerRef}
      currentPath={currentPath}
      instanceId={instanceId}
      themeVars={themeVars}
      fuzzyFilterInputRef={fuzzyFilterInputRef}
      fuzzyFilterValue={searchFilter.searchQuery}
      fuzzyFilterEnabled={fuzzyFilterInputEnabled}
      isMac={isMac}
      onFuzzyFilterChange={searchFilter.setSearchQuery}
      onFuzzyFilterClear={handleFuzzyFilterClear}
      onContainerClick={handleContainerClick}
    >
      <ExplorerContent
        tabs={tabs}
        activeTabId={activeTabId}
        instanceId={instanceId}
        folderTags={folderTags}
        themeVars={themeVars}
        currentPath={currentPath}
        splitMode={splitMode}
        onSplitModeChange={onSplitModeChange}
        onTabSelect={handleTabSelect}
        onTabClose={handleTabClose}
        onTabReorder={handleTabReorder}
        onTabReceive={handleTabReceive}
        onTabRemove={handleTabRemove}
        onTogglePin={togglePinTab}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={goBack}
        onForward={goForward}
        onUp={goUp}
        onNavigate={handleNavigateTo}
        onCreateDirectory={fileOps.handleCreateDirectory}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={handleNavigationSortChange}
        thumbnailSize={thumbnailSize}
        onThumbnailSizeChange={setThumbnailSize}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isSearchActive={searchFilter.isSearchActive}
        searchQuery={searchFilter.searchQuery}
        onSearchQueryChange={searchFilter.setSearchQuery}
        onSearchToggle={handleSearchToggle}
        searchInputRef={searchFilter.searchInputRef}
        activeExtFilters={searchFilter.activeExtFilters}
        availableExtensions={searchFilter.availableExtensions}
        onExtFilterToggle={handleExtFilterToggle}
        onExtFilterClear={() => searchFilter.setActiveExtFilters(new Set())}
        hideText={searchFilter.hideText}
        onHideTextToggle={handleHideTextToggle}
        columnView={columnView}
        selectedPaths={selectedPaths}
        renamingPath={modals.renamingPath}
        loading={loading}
        error={error}
        onColumnSelect={handleColumnSelect}
        onOpenEntry={openEntry}
        onContextMenu={handleContextMenu}
        onDragMouseDown={handleDragMouseDown}
        onRenameCommit={fileOps.handleRenameCommit}
        displayEntries={displayEntries}
        clipboard={clipboardHook.clipboard}
        focusedIndex={focusedIndex}
        gridRef={gridRef}
        dropTargetPath={dropTargetPath}
        onSelect={selectEntry}
        onSelectPaths={handleSelectPaths}
        onDeselectAll={deselectAll}
        onOpenInNewTab={openEntryInNewTab}
        onHoverFolder={prefetchDirectory}
        onGridSortChange={handleGridSortChange}
        pendingCopyPaths={fileOperationPendingSet}
        draggedPaths={draggedPaths}
        isDraggingNow={isInternalDragging}
        fuzzyMatchIndices={fuzzyMatchIndices}
        isFuzzyFiltering={isFiltering}
        fuzzyMatchCount={fuzzyMatchCount}
        onFuzzyFilterClear={handleFuzzyFilterClear}
        onFilterInputFocus={focusFilterInput}
        videoCompression={fileOps.videoCompression}
        gsSetup={fileOps.gsSetup}
      />

      <ExplorerModalBridge
        fileOps={fileOps}
        modals={modals}
        preview={preview}
        entries={entries}
        currentPath={currentPath}
        themeVars={themeVars}
        recentPath={RECENT_PATH}
        contextMenu={contextMenu}
        contextMenuSections={contextMenuSections}
        clipboardHook={clipboardHook}
        dropConfirm={dropConfirm}
        onCloseContextMenu={closeContextMenu}
        onFolderSizeChildOpen={handleFolderSizeChildSelect}
        onReloadCurrentPath={reloadCurrentPath}
        onPreviewCropSave={handlePreviewCropSave}
        onNavigate={handleNavigateTo}
        onGlobalSearchSelect={handleGlobalSearchSelect}
        onDuplicateFileDelete={handleDuplicateFileDelete}
        onFolderMergeComplete={handleFolderMergeComplete}
        onTagConfirm={handleTagConfirm}
        onTagCancel={handleTagCancel}
        onClearDropConfirm={() => setDropConfirm(null)}
        onExecuteDrop={executeDrop}
        onReloadPath={loadDirectory}
      />
    </ExplorerLayout>
  );
}
