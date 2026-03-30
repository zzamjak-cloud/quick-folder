import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry, ClipboardData, ThumbnailSize, ViewMode } from '../../types';
import { ThemeVars, ContextMenuSection } from './types';
import {
  ExternalLink, Folder, Copy, CopyPlus, Scissors, Clipboard as ClipboardIcon,
  Edit2, Trash2, Hash, Star, FileArchive, Eye, Film, Grid3x3, LayoutGrid, Ungroup, Tag,
  FolderPlus, FileText, Image, List,
} from 'lucide-react';
import NavigationBar from './NavigationBar';
import FileGrid from './FileGrid';
import ContextMenu from './ContextMenu';
import BulkRenameModal from './BulkRenameModal';
import PixelateModal from './PixelateModal';
import SheetPackerModal from './SheetPackerModal';
import SheetUnpackModal from './SheetUnpackModal';
import MarkdownEditor from './MarkdownEditor';
import StatusBar from './StatusBar';
import TabBar from './TabBar';
import { useInternalDragDrop } from './hooks/useInternalDragDrop';
import { usePreview } from './hooks/usePreview';
import { useTabManagement } from './hooks/useTabManagement';
import { PreviewModals } from './PreviewModals';
import { cancelAllQueued } from './hooks/invokeQueue';
import { useColumnView } from './hooks/useColumnView';
import ColumnView from './ColumnView';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { isCloudPath, getFileName, getPathSeparator, getParentDir } from '../../utils/pathUtils';
import GoToFolderModal from './GoToFolderModal';
import GlobalSearchModal from './GlobalSearchModal';
import { useUndoStack } from './hooks/useUndoStack';
import { useModalStates } from './hooks/useModalStates';
import { useSearchFilter } from './hooks/useSearchFilter';
import { useClipboard } from './hooks/useClipboard';
import { useFileOperations } from './hooks/useFileOperations';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

// 최근항목 특수 경로 상수
const RECENT_PATH = '__recent__';

interface FileExplorerProps {
  instanceId?: string;   // 분할 뷰 시 localStorage 키 분리용 (기본: 'default')
  isFocused?: boolean;   // 포커스된 패널만 키보드 단축키 응답 (기본: true)
  splitMode?: 'single' | 'horizontal' | 'vertical';
  onSplitModeChange?: (mode: 'single' | 'horizontal' | 'vertical') => void;
  initialPath: string;
  initialPathKey?: number;  // 같은 경로를 다시 요청할 때도 반응하기 위한 키
  onPathChange: (path: string) => void;
  onAddToFavorites: (path: string, name: string) => void;
  onAddToCategory?: (categoryId: string, path: string, name: string) => void;
  themeVars: ThemeVars | null;
  // 분할 뷰에서 클립보드 공유용 (App.tsx에서 상태 관리)
  sharedClipboard?: ClipboardData | null;
  onClipboardChange?: (cb: ClipboardData | null) => void;
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
  recentRoots = [],
  initialPathKey = 0,
}: FileExplorerProps) {
  // --- 상태 ---
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified' | 'type'>(() => {
    const saved = localStorage.getItem(`qf_sort_by_${instanceId}`);
    return (saved as 'name' | 'size' | 'modified' | 'type') || 'modified';
  });
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => {
    const saved = localStorage.getItem(`qf_sort_dir_${instanceId}`);
    return (saved as 'asc' | 'desc') || 'desc';
  });
  const [thumbnailSize, setThumbnailSize] = useState<ThumbnailSize>(() => {
    const saved = localStorage.getItem(`qf_thumb_size_${instanceId}`);
    const parsed = saved ? Number(saved) : 120;
    return ([40, 60, 80, 100, 120, 160, 200, 240, 280, 320].includes(parsed) ? parsed : 120) as ThumbnailSize;
  });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; paths: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(`qf_view_mode_${instanceId}`);
    return (['grid', 'columns', 'list', 'details'].includes(saved ?? '') ? saved : 'grid') as ViewMode;
  });
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const selectionAnchorRef = useRef<number>(-1); // Shift 선택 시작점

  // --- 컬럼 뷰 상태 ---
  const columnView = useColumnView();

  // --- 실행취소 스택 ---
  const undoStack = useUndoStack();

  // --- 모달 상태 (커스텀 훅) ---
  const modals = useModalStates();

  // --- 폴더 태그 (프로젝트명) ---
  const [folderTags, setFolderTags] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('qf_folder_tags') ?? '{}'); }
    catch { return {}; }
  });

  // --- 스크롤 위치 복원용 ---
  const scrollPositionRef = useRef<Map<string, number>>(new Map());

  const pendingSelectRef = useRef<string | null>(null);

  // --- 미리보기 (비디오/이미지/텍스트) ---
  const preview = usePreview();
  const isMac = navigator.platform.startsWith('Mac');

  // 텍스트 미리보기 대상 확장자
  const TEXT_PREVIEW_EXTS = useMemo(() => new Set([
    'txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'py', 'rs', 'go',
    'java', 'c', 'cpp', 'h', 'yaml', 'yml', 'toml', 'xml', 'csv', 'log',
  ]), []);

  // 파일 미리보기 실행 (Space키 + 화살표 이동 시 공용)
  const previewFile = useCallback((entry: FileEntry) => {
    // 폴더는 미리보기 대상이 아님
    if (entry.is_dir) return;

    const isVideo = entry.file_type === 'video';
    const isImage = entry.file_type === 'image' || /\.psd$/i.test(entry.name);
    const isPsb = /\.psb$/i.test(entry.name);
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    const isText = TEXT_PREVIEW_EXTS.has(ext);

    // 같은 타입이면 closeAll 없이 직접 교체 (깜빡임 방지)
    if (isVideo) {
      if (!preview.videoPlayerPath) preview.closeAllPreviews();
      preview.setVideoPlayerPath(entry.path);
    } else if (isImage) {
      if (!preview.previewImagePath) preview.closeAllPreviews();
      preview.handlePreviewImage(entry.path);
    } else if (isPsb) {
      preview.closeAllPreviews();
      if (isMac) {
        invoke('quick_look', { path: entry.path }).catch(console.error);
      } else {
        preview.handlePreviewImage(entry.path);
      }
    } else if (isText) {
      if (!preview.previewTextPath) preview.closeAllPreviews();
      preview.handlePreviewText(entry.path);
    } else if (isMac && !entry.is_dir) {
      preview.closeAllPreviews();
      invoke('quick_look', { path: entry.path }).catch(console.error);
    }
  }, [isMac, TEXT_PREVIEW_EXTS, preview]);

  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const currentPathRef = useRef<string | null>(null); // loadDirectory에서 스크롤 저장용
  // 뒤로/위로 이동 시 이전 폴더를 자동 선택하기 위한 ref
  const lastVisitedChildRef = useRef<string | null>(null);

  // --- 디렉토리 로딩 ---
  const loadRequestRef = useRef(0); // 동시 요청 시 마지막 요청만 반영
  const entriesCacheRef = useRef<Map<string, FileEntry[]>>(new Map()); // 탭별 entries 캐시

  const loadDirectory = useCallback(async (path: string) => {
    if (!path) return;
    // 현재 경로의 스크롤 위치 저장
    if (gridRef.current && currentPathRef.current) {
      scrollPositionRef.current.set(currentPathRef.current, gridRef.current.scrollTop);
    }
    currentPathRef.current = path;
    cancelAllQueued(); // 이전 디렉토리의 대기 중인 썸네일 요청 모두 취소
    setError(null);

    // 최근항목 특수 경로 처리
    const isRecent = path === RECENT_PATH;

    // 캐시에 있으면 즉시 표시 (탭 전환 시 대기 없음) — 최근항목은 캐시 안 함
    const cached = isRecent ? null : entriesCacheRef.current.get(path);
    if (cached) {
      setEntries(sortEntries(cached, sortBy, sortDir));
      setSelectedPaths([]);
      setFocusedIndex(-1);
    }

    // 캐시 히트와 무관하게 항상 백그라운드에서 최신 데이터 요청
    setLoading(true);
    const requestId = ++loadRequestRef.current;
    try {
      const result = isRecent
        ? await invoke<FileEntry[]>('get_recent_files', { roots: recentRoots, days: 7 })
        : await invoke<FileEntry[]>('list_directory', { path });
      // 이미 다른 디렉토리로 이동한 경우 무시
      if (requestId !== loadRequestRef.current) return;
      if (!isRecent) entriesCacheRef.current.set(path, result); // 캐시 갱신 (최근항목 제외)
      // 최근항목은 이미 서버에서 수정시간 내림차순 정렬된 상태
      const sortedResult = isRecent ? result : sortEntries(result, sortBy, sortDir);
      setEntries(sortedResult);
      // 캐시 히트가 없었던 경우에만 선택 초기화 (첫 진입)
      if (!cached) {
        setSelectedPaths([]);
        setFocusedIndex(-1);
      }
      // 뒤로/위로 이동 시 이전에 있던 폴더를 자동 선택
      if (lastVisitedChildRef.current) {
        const prevPath = lastVisitedChildRef.current;
        lastVisitedChildRef.current = null;
        const idx = sortedResult.findIndex(e => e.path === prevPath);
        if (idx >= 0) {
          setSelectedPaths([sortedResult[idx].path]);
          setFocusedIndex(idx);
        }
      }
      // 저장된 스크롤 위치 복원 (렌더링 후 실행)
      const savedScroll = scrollPositionRef.current.get(path);
      if (savedScroll != null && gridRef.current) {
        requestAnimationFrame(() => {
          if (gridRef.current) gridRef.current.scrollTop = savedScroll;
        });
      }
    } catch (e) {
      if (requestId !== loadRequestRef.current) return;
      setError(String(e));
      setEntries([]);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [sortBy, sortDir, recentRoots]);

  // --- 탭 관리 ---
  const {
    tabs, activeTabId, activeTab, currentPath,
    canGoBack, canGoForward,
    openTab, navigateTo, goBack: tabGoBack, goForward,
    handleTabSelect, handleTabClose, handleTabReorder,
    handleTabReceive, handleTabRemove,
    duplicateTab, closeOtherTabs, togglePinTab,
  } = useTabManagement({ instanceId, loadDirectory, onPathChange, onSplitModeChange });

  // --- 정렬 ---
  // 자연 정렬: 텍스트/숫자 청크 분리 비교 (9 < 11 < 011 < 111)
  function naturalCompare(a: string, b: string): number {
    const re = /(\d+)|(\D+)/g;
    const aParts = a.match(re) || [];
    const bParts = b.match(re) || [];
    const len = Math.min(aParts.length, bParts.length);
    for (let i = 0; i < len; i++) {
      const aIsNum = /^\d/.test(aParts[i]);
      const bIsNum = /^\d/.test(bParts[i]);
      if (aIsNum && bIsNum) {
        // 숫자 비교: 정수값 우선, 같으면 선행0 적은(문자열 짧은) 쪽이 앞
        const diff = parseInt(aParts[i], 10) - parseInt(bParts[i], 10);
        if (diff !== 0) return diff;
        if (aParts[i].length !== bParts[i].length) return aParts[i].length - bParts[i].length;
      } else if (aIsNum !== bIsNum) {
        return aIsNum ? -1 : 1;
      } else {
        const cmp = aParts[i].localeCompare(bParts[i], 'ko');
        if (cmp !== 0) return cmp;
      }
    }
    return aParts.length - bParts.length;
  }

  function sortEntries(list: FileEntry[], by: string, dir: string): FileEntry[] {
    return [...list].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      let cmp = 0;
      switch (by) {
        case 'name': cmp = naturalCompare(a.name, b.name); break;
        case 'size': cmp = a.size - b.size; break;
        case 'modified': cmp = a.modified - b.modified; break;
        case 'type': cmp = a.file_type.localeCompare(b.file_type); break;
        default: cmp = naturalCompare(a.name, b.name);
      }
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  // 정렬 변경 시 재정렬 + localStorage 저장
  useEffect(() => {
    setEntries(prev => sortEntries(prev, sortBy, sortDir));
    localStorage.setItem(`qf_sort_by_${instanceId}`, sortBy);
    localStorage.setItem(`qf_sort_dir_${instanceId}`, sortDir);
  }, [sortBy, sortDir, instanceId]);

  // 썸네일 크기·뷰 모드 변경 시 localStorage 저장
  useEffect(() => {
    localStorage.setItem(`qf_thumb_size_${instanceId}`, String(thumbnailSize));
  }, [thumbnailSize, instanceId]);

  useEffect(() => {
    localStorage.setItem(`qf_view_mode_${instanceId}`, viewMode);
  }, [viewMode, instanceId]);

  // 폴더 태그 변경 시 localStorage 저장
  useEffect(() => {
    localStorage.setItem('qf_folder_tags', JSON.stringify(folderTags));
  }, [folderTags]);

  // --- 검색/필터 (커스텀 훅) ---
  const searchFilter = useSearchFilter({ entries, currentPath });
  const { displayEntries } = searchFilter;

  // --- 클립보드 (커스텀 훅) ---
  const clipboardHook = useClipboard({
    selectedPaths,
    currentPath,
    loadDirectory,
    setSelectedPaths,
    sharedClipboard,
    onClipboardChange,
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

  // --- 컬럼 뷰 초기화/정리 ---
  // viewMode 변경 시: 컬럼뷰 퇴장 처리
  useEffect(() => {
    if (viewMode !== 'columns') {
      columnView.clearColumns();
    }
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // displayEntries 또는 currentPath 변경 시 컬럼 뷰 동기화
  useEffect(() => {
    if (viewMode !== 'columns' || !currentPath) return;
    // 현재 컬럼의 루트 경로와 currentPath가 불일치하면 전체 재초기화
    const columnsRootPath = columnView.columns[0]?.path ?? null;
    if (columnsRootPath !== currentPath) {
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
  }, [displayEntries, currentPath, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- initialPath 변경 시 현재 탭 경로 변경 (탭이 없으면 새 탭 생성) ---
  useEffect(() => {
    if (!initialPath) return;
    // 현재 활성 탭이 이미 같은 경로면 불필요
    if (activeTab && activeTab.path === initialPath) return;
    if (activeTab) {
      // 기존 활성 탭의 경로를 변경 (새 탭 추가 안 함)
      navigateTo(initialPath);
    } else {
      // 탭이 없으면 새 탭 생성
      openTab(initialPath);
    }
  }, [initialPath, initialPathKey]);

  // 앱 시작 시 저장된 탭이 있으면 마지막 활성 탭 로드
  useEffect(() => {
    if (activeTab && !initialPath) {
      loadDirectory(activeTab.path);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // goBack 래퍼: 이전 경로 자동 선택
  const goBack = useCallback(() => {
    const prevPath = tabGoBack();
    if (prevPath) lastVisitedChildRef.current = prevPath;
  }, [tabGoBack]);

  // goUp: 상위 경로로 이동
  const goUp = useCallback(() => {
    if (!currentPath) return;
    const sep = getPathSeparator(currentPath);
    const parts = currentPath.replace(/[/\\]+$/, '').split(sep);
    if (parts.length <= 1) return;
    parts.pop();
    const parent = parts.join(sep) || sep;
    lastVisitedChildRef.current = currentPath;
    handleNavigateTo(parent);
  }, [currentPath, handleNavigateTo]);

  // --- 파일/폴더 열기 ---
  const openEntry = useCallback(async (entry: FileEntry) => {
    if (entry.is_dir) {
      handleNavigateTo(entry.path);
    } else if (entry.file_type === 'video') {
      // 동영상은 내장 플레이어로 재생
      preview.setVideoPlayerPath(entry.path);
    } else {
      try {
        await invoke('open_folder', { path: entry.path });
      } catch (e) {
        console.error('파일 열기 실패:', e);
      }
    }
  }, [handleNavigateTo]);

  // Ctrl+더블클릭 → 폴더를 새 탭으로 열기
  const openEntryInNewTab = useCallback((entry: FileEntry) => {
    if (entry.is_dir) {
      openTab(entry.path);
    }
  }, [openTab]);

  const openInOsExplorer = useCallback(async (path: string) => {
    try {
      await invoke('open_folder', { path });
    } catch (e) {
      console.error('탐색기 열기 실패:', e);
    }
  }, []);

  // --- 선택 ---
  const selectEntry = useCallback((path: string, multi: boolean, range: boolean) => {
    // 마우스 클릭 시 focusedIndex도 동기화 (키보드 이동 기준점 갱신)
    const clickedIdx = entries.findIndex(e => e.path === path);
    if (clickedIdx >= 0) setFocusedIndex(clickedIdx);

    if (multi) {
      setSelectedPaths(prev =>
        prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
      );
    } else if (range) {
      const paths = entries.map(e => e.path);
      const lastSelected = selectedPaths[selectedPaths.length - 1];
      const lastIdx = paths.indexOf(lastSelected);
      const curIdx = paths.indexOf(path);
      if (lastIdx === -1 || curIdx === -1) {
        setSelectedPaths([path]);
      } else {
        const start = Math.min(lastIdx, curIdx);
        const end = Math.max(lastIdx, curIdx);
        setSelectedPaths(paths.slice(start, end + 1));
      }
    } else {
      setSelectedPaths([path]);
    }
  }, [entries, selectedPaths]);

  const selectAll = useCallback(() => {
    setSelectedPaths(displayEntries.map(e => e.path));
  }, [displayEntries]);

  const deselectAll = useCallback(() => {
    setSelectedPaths([]);
    setFocusedIndex(-1);
  }, []);

  // 박스 드래그 선택용 다중 경로 설정
  const handleSelectPaths = useCallback((paths: string[]) => {
    setSelectedPaths(paths);
    setFocusedIndex(-1);
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

  // --- 키보드 단축키 (커스텀 훅) ---
  useKeyboardShortcuts({
    isFocused,
    renamingPath: modals.renamingPath,
    currentPath,
    viewMode,
    entries,
    selectedPaths,
    focusedIndex,
    clipboard: clipboardHook.clipboard,
    isSearchActive: searchFilter.isSearchActive,
    isMac,
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
    searchInputRef: searchFilter.searchInputRef,
    handleTabSelect,
    handleTabClose,
    duplicateTab,
    closeOtherTabs,
    columnView,
    setMarkdownEditorPath: modals.setMarkdownEditorPath,
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

  // --- 컨텍스트 메뉴 섹션 빌더 ---
  const contextMenuSections = useMemo((): ContextMenuSection[] => {
    if (!contextMenu) return [];
    const { paths } = contextMenu;
    const isSingle = paths.length === 1;
    const singlePath = paths[0] ?? '';
    const singleEntry = isSingle ? entries.find(e => e.path === singlePath) : null;
    const mod = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl';

    const sections: ContextMenuSection[] = [];

    // 섹션 1: 열기, 미리보기, Finder에서 열기
    const openSection: ContextMenuSection = { id: 'open', items: [] };
    if (isSingle) {
      openSection.items.push({
        id: 'open',
        icon: <ExternalLink size={13} />,
        label: '열기',
        onClick: () => { const entry = entries.find(e => e.path === singlePath); if (entry) openEntry(entry); },
      });
    }
    if (isSingle && singleEntry && !singleEntry.is_dir &&
      (/\.(psd|psb)$/i.test(singleEntry.name) || singleEntry.file_type === 'image')) {
      openSection.items.push({
        id: 'preview',
        icon: <Eye size={13} />,
        label: '미리보기',
        onClick: () => preview.handlePreviewImage(singlePath),
      });
    }
    if (isSingle) {
      openSection.items.push({
        id: 'open-in-os',
        icon: <Folder size={13} />,
        label: 'Finder/탐색기에서 열기',
        onClick: () => openInOsExplorer(
          singleEntry?.is_dir ? singlePath : (singlePath.split(/[/\\]/).slice(0, -1).join('/') || singlePath)
        ),
      });
    }
    sections.push(openSection);

    // 섹션 2: 복사, 잘라내기, 붙여넣기, 복제
    sections.push({
      id: 'clipboard',
      items: [
        { id: 'copy', icon: <Copy size={13} />, label: '복사', onClick: clipboardHook.handleCopy, disabled: paths.length === 0, shortcut: `${mod}+C` },
        { id: 'cut', icon: <Scissors size={13} />, label: '잘라내기', onClick: clipboardHook.handleCut, disabled: paths.length === 0, shortcut: `${mod}+X` },
        { id: 'paste', icon: <ClipboardIcon size={13} />, label: '붙여넣기', onClick: clipboardHook.handlePaste, shortcut: `${mod}+V` },
        { id: 'duplicate', icon: <CopyPlus size={13} />, label: '복제', onClick: fileOps.handleDuplicate, disabled: paths.length === 0, shortcut: `${mod}+D` },
      ],
    });

    // 섹션 3: 이름 바꾸기, 삭제
    const editSection: ContextMenuSection = { id: 'edit', items: [] };
    if (isSingle) {
      editSection.items.push({
        id: 'rename',
        icon: <Edit2 size={13} />,
        label: '이름 바꾸기',
        onClick: () => fileOps.handleRenameStart(singlePath),
        shortcut: 'F2',
      });
    }
    if (!isSingle && paths.length > 1) {
      editSection.items.push({
        id: 'bulk-rename',
        icon: <Edit2 size={13} />,
        label: '이름 모두 바꾸기',
        onClick: () => fileOps.handleBulkRename(paths),
      });
    }
    editSection.items.push({
      id: 'delete',
      icon: <Trash2 size={13} style={{ color: '#f87171' }} />,
      label: '삭제 (휴지통)',
      onClick: () => fileOps.handleDelete(paths, false),
      disabled: paths.length === 0,
      shortcut: 'Del',
    });
    sections.push(editSection);

    // 섹션 4: ZIP 압축, 동영상 압축, 픽셀화, 시트 패킹/언패킹
    const toolSection: ContextMenuSection = { id: 'tools', items: [] };
    toolSection.items.push({
      id: 'zip',
      icon: <FileArchive size={13} />,
      label: 'ZIP으로 압축',
      onClick: () => fileOps.handleCompressZip(paths),
      disabled: paths.length === 0,
    });
    // ZIP 압축 풀기 (.zip 파일이 선택된 경우에만 표시)
    const zipPaths = paths.filter(p => /\.zip$/i.test(p));
    if (zipPaths.length > 0) {
      toolSection.items.push({
        id: 'extract-zip',
        icon: <FileArchive size={13} />,
        label: '압축 풀기',
        onClick: () => fileOps.handleExtractZip(zipPaths),
      });
    }
    // 동영상 압축 (서브메뉴)
    if (isSingle && singleEntry && singleEntry.file_type === 'video') {
      toolSection.items.push({
        id: 'compress-video',
        icon: <Film size={13} />,
        label: '동영상 압축',
        onClick: () => {}, // 부모 항목 클릭 없음 (서브메뉴 전용)
        submenu: [
          { id: 'quality-low', icon: <></>, label: '보통 화질', onClick: () => fileOps.handleCompressVideo(singlePath, 'low') },
          { id: 'quality-medium', icon: <></>, label: '좋은 화질', onClick: () => fileOps.handleCompressVideo(singlePath, 'medium') },
          { id: 'quality-high', icon: <></>, label: '최고 화질', onClick: () => fileOps.handleCompressVideo(singlePath, 'high') },
        ],
      });
    }
    // 픽셀화 (PNG/JPG)
    if (isSingle && singleEntry && /\.(png|jpe?g)$/i.test(singleEntry.name)) {
      toolSection.items.push({
        id: 'pixelate',
        icon: <Grid3x3 size={13} />,
        label: '픽셀화',
        onClick: () => modals.setPixelatePath(singlePath),
      });
    }
    // 스프라이트 시트 패킹 — 폴더 단일 선택
    if (isSingle && singleEntry?.is_dir) {
      toolSection.items.push({
        id: 'sprite-pack',
        icon: <LayoutGrid size={13} />,
        label: '시트 패킹',
        onClick: () => fileOps.handleSpritePack([singlePath]),
      });
    }
    // 스프라이트 시트 패킹 — 다중 이미지 선택
    if (!isSingle && paths.length > 1) {
      const allImages = paths.every(p => /\.(png|jpe?g|gif|webp|bmp)$/i.test(p));
      if (allImages) {
        toolSection.items.push({
          id: 'sprite-pack-multi',
          icon: <LayoutGrid size={13} />,
          label: '시트 패킹',
          onClick: () => fileOps.handleSpritePack(paths),
        });
      }
    }
    // 스프라이트 시트 언패킹 — PNG 단일 선택
    if (isSingle && singleEntry && /\.(png)$/i.test(singleEntry.name) && !singleEntry.is_dir) {
      toolSection.items.push({
        id: 'sheet-unpack',
        icon: <Ungroup size={13} />,
        label: '시트 언패킹',
        onClick: () => modals.setSheetUnpackPath(singlePath),
      });
    }
    // ICO/ICNS 변환 — PNG 단일 선택
    if (isSingle && singleEntry && /\.(png)$/i.test(singleEntry.name) && !singleEntry.is_dir) {
      toolSection.items.push({
        id: 'convert-ico',
        icon: <Image size={13} />,
        label: '.ico 변환',
        onClick: async () => {
          try {
            await invoke('convert_to_ico', { path: singlePath });
            loadDirectory(currentPath!);
          } catch (e) { console.error('ICO 변환 실패:', e); }
        },
      });
      toolSection.items.push({
        id: 'convert-icns',
        icon: <Image size={13} />,
        label: '.icns 변환',
        onClick: async () => {
          try {
            await invoke('convert_to_icns', { path: singlePath });
            loadDirectory(currentPath!);
          } catch (e) { console.error('ICNS 변환 실패:', e); }
        },
      });
    }
    sections.push(toolSection);

    // 섹션 5: 경로 복사, 즐겨찾기, 태그
    const infoSection: ContextMenuSection = { id: 'info', items: [] };
    if (isSingle) {
      infoSection.items.push({
        id: 'copy-path',
        icon: <Hash size={13} />,
        label: '경로 복사',
        onClick: () => fileOps.handleCopyPath(singlePath),
      });
    }
    // 엔트리 복제 — 폴더 선택 시 내부 파일명 목록, 파일 선택 시 선택된 파일명 목록
    if (paths.length > 0) {
      infoSection.items.push({
        id: 'copy-entry-names',
        icon: <List size={13} />,
        label: '엔트리 복제',
        onClick: async () => {
          try {
            let names: string[] = [];
            if (isSingle && singleEntry?.is_dir) {
              const entries: FileEntry[] = await invoke('list_directory', { path: singlePath });
              names = entries.map(e => {
                const dot = e.name.lastIndexOf('.');
                return dot > 0 && !e.is_dir ? e.name.slice(0, dot) : e.name;
              });
            } else {
              names = paths.map(p => {
                const sep = p.includes('\\') ? '\\' : '/';
                const fileName = p.split(sep).pop() ?? p;
                const dot = fileName.lastIndexOf('.');
                return dot > 0 ? fileName.slice(0, dot) : fileName;
              });
            }
            // CRLF 구분 — 구글 시트에서 각 행에 하나씩 붙여넣기
            const text = names.join('\r\n');
            // Tauri 클립보드 플러그인 사용 (navigator.clipboard는 웹뷰에서 실패 가능)
            await invoke('copy_path', { path: text });
            fileOps.showCopyToast(`${names.length}개 파일명 복사됨`);
          } catch (e) { console.error('엔트리 복제 실패:', e); }
        },
      });
    }
    if (isSingle && singleEntry?.is_dir) {
      infoSection.items.push({
        id: 'add-favorite',
        icon: <Star size={13} />,
        label: '즐겨찾기에 추가',
        onClick: () => {
          onAddToFavorites(singlePath, getFileName(singlePath));
        },
      });
    }
    // 폴더 태그 추가/해제
    if (isSingle && singleEntry?.is_dir) {
      const hasTag = folderTags && folderTags[singlePath];
      if (hasTag) {
        infoSection.items.push({
          id: 'remove-tag',
          icon: <Tag size={13} />,
          label: '태그 해제',
          onClick: () => handleRemoveTag(singlePath),
        });
      } else {
        infoSection.items.push({
          id: 'add-tag',
          icon: <Tag size={13} />,
          label: '태그 추가',
          onClick: () => handleAddTag(singlePath),
        });
      }
    }
    sections.push(infoSection);

    // 섹션 6: 빈 공간 전용 (새로 만들기)
    if (paths.length === 0) {
      const createSection: ContextMenuSection = { id: 'create', items: [] };
      createSection.items.push({
        id: 'new-folder',
        icon: <FolderPlus size={13} />,
        label: '새 폴더',
        onClick: () => fileOps.handleCreateDirectory(),
      });
      createSection.items.push({
        id: 'new-markdown',
        icon: <FileText size={13} />,
        label: '마크다운',
        onClick: () => fileOps.handleCreateMarkdown(),
      });
      sections.push(createSection);
    }

    return sections;
  }, [
    contextMenu, entries, clipboardHook.clipboard, folderTags,
    openEntry, openInOsExplorer, preview.handlePreviewImage,
    clipboardHook.handleCopy, clipboardHook.handleCut, clipboardHook.handlePaste, fileOps.handleDuplicate,
    fileOps.handleRenameStart, fileOps.handleBulkRename, fileOps.handleDelete,
    fileOps.handleCompressZip, fileOps.handleCompressVideo, fileOps.handleCopyPath,
    fileOps.handleSpritePack, fileOps.handleCreateDirectory, fileOps.handleCreateMarkdown,
    handleAddTag, handleRemoveTag,
    onAddToFavorites, modals.setPixelatePath, modals.setSheetUnpackPath,
  ]);

  // --- 미리보기 열려있을 때 선택 변경 시 자동 갱신 ---
  useEffect(() => {
    if (!preview.isAnyPreviewOpen || selectedPaths.length !== 1) return;
    // 동영상 재생 중이면 자동 갱신하지 않음 (시청 중 의도치 않은 전환 방지)
    if (preview.videoPlayerPath) return;
    const entry = entries.find(e => e.path === selectedPaths[0]);
    if (!entry) return;
    // 폴더 선택 시 미리보기 닫기
    if (entry.is_dir) {
      preview.closeAllPreviews();
      return;
    }
    previewFile(entry);
  }, [selectedPaths, preview.isAnyPreviewOpen, preview.videoPlayerPath, entries, previewFile, preview]);

  // --- 글로벌 검색에서 파일 선택 후 자동 선택 ---
  useEffect(() => {
    if (!pendingSelectRef.current) return;
    const targetPath = pendingSelectRef.current;
    const idx = entries.findIndex(e => e.path === targetPath);
    if (idx >= 0) {
      setSelectedPaths([entries[idx].path]);
      setFocusedIndex(idx);
      pendingSelectRef.current = null;
      // 스크롤
      requestAnimationFrame(() => {
        const el = gridRef.current?.querySelector(`[data-file-path="${CSS.escape(targetPath)}"]`);
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
  }, [entries]);

  // --- 붙여넣기 후 파일 자동 선택 ---
  useEffect(() => {
    if (clipboardHook.pendingPasteSelectRef.current.length === 0) return;
    const targets = clipboardHook.pendingPasteSelectRef.current;
    const matched = entries.filter(e => targets.includes(e.path));
    if (matched.length > 0) {
      const matchedPaths = matched.map(e => e.path);
      setSelectedPaths(matchedPaths);
      // 첫 번째 항목에 포커스
      const firstIdx = entries.findIndex(e => e.path === matchedPaths[0]);
      if (firstIdx >= 0) setFocusedIndex(firstIdx);
      clipboardHook.pendingPasteSelectRef.current = [];
      // 첫 번째 항목으로 스크롤
      requestAnimationFrame(() => {
        const el = gridRef.current?.querySelector(`[data-file-path="${CSS.escape(matchedPaths[0])}"]`);
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
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
          const result = await invoke<FileEntry[]>('list_directory', { path: currentPath });
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
    const handler = () => { if (currentPath) loadDirectory(currentPath); };
    window.addEventListener('qf-files-changed', handler);
    return () => window.removeEventListener('qf-files-changed', handler);
  }, [currentPath, loadDirectory]);

  // --- Ctrl+마우스 휠 썸네일 확대/축소 ---
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      // 마우스 휠만 허용 (deltaMode=1: 라인 단위)
      if (e.deltaMode === 0) return;
      cancelAllQueued();
      const direction = e.deltaY < 0 ? 1 : -1;
      setThumbnailSize(prev => {
        const idx = THUMBNAIL_SIZES.indexOf(prev);
        return THUMBNAIL_SIZES[Math.max(0, Math.min(THUMBNAIL_SIZES.length - 1, idx + direction))];
      });
    };
    window.addEventListener('wheel', handler, { passive: false });
    return () => window.removeEventListener('wheel', handler);
  }, []);

  // --- 내부 드래그 → 폴더 이동 / 사이드바 즐겨찾기 등록 ---
  const { isDragging: isInternalDragging, dropTargetPath, handleDragMouseDown } = useInternalDragDrop({
    selectedPaths,
    currentPath,
    onMoveComplete: () => loadDirectory(currentPath),
    onAddToCategory,
  });

  // --- OS에서 파일 드래그 수신 (Tauri onDragDropEvent) ---
  useEffect(() => {
    if (!currentPath) return;
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

      // 이미 같은 디렉토리에 있는 파일은 제외
      const filtered = droppedPaths.filter(p => {
        return getParentDir(p) !== currentPath;
      });
      if (filtered.length === 0) return;

      // 클라우드 경로 ↔ 로컬 = 복사, 로컬 ↔ 로컬 = 이동
      const srcIsCloud = filtered.some(p => isCloudPath(p));
      const destIsCloud = isCloudPath(currentPath);
      const shouldCopy = srcIsCloud || destIsCloud;

      try {
        if (shouldCopy) {
          await invoke('copy_items', { sources: filtered, dest: currentPath });
        } else {
          await invoke('move_items', { sources: filtered, dest: currentPath });
        }
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

  // 외부 클릭 시 선택 해제
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedPaths([]);
    }
    closeContextMenu();
  }, [closeContextMenu]);

  return (
    <div
      ref={containerRef}
      data-pane-drop-target={currentPath || undefined}
      data-pane-instance={instanceId}
      className="h-full flex flex-col outline-none relative"
      tabIndex={0}
      onClick={handleContainerClick}
      style={{
        backgroundColor: themeVars?.bg ?? '#0f172a',
      }}
    >
      {/* 복사 완료 토스트 */}
      {fileOps.copyToast && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-[9999] px-3 py-1.5 rounded-md text-xs shadow-lg animate-fade-in"
          style={{
            backgroundColor: themeVars?.surface ?? '#1e293b',
            color: themeVars?.text ?? '#f8fafc',
            border: `1px solid ${themeVars?.border ?? '#334155'}`,
          }}
        >
          {fileOps.copyToast}
        </div>
      )}

      {/* 영구삭제 확인 다이얼로그 */}
      {fileOps.permanentDeleteConfirm && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={() => fileOps.setPermanentDeleteConfirm(null)}
        >
          <div
            className="rounded-lg shadow-2xl p-5 max-w-sm w-full mx-4"
            style={{
              backgroundColor: themeVars?.surface2 ?? '#1e293b',
              border: `1px solid ${themeVars?.border ?? '#334155'}`,
            }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm mb-4" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
              파일을 삭제하면 되돌릴 수 없습니다. 정말 삭제하시겠습니까?
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 text-xs rounded-md transition-colors"
                style={{
                  backgroundColor: themeVars?.surface ?? '#334155',
                  color: themeVars?.text ?? '#e5e7eb',
                  border: `1px solid ${themeVars?.border ?? '#475569'}`,
                }}
                onClick={() => fileOps.setPermanentDeleteConfirm(null)}
              >
                취소
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded-md text-white transition-colors"
                style={{ backgroundColor: '#ef4444' }}
                onClick={fileOps.executePermanentDelete}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 관리자 권한 삭제 확인 다이얼로그 (Windows) */}
      {fileOps.elevatedDeleteConfirm && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={() => fileOps.setElevatedDeleteConfirm(null)}
        >
          <div
            className="rounded-lg shadow-2xl p-5 max-w-sm w-full mx-4"
            style={{
              backgroundColor: themeVars?.surface2 ?? '#1e293b',
              border: `1px solid ${themeVars?.border ?? '#334155'}`,
            }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm mb-4" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
              파일 삭제에 실패했습니다. 관리자 권한으로 삭제하시겠습니까?
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 text-xs rounded-md transition-colors"
                style={{
                  backgroundColor: themeVars?.surface ?? '#334155',
                  color: themeVars?.text ?? '#e5e7eb',
                  border: `1px solid ${themeVars?.border ?? '#475569'}`,
                }}
                onClick={() => fileOps.setElevatedDeleteConfirm(null)}
              >
                취소
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded-md text-white transition-colors"
                style={{ backgroundColor: '#ef4444' }}
                onClick={fileOps.executeElevatedDelete}
              >
                관리자 권한으로 삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 탭 바 */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={handleTabSelect}
        onTabClose={handleTabClose}
        onTabReorder={handleTabReorder}
        onTabReceive={handleTabReceive}
        onTabRemove={handleTabRemove}
        onTogglePin={togglePinTab}
        instanceId={instanceId}
        themeVars={themeVars}
        folderTags={folderTags}
      />

      {currentPath ? (
        <>
          {/* 내비게이션 바 */}
          <NavigationBar
            currentPath={currentPath}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onBack={goBack}
            onForward={goForward}
            onUp={goUp}
            onNavigate={handleNavigateTo}
            onCreateDirectory={fileOps.handleCreateDirectory}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={(by, dir) => { setSortBy(by); setSortDir(dir); }}
            thumbnailSize={thumbnailSize}
            onThumbnailSizeChange={setThumbnailSize}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            isSearchActive={searchFilter.isSearchActive}
            searchQuery={searchFilter.searchQuery}
            onSearchQueryChange={searchFilter.setSearchQuery}
            onSearchToggle={() => {
              searchFilter.setIsSearchActive(prev => {
                if (prev) { searchFilter.setSearchQuery(''); return false; }
                setTimeout(() => searchFilter.searchInputRef.current?.focus(), 0);
                return true;
              });
            }}
            searchInputRef={searchFilter.searchInputRef}
            activeExtFilters={searchFilter.activeExtFilters}
            availableExtensions={searchFilter.availableExtensions}
            onExtFilterToggle={(ext: string) => {
              searchFilter.setActiveExtFilters(prev => {
                const next = new Set(prev);
                if (next.has(ext)) next.delete(ext);
                else next.add(ext);
                return next;
              });
            }}
            onExtFilterClear={() => searchFilter.setActiveExtFilters(new Set())}
            hideText={searchFilter.hideText}
            onHideTextToggle={() => searchFilter.setHideText(v => !v)}
            splitMode={splitMode}
            onSplitModeChange={onSplitModeChange}
            themeVars={themeVars}
          />

          {/* 파일 그리드 / 컬럼 뷰 */}
          {viewMode === 'columns' ? (
            <ColumnView
              columns={columnView.columns}
              preview={columnView.preview}
              focusedCol={columnView.focusedCol}
              focusedRow={columnView.focusedRow}
              selectedPaths={selectedPaths}
              loading={loading}
              error={error}
              themeVars={themeVars}
              instanceId={instanceId}
              onSelectInColumn={(colIndex, entry, multi, range) => {
                const col = columnView.columns[colIndex];
                if (!col) return;
                const rowIdx = col.entries.findIndex(e => e.path === entry.path);

                if (multi) {
                  // Ctrl+Click: 개별 토글 다중 선택 (컬럼 구조 변경 없음)
                  setSelectedPaths(prev =>
                    prev.includes(entry.path) ? prev.filter(p => p !== entry.path) : [...prev, entry.path]
                  );
                  columnView.setFocusedCol(colIndex);
                  if (rowIdx >= 0) columnView.setFocusedRow(rowIdx);
                } else if (range) {
                  // Shift+Click: 앵커~클릭 위치 범위 선택 (컬럼 구조 변경 없음)
                  if (selectionAnchorRef.current < 0) selectionAnchorRef.current = columnView.focusedRow;
                  const from = Math.min(selectionAnchorRef.current, rowIdx);
                  const to = Math.max(selectionAnchorRef.current, rowIdx);
                  setSelectedPaths(col.entries.slice(from, to + 1).map(e => e.path));
                  columnView.setFocusedCol(colIndex);
                  if (rowIdx >= 0) columnView.setFocusedRow(rowIdx);
                } else {
                  // 일반 클릭: 기존 동작 (컬럼 탐색)
                  selectionAnchorRef.current = -1;
                  columnView.selectInColumn(colIndex, entry);
                  setSelectedPaths([entry.path]);
                }
              }}
              onOpenEntry={openEntry}
              onContextMenu={handleContextMenu}
              onDragMouseDown={handleDragMouseDown}
            />
          ) : (
            <FileGrid
              entries={displayEntries}
              selectedPaths={selectedPaths}
              clipboard={clipboardHook.clipboard}
              renamingPath={modals.renamingPath}
              thumbnailSize={thumbnailSize}
              viewMode={viewMode}
              sortBy={sortBy}
              sortDir={sortDir}
              focusedIndex={focusedIndex}
              gridRef={gridRef}
              loading={loading}
              error={error}
              dropTargetPath={dropTargetPath}
              onDragMouseDown={handleDragMouseDown}
              onSelect={selectEntry}
              onSelectPaths={handleSelectPaths}
              onDeselectAll={deselectAll}
              onOpen={openEntry}
              onOpenInNewTab={openEntryInNewTab}
              onContextMenu={handleContextMenu}
              onRenameCommit={fileOps.handleRenameCommit}
              onSortChange={(by) => {
                const typedBy = by as 'name' | 'size' | 'modified' | 'type';
                if (sortBy === typedBy) {
                  setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
                } else {
                  setSortBy(typedBy);
                  setSortDir('asc');
                }
              }}
              themeVars={themeVars}
              hideText={searchFilter.hideText}
              folderTags={folderTags}
              instanceId={instanceId}
            />
          )}

          {/* 동영상 압축 진행률 */}
          {fileOps.videoCompression && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 text-xs"
              style={{ backgroundColor: 'var(--qf-surface-2)', color: 'var(--qf-text)', borderTop: '1px solid var(--qf-border)' }}
            >
              {fileOps.videoCompression.percent === -1 ? (
                <span>⏳ ffmpeg 다운로드 중...</span>
              ) : (
                <>
                  <span className="shrink-0">🎬 압축 중... {fileOps.videoCompression.fileName}</span>
                  <span className="text-[var(--qf-muted)]">
                    ({Math.floor(fileOps.videoCompression.percent)}초{fileOps.videoCompression.speed ? ` · ${fileOps.videoCompression.speed}` : ''})
                  </span>
                </>
              )}
            </div>
          )}

          {/* 상태 바 */}
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

      <PreviewModals preview={preview} themeVars={themeVars} />

      {/* 컨텍스트 메뉴 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sections={contextMenuSections}
          onClose={closeContextMenu}
        />
      )}

      {/* 태그 입력 다이얼로그 */}
      {modals.tagPrompt && (
        <TagInputDialog
          defaultName={modals.tagPrompt.defaultName}
          themeVars={themeVars}
          onConfirm={(tag) => {
            setFolderTags(prev => ({ ...prev, [modals.tagPrompt!.path]: tag }));
            modals.setTagPrompt(null);
          }}
          onCancel={() => modals.setTagPrompt(null)}
        />
      )}

      {/* 픽셀화 모달 */}
      {modals.pixelatePath && (
        <PixelateModal
          path={modals.pixelatePath}
          onClose={() => modals.setPixelatePath(null)}
          onApply={fileOps.handlePixelateApply}
          themeVars={themeVars}
        />
      )}

      {/* 시트 패킹 모달 */}
      {modals.sheetPackPaths && (
        <SheetPackerModal
          imagePaths={modals.sheetPackPaths}
          defaultName={fileOps.sheetPackDefaultName}
          currentPath={currentPath!}
          onClose={() => { modals.setSheetPackPaths(null); if (currentPath) loadDirectory(currentPath); }}
          themeVars={themeVars}
        />
      )}

      {/* 시트 언패킹 모달 */}
      {modals.sheetUnpackPath && (
        <SheetUnpackModal
          path={modals.sheetUnpackPath}
          currentPath={currentPath!}
          onClose={() => { modals.setSheetUnpackPath(null); if (currentPath) loadDirectory(currentPath); }}
          themeVars={themeVars}
        />
      )}

      {/* 일괄 이름변경 모달 */}
      {modals.bulkRenamePaths && (
        <BulkRenameModal
          paths={modals.bulkRenamePaths}
          onClose={() => modals.setBulkRenamePaths(null)}
          onApply={fileOps.handleBulkRenameApply}
          themeVars={themeVars}
        />
      )}

      {/* 폴더로 이동 모달 */}
      <GoToFolderModal
        isOpen={modals.isGoToFolderOpen}
        onClose={() => modals.setIsGoToFolderOpen(false)}
        onNavigate={handleNavigateTo}
        themeVars={themeVars}
      />

      {/* 글로벌 검색 모달 */}
      {currentPath && currentPath !== RECENT_PATH && (
        <GlobalSearchModal
          isOpen={modals.isGlobalSearchOpen}
          onClose={() => modals.setIsGlobalSearchOpen(false)}
          currentPath={currentPath}
          onSelect={handleGlobalSearchSelect}
          themeVars={themeVars}
        />
      )}

      {/* 마크다운 편집기 */}
      {modals.markdownEditorPath && (
        <MarkdownEditor
          path={modals.markdownEditorPath}
          themeVars={themeVars}
          onClose={() => {
            modals.setMarkdownEditorPath(null);
            if (currentPath) loadDirectory(currentPath);
          }}
        />
      )}


      {/* 중복 파일 확인 다이얼로그 */}
      {clipboardHook.duplicateConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div
            className="rounded-lg shadow-2xl max-w-sm w-full mx-4 overflow-hidden"
            style={{
              backgroundColor: themeVars?.surface2 ?? '#1f2937',
              border: `1px solid ${themeVars?.border ?? '#334155'}`,
            }}
          >
            <div className="px-5 pt-5 pb-3">
              <p className="text-sm font-medium mb-2" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                같은 이름의 파일이 {clipboardHook.duplicateConfirm.duplicates.length}개 존재합니다.
              </p>
              <p className="text-xs mb-3" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
                덮어씌우시겠습니까?
              </p>
              <div
                className="text-xs rounded-md px-3 py-2 max-h-[120px] overflow-y-auto"
                style={{ backgroundColor: themeVars?.surface ?? '#111827' }}
              >
                {clipboardHook.duplicateConfirm.duplicates.map((name, i) => (
                  <div key={i} className="py-0.5 truncate" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                    {name}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: themeVars?.border ?? '#334155' }}>
              <button
                className="px-4 py-1.5 text-xs rounded-md transition-colors hover:opacity-80"
                style={{
                  backgroundColor: themeVars?.surface ?? '#111827',
                  color: themeVars?.text ?? '#e5e7eb',
                  border: `1px solid ${themeVars?.border ?? '#334155'}`,
                }}
                onClick={() => clipboardHook.setDuplicateConfirm(null)}
              >
                취소
              </button>
              <button
                className="px-4 py-1.5 text-xs rounded-md transition-colors hover:opacity-80"
                style={{
                  backgroundColor: themeVars?.accent ?? '#3b82f6',
                  color: '#fff',
                }}
                onClick={async () => {
                  const { paths, action } = clipboardHook.duplicateConfirm!;
                  clipboardHook.setDuplicateConfirm(null);
                  await clipboardHook.executePaste(paths, action, true);
                }}
              >
                덮어쓰기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 태그 입력 다이얼로그 (인라인 컴포넌트)
function TagInputDialog({ defaultName, themeVars, onConfirm, onCancel }: {
  defaultName: string;
  themeVars: ThemeVars | null;
  onConfirm: (tag: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.select(); }, []);
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="rounded-lg shadow-2xl w-72 overflow-hidden"
        style={{
          backgroundColor: themeVars?.surface2 ?? '#1f2937',
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
        }}
      >
        <div className="px-4 pt-4 pb-2">
          <p className="text-xs font-medium mb-2" style={{ color: themeVars?.text ?? '#e5e7eb' }}>프로젝트 태그 입력</p>
          <input
            ref={inputRef}
            className="w-full px-2 py-1.5 text-xs rounded-md outline-none"
            style={{
              backgroundColor: themeVars?.surface ?? '#111827',
              color: themeVars?.text ?? '#e5e7eb',
              border: `1px solid ${themeVars?.border ?? '#334155'}`,
            }}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && value.trim()) onConfirm(value.trim());
              if (e.key === 'Escape') onCancel();
            }}
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 px-4 py-3">
          <button
            className="px-3 py-1 text-xs rounded-md transition-colors hover:opacity-80"
            style={{ backgroundColor: themeVars?.surface ?? '#111827', color: themeVars?.text ?? '#e5e7eb', border: `1px solid ${themeVars?.border ?? '#334155'}` }}
            onClick={onCancel}
          >취소</button>
          <button
            className="px-3 py-1 text-xs rounded-md transition-colors hover:opacity-80"
            style={{ backgroundColor: themeVars?.accent ?? '#3b82f6', color: '#fff', border: 'none' }}
            onClick={() => value.trim() && onConfirm(value.trim())}
          >확인</button>
        </div>
      </div>
    </div>
  );
}
