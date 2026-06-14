import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry, ClipboardData, ThumbnailSize, ViewMode } from '../../types';
import { ThemeVars, ContextMenuSection } from './types';
import {
  ExternalLink, Folder, Copy, CopyPlus, Scissors, Clipboard as ClipboardIcon,
  Edit2, Trash2, Hash, Star, FileArchive, Eye, Film, Grid3x3, LayoutGrid, Ungroup, Tag,
  FolderPlus, FileText, Image, List, Eraser, Type, HardDrive, Loader2, X,
} from 'lucide-react';
import NavigationBar from './NavigationBar';
import FileGrid from './FileGrid';
import ContextMenu from './ContextMenu';
import BulkRenameModal from './BulkRenameModal';
import PixelateModal from './PixelateModal';
import MapMakerModal from './MapMakerModal';
import RemoveWhiteBgModal from './RemoveWhiteBgModal';
import SheetPackerModal from './SheetPackerModal';
import SheetUnpackModal from './SheetUnpackModal';
import MarkdownEditor from './MarkdownEditor';
import FontPreviewModal from './FontPreviewModal';
import GifCompressModal from './GifCompressModal';
import PdfPreviewModal from './PdfPreviewModal';
import AudioPreviewModal from './AudioPreviewModal';
import CodePreviewModal from './CodePreviewModal';
import FbxPreviewModal from './FbxPreviewModal';
import FontMergeModal from './FontMergeModal';
import FolderMergeModal from './FolderMergeModal';
import TerminalPresetModal from './TerminalPresetModal';
import StatusBar from './StatusBar';
import TabBar from './TabBar';
import { useInternalDragDrop, type PendingDrop } from './hooks/useInternalDragDrop';
import { usePreview } from './hooks/usePreview';
import { useTabManagement } from './hooks/useTabManagement';
import { PreviewModals } from './PreviewModals';
import { cancelAllQueued, queuedInvokeLow } from './hooks/invokeQueue';
import { runTransferWithProgress } from './hooks/runTransferWithProgress';
import { detectFolderMergeScenario } from '../../utils/folderMerge';
import { useColumnView } from './hooks/useColumnView';
import ColumnView from './ColumnView';
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
import GoToFolderModal from './GoToFolderModal';
import GlobalSearchModal from './GlobalSearchModal';
import DuplicateFilesModal from './DuplicateFilesModal';
import DiffViewerModal from './DiffViewerModal';
import { useUndoStack } from './hooks/useUndoStack';
import { useModalStates } from './hooks/useModalStates';
import { useSearchFilter } from './hooks/useSearchFilter';
import { useInlineFuzzyFilter, isFuzzyFilterBlocked } from './hooks/useInlineFuzzyFilter';
import InlineFuzzyFilterInput from './InlineFuzzyFilterInput';
import { useClipboard } from './hooks/useClipboard';
import { useFileOperations, type FolderSizeDialogState } from './hooks/useFileOperations';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useContextMenuBuilder } from './hooks/useContextMenuBuilder';

// 최근항목 특수 경로 상수
const RECENT_PATH = '__recent__';
const SYSTEM_ROOT_PATH = '__system_root__';

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

  // 분할 뷰: 포커스가 빠지면 선택 + 포커스 인덱스 해제
  useEffect(() => {
    if (!isFocused && splitMode !== 'single') {
      setSelectedPaths([]);
      setFocusedIndex(-1);
    }
  }, [isFocused, splitMode]);

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
  const viewModeRef = useRef<ViewMode>(viewMode);
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  const pendingSelectRef = useRef<string | null>(null);

  // --- 미리보기 (비디오/이미지/텍스트) ---
  const preview = usePreview();
  const isMac = navigator.platform.startsWith('Mac');

  // 텍스트 미리보기 대상 확장자
  const TEXT_PREVIEW_EXTS = useMemo(() => new Set([
    'txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'py', 'rs', 'go',
    'java', 'c', 'cpp', 'h', 'yaml', 'yml', 'toml', 'xml', 'csv', 'log',
    'cs', 'shader', 'glsl', 'hlsl', 'lua', 'rb', 'php', 'swift', 'kt', 'sh', 'bat',
    'ps1', 'r', 'sql', 'scala', 'dart', 'zig',
  ]), []);

  // 코드 구문 강조 대상 확장자 (CodePreviewModal 사용)
  const CODE_PREVIEW_EXTS = useMemo(() => new Set([
    'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h',
    'yaml', 'yml', 'toml', 'xml', 'cs', 'shader', 'glsl', 'hlsl', 'lua', 'rb', 'php',
    'swift', 'kt', 'sh', 'bat', 'ps1', 'r', 'sql', 'scala', 'dart', 'zig',
  ]), []);

  // 파일 미리보기 실행 (Space키 + 화살표 이동 시 공용)
  const previewFile = useCallback((entry: FileEntry) => {
    // 폴더는 미리보기 대상이 아님
    if (entry.is_dir) return;

    const isVideo = entry.file_type === 'video';
    const isImage = entry.file_type === 'image' || /\.psd$/i.test(entry.name);
    const isPsb = /\.psb$/i.test(entry.name);
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    const isJson = ext === 'json';
    const isMd = ext === 'md';
    // 확장자 없는 알려진 텍스트 파일 감지
    const KNOWN_TEXT_FILES = new Set([
      'license', 'licence', 'readme', 'makefile', 'dockerfile',
      'gemfile', 'rakefile', 'procfile', 'vagrantfile',
      '.gitignore', '.gitattributes', '.editorconfig', '.env',
      '.npmrc', '.prettierrc', '.eslintrc', '.dockerignore',
    ]);
    const hasNoExt = !entry.name.includes('.') || entry.name.startsWith('.');
    const isKnownText = hasNoExt && KNOWN_TEXT_FILES.has(entry.name.toLowerCase());
    const isText = (TEXT_PREVIEW_EXTS.has(ext) && !isJson && !isMd) || isKnownText; // JSON/MD는 전용 뷰어 사용

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
    } else if (isJson) {
      if (!preview.previewJsonPath) preview.closeAllPreviews();
      preview.handlePreviewJson(entry.path);
    } else if (isMd) {
      if (!preview.previewMdPath) preview.closeAllPreviews();
      preview.handlePreviewMd(entry.path);
    } else if (/\.fbx$/i.test(entry.name)) {
      // FBX 3D 파일 미리보기
      preview.closeAllPreviews();
      preview.setFbxPreviewPath(entry.path);
    } else if (/\.(hwp|hwpx)$/i.test(entry.name)) {
      // 한글 파일(.hwp/.hwpx) 미리보기
      if (!preview.hwpPreviewPath) preview.closeAllPreviews();
      preview.setHwpPreviewPath(entry.path);
    } else if (CODE_PREVIEW_EXTS.has(ext)) {
      // 코드 파일 → 구문 강조 뷰어
      preview.closeAllPreviews();
      preview.setCodePreviewPath(entry.path);
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
  const fuzzyFilterInputRef = useRef<HTMLInputElement>(null);
  const currentPathRef = useRef<string | null>(null); // loadDirectory에서 스크롤 저장용
  // 뒤로/위로 이동 시 이전 폴더를 자동 선택하기 위한 ref
  const lastVisitedChildRef = useRef<string | null>(null);

  // --- 디렉토리 로딩 ---
  const loadRequestRef = useRef(0); // 동시 요청 시 마지막 요청만 반영
  const entriesCacheRef = useRef<Map<string, FileEntry[]>>(new Map()); // 방문 폴더 entries 캐시
  const prefetchInFlightRef = useRef<Set<string>>(new Set()); // 프리페치 중복 방지

  // 디렉토리 캐시 LRU 갱신 (상한 50폴더 — stale은 계속 표시하되 메모리 무한 증가 방지)
  const cacheEntries = useCallback((p: string, list: FileEntry[]) => {
    const m = entriesCacheRef.current;
    if (m.has(p)) m.delete(p);
    m.set(p, list);
    if (m.size > 50) {
      const oldest = m.keys().next().value;
      if (oldest !== undefined) m.delete(oldest);
    }
  }, []);

  // 현재 썸네일 크기를 ref로 보관 (프리워밍이 loadDirectory 의존성을 늘리지 않도록)
  const thumbnailSizeRef = useRef(thumbnailSize);
  thumbnailSizeRef.current = thumbnailSize;

  // 백그라운드 프리워밍 (#B): 진입 직후 보이는 범위+α 썸네일을 저우선순위로 미리 디스크 캐시에 생성
  // → 스크롤 시점엔 이미 준비됨. 화면에 보이는 카드(고우선순위 큐)를 방해하지 않음.
  const prewarmThumbnails = useCallback((list: FileEntry[]) => {
    const size = thumbnailSizeRef.current;
    const run = () => {
      let count = 0;
      for (const e of list) {
        if (count >= 120) break;
        if (e.is_dir) continue;
        const lower = e.name.toLowerCase();
        if (lower.endsWith('.psd') || lower.endsWith('.psb')) continue; // 그리드 미표시
        let cmd = '';
        if (e.file_type === 'image') cmd = 'get_file_thumbnail_path';
        else if (e.file_type === 'video') cmd = 'get_video_thumbnail_path';
        else continue;
        count++;
        queuedInvokeLow(cmd, { path: e.path, size }).promise.catch(() => {});
      }
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback;
    if (typeof ric === 'function') ric(run, { timeout: 1500 });
    else setTimeout(run, 300);
  }, []);

  const loadDirectory = useCallback(async (path: string) => {
    if (!path) return;
    // 현재 경로의 스크롤 위치 저장
    if (gridRef.current && currentPathRef.current) {
      scrollPositionRef.current.set(`${viewModeRef.current}:${currentPathRef.current}`, gridRef.current.scrollTop);
    }
    currentPathRef.current = path;
    cancelAllQueued(); // 이전 디렉토리의 대기 중인 썸네일 요청 모두 취소
    setError(null);

    // 최근항목 특수 경로 처리
    const isRecent = path === RECENT_PATH;
    const isSystemRoot = path === SYSTEM_ROOT_PATH;

    // 캐시에 있으면 즉시 표시 (탭 전환 시 대기 없음) — 최근항목은 캐시 안 함
    const cached = (isRecent || isSystemRoot) ? null : entriesCacheRef.current.get(path);
    if (cached) {
      setEntries(sortEntries(cached, sortBy, sortDir));
      setSelectedPaths([]);
      setFocusedIndex(-1);
    }

    // 캐시 히트와 무관하게 항상 백그라운드에서 최신 데이터 요청
    setLoading(true);
    const requestId = ++loadRequestRef.current;
    let freshArrived = false;

    // 메모리 캐시 미스 시 디스크 영속 캐시로 stale 즉시 표시
    // (구글 드라이브 등: 앱 재시작 후에도 한번 본 폴더는 즉시 뜨고 백그라운드에서 갱신)
    if (!cached && !isRecent && !isSystemRoot) {
      invoke<FileEntry[] | null>('read_cached_listing', { path })
        .then(diskCached => {
          // 신선한 결과가 이미 도착했거나 다른 폴더로 이동했으면 무시
          if (requestId !== loadRequestRef.current || freshArrived) return;
          if (!diskCached || diskCached.length === 0) return;
          setEntries(sortEntries(diskCached, sortBy, sortDir));
        })
        .catch(() => {});
    }

    try {
      const result = isRecent
        ? await invoke<FileEntry[]>('get_recent_files', { roots: recentRoots, days: 7 })
        : isSystemRoot
        ? await invoke<FileEntry[]>('list_system_roots')
        : await invoke<FileEntry[]>('list_directory', { path });
      // 이미 다른 디렉토리로 이동한 경우 무시
      if (requestId !== loadRequestRef.current) return;
      freshArrived = true;
      if (!isRecent && !isSystemRoot) {
        cacheEntries(path, result); // 메모리 캐시 갱신 (LRU)
        invoke('write_cached_listing', { path, entries: result }).catch(() => {}); // 디스크 영속 캐시 갱신
      }
      // 최근항목은 이미 서버에서 수정시간 내림차순 정렬된 상태
      const sortedResult = (isRecent || isSystemRoot) ? result : sortEntries(result, sortBy, sortDir);
      setEntries(sortedResult);
      if (!isRecent && !isSystemRoot) prewarmThumbnails(sortedResult); // 백그라운드 프리워밍
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
      const savedScroll = scrollPositionRef.current.get(`${viewModeRef.current}:${path}`);
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
  }, [sortBy, sortDir, recentRoots, cacheEntries, prewarmThumbnails]);

  // 인접 폴더 프리페치 (#6): 폴더 hover 시 유휴 시점에 저우선순위로 목록 선반입
  // 썸네일 큐를 방해하지 않고, 진입 시점에는 이미 캐시되어 즉시 표시됨
  const prefetchDirectory = useCallback((path: string) => {
    if (!path) return;
    if (entriesCacheRef.current.has(path)) return; // 이미 캐시됨
    if (prefetchInFlightRef.current.has(path)) return; // 중복 방지
    prefetchInFlightRef.current.add(path);
    const run = () => {
      const { promise } = queuedInvokeLow<FileEntry[]>('list_directory', { path });
      promise
        .then(result => {
          cacheEntries(path, result);
          invoke('write_cached_listing', { path, entries: result }).catch(() => {});
        })
        .catch(() => {})
        .finally(() => { prefetchInFlightRef.current.delete(path); });
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback;
    if (typeof ric === 'function') ric(run, { timeout: 1000 });
    else setTimeout(run, 200);
  }, [cacheEntries]);

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
        case 'type': {
          // 확장자별 1차 그룹화 (psd, png, jpg 등 별도 그룹)
          const extA = a.name.includes('.') ? a.name.slice(a.name.lastIndexOf('.') + 1).toLowerCase() : '';
          const extB = b.name.includes('.') ? b.name.slice(b.name.lastIndexOf('.') + 1).toLowerCase() : '';
          cmp = extA.localeCompare(extB);
          if (cmp === 0) cmp = naturalCompare(a.name, b.name);
          break;
        }
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
  const { displayEntries, fuzzyMatchIndices, fuzzyBestPath, fuzzyMatchCount, isFiltering } = searchFilter;
  const displayPathSet = useMemo(() => new Set(displayEntries.map(entry => entry.path)), [displayEntries]);

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

  // 필터로 숨겨진 항목은 선택과 포커스에서도 제외한다.
  useEffect(() => {
    const nextSelectedPaths = selectedPaths.filter(path => displayPathSet.has(path));
    if (nextSelectedPaths.length !== selectedPaths.length) {
      setSelectedPaths(nextSelectedPaths);
    }

    const nextFocusedIndex = nextSelectedPaths.length > 0
      ? displayEntries.findIndex(entry => entry.path === nextSelectedPaths[nextSelectedPaths.length - 1])
      : -1;

    if (focusedIndex !== nextFocusedIndex) {
      setFocusedIndex(nextFocusedIndex);
    }

    selectionAnchorRef.current = -1;
  }, [displayEntries, displayPathSet]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // --- 파일/폴더 열기 ---
  const openEntry = useCallback(async (entry: FileEntry) => {
    if (entry.is_dir) {
      handleNavigateTo(entry.path);
      return;
    }

    if (entry.file_type === 'archive' && isBrowsableArchiveFilePath(entry.path)) {
      openArchiveEntry(entry.path);
      return;
    }

    const isVirtualArchiveEntry = isArchiveVirtualPath(entry.path);
    if (entry.file_type === 'video' && !isVirtualArchiveEntry) {
      // 동영상은 내장 플레이어로 재생
      preview.setVideoPlayerPath(entry.path);
      return;
    }

    // JSON 파일: JSON 뷰어로 미리보기
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'json') {
      preview.handlePreviewJson(entry.path);
      return;
    }

    // 그 외 파일: OS 기본 앱으로 열기
    try {
      await invoke('open_folder', { path: entry.path });
    } catch (e) {
      console.error('파일 열기 실패:', e);
    }
  }, [handleNavigateTo, openArchiveEntry, preview]);

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
      await invoke('open_folder', { path });
    } catch (e) {
      console.error('탐색기 열기 실패:', e);
    }
  }, []);

  // --- 선택 ---
  const selectEntry = useCallback((path: string, multi: boolean, range: boolean) => {
    // 마우스 클릭 시 focusedIndex도 동기화 (키보드 이동 기준점 갱신)
    const clickedIdx = displayEntries.findIndex(e => e.path === path);
    if (clickedIdx >= 0) setFocusedIndex(clickedIdx);

    if (multi) {
      setSelectedPaths(prev =>
        prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
      );
    } else if (range) {
      const paths = displayEntries.map(e => e.path);
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
  }, [displayEntries, selectedPaths]);

  const selectAll = useCallback(() => {
    setSelectedPaths(displayEntries.map(e => e.path));
  }, [displayEntries]);

  const deselectAll = useCallback(() => {
    setSelectedPaths([]);
    setFocusedIndex(-1);
  }, []);

  // 박스 드래그 선택용 다중 경로 설정
  const handleSelectPaths = useCallback((paths: string[]) => {
    const nextPaths = paths.filter(path => displayPathSet.has(path));
    setSelectedPaths(nextPaths);
    setFocusedIndex(nextPaths.length > 0
      ? displayEntries.findIndex(entry => entry.path === nextPaths[nextPaths.length - 1])
      : -1);
  }, [displayEntries, displayPathSet]);

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
        const duplicates = await invoke<string[]>('check_duplicate_items', { sources: filtered, dest: currentPath });
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
      <InlineFuzzyFilterInput
        ref={fuzzyFilterInputRef}
        value={searchFilter.searchQuery}
        enabled={fuzzyFilterInputEnabled}
        onChange={searchFilter.setSearchQuery}
        onClear={handleFuzzyFilterClear}
      />
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
      {fileOps.folderSizeDialog && (
        <FolderSizeInfoDialog
          dialog={fileOps.folderSizeDialog}
          themeVars={themeVars}
          onChildOpen={handleFolderSizeChildSelect}
          onClose={fileOps.closeFolderSizeDialog}
        />
      )}

      {fileOps.permanentDeleteConfirm && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={() => fileOps.setPermanentDeleteConfirm(null)}
          tabIndex={-1}
          ref={el => el?.focus()}
          onKeyDown={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); if (e.key === 'Enter') fileOps.executePermanentDelete(); if (e.key === 'Escape') fileOps.setPermanentDeleteConfirm(null); }}
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
          tabIndex={-1}
          ref={el => el?.focus()}
          onKeyDown={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); if (e.key === 'Enter') fileOps.executeElevatedDelete(); if (e.key === 'Escape') fileOps.setElevatedDeleteConfirm(null); }}
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

      {/* 폴더 해제 확인 다이얼로그 */}
      {fileOps.ungroupConfirm && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={() => fileOps.setUngroupConfirm(null)}
          tabIndex={-1}
          ref={el => el?.focus()}
          onKeyDown={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); if (e.key === 'Enter') fileOps.executeUngroupFolder(); if (e.key === 'Escape') fileOps.setUngroupConfirm(null); }}
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
              폴더를 제거하고 파일을 꺼내시겠습니까?
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 text-xs rounded-md transition-colors"
                style={{
                  backgroundColor: themeVars?.surface ?? '#334155',
                  color: themeVars?.text ?? '#e5e7eb',
                  border: `1px solid ${themeVars?.border ?? '#475569'}`,
                }}
                onClick={() => fileOps.setUngroupConfirm(null)}
              >
                취소
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded-md text-white transition-colors"
                style={{ backgroundColor: themeVars?.accent ?? '#3b82f6' }}
                onClick={fileOps.executeUngroupFolder}
              >
                확인
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
              renamingPath={modals.renamingPath}
              loading={loading}
              error={error}
              themeVars={themeVars}
              instanceId={instanceId}
              currentPath={currentPath}
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
              onRenameCommit={fileOps.handleRenameCommit}
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
              currentPath={currentPath}
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
              onHoverFolder={prefetchDirectory}
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
              pendingCopyPaths={fileOperationPendingSet}
              draggedPaths={new Set(activeDragPaths.length > 0 ? activeDragPaths : selectedPaths)}
              isDraggingNow={isInternalDragging}
              fuzzyMatchIndices={fuzzyMatchIndices}
              isFuzzyFiltering={isFiltering}
              fuzzyQuery={searchFilter.searchQuery}
              fuzzyMatchCount={fuzzyMatchCount}
              onFuzzyFilterClear={handleFuzzyFilterClear}
              onFilterInputFocus={focusFilterInput}
            />
          )}

          {/* 동영상 압축 진행률 */}
          {fileOps.videoCompression && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 text-xs"
              style={{ backgroundColor: 'var(--qf-surface-2)', color: 'var(--qf-text)', borderTop: '1px solid var(--qf-border)' }}
            >
              <span className="shrink-0">
                🎬 압축 중... {fileOps.videoCompression.total && fileOps.videoCompression.total > 1
                  ? `${fileOps.videoCompression.current}/${fileOps.videoCompression.total}개 `
                  : ''}
                {fileOps.videoCompression.fileName}
              </span>
              <span className="text-[var(--qf-muted)]">
                ({Math.floor(fileOps.videoCompression.percent)}초{fileOps.videoCompression.speed ? ` · ${fileOps.videoCompression.speed}` : ''})
              </span>
            </div>
          )}

          {fileOps.gsSetup && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 text-xs"
              style={{ backgroundColor: 'var(--qf-surface-2)', color: 'var(--qf-text)', borderTop: '1px solid var(--qf-border)' }}
            >
              <span>⏳ Ghostscript 다운로드/설치 중... {fileOps.gsSetup.fileName}</span>
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

      {/* ZIP 해제 등 기타 작업 진행 알림 (복사/이동은 TaskQueuePanel) */}
      {fileOps.operationProgress && (
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2" style={{ pointerEvents: 'none' }}>
          <div className="rounded-lg px-4 py-3 flex flex-col gap-2 min-w-[220px] max-w-sm shadow-xl" style={{ backgroundColor: themeVars?.surface2 ?? '#1e293b', border: `1px solid ${themeVars?.border ?? '#334155'}`, pointerEvents: 'auto' }}>
            <div className="flex items-center gap-3">
              <div className="animate-spin w-4 h-4 border-2 border-t-transparent rounded-full flex-shrink-0" style={{ borderColor: `${themeVars?.accent ?? '#4ade80'} transparent ${themeVars?.accent ?? '#4ade80'} ${themeVars?.accent ?? '#4ade80'}` }} />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium block" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                  {fileOps.operationProgress.type} 중… ({fileOps.operationProgress.total}개 항목)
                </span>
                {fileOps.operationProgress.itemLabel && (
                  <span className="text-[11px] truncate block mt-0.5" style={{ color: themeVars?.muted ?? '#94a3b8' }} title={fileOps.operationProgress.itemLabel}>
                    {fileOps.operationProgress.itemLabel}
                  </span>
                )}
              </div>
            </div>
            <div className="h-0.5 w-full rounded overflow-hidden" style={{ backgroundColor: `${themeVars?.accent ?? '#4ade80'}25` }}>
              <div className="h-full w-1/3 rounded animate-[qf-pulse-bar_1.2s_ease-in-out_infinite]" style={{ backgroundColor: themeVars?.accent ?? '#4ade80' }} />
            </div>
            <style>{`@keyframes qf-pulse-bar { 0%,100% { transform: translateX(-20%); opacity: 0.6; } 50% { transform: translateX(180%); opacity: 1; } }`}</style>
          </div>
        </div>
      )}

      <PreviewModals
        preview={preview}
        themeVars={themeVars}
        previewEntry={entries.find((e) => e.path === preview.previewImagePath) ?? null}
        onCropSave={(outputPath) => {
          fileOps.showCopyToast(`크롭 저장 완료: ${getFileName(outputPath)}`);
          pendingSelectRef.current = outputPath;
          if (currentPath) {
            loadDirectory(currentPath);
          }
        }}
        onRemoveBg={(path) => {
          modals.setRemoveWhiteBgPaths([path]);
        }}
        onOpenGifCompress={(paths) => modals.setGifCompressPaths(paths)}
        onGifToMp4={fileOps.handleGifToMp4}
        onOpenImageCompress={() => {}}
        onOpenImageResize={() => {}}
        onOpenMdEditor={(path) => modals.setMarkdownEditorPath(path)}
        onFileChanged={() => {
          if (currentPath) loadDirectory(currentPath);
        }}
      />

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

      {modals.mapMakerPath && (
        <MapMakerModal
          path={modals.mapMakerPath}
          onClose={() => modals.setMapMakerPath(null)}
          onExport={fileOps.handleLaigterMapsExport}
          themeVars={themeVars}
        />
      )}

      {/* 배경 제거 모달 */}
      {modals.removeWhiteBgPaths && (
        <RemoveWhiteBgModal
          paths={modals.removeWhiteBgPaths}
          onClose={() => modals.setRemoveWhiteBgPaths(null)}
          onApply={fileOps.handleRemoveWhiteBgApply}
          themeVars={themeVars}
        />
      )}

      {/* GIF 압축 모달 */}
      {modals.gifCompressPaths && (
        <GifCompressModal
          filePaths={modals.gifCompressPaths}
          onClose={() => modals.setGifCompressPaths(null)}
          onSuccess={() => {
            if (currentPath) loadDirectory(currentPath);
          }}
          onError={(err) => console.error('GIF 압축 실패:', err)}
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

      {/* 터미널 프리셋 모달 */}
      {modals.terminalPresetPath && (
        <TerminalPresetModal
          path={modals.terminalPresetPath}
          initialEditId={modals.terminalPresetEditId}
          onClose={() => {
            modals.setTerminalPresetPath(null);
            modals.setTerminalPresetEditId(null);
          }}
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

      {/* 중복 파일 찾기 모달 */}
      {modals.duplicateFinderPath && (
        <DuplicateFilesModal
          rootPath={modals.duplicateFinderPath}
          onClose={() => modals.setDuplicateFinderPath(null)}
          onSelect={handleGlobalSearchSelect}
          onDelete={handleDuplicateFileDelete}
          themeVars={themeVars}
        />
      )}

      {/* Diff Viewer */}
      {modals.diffViewerPaths && (
        <DiffViewerModal
          leftPath={modals.diffViewerPaths[0]}
          rightPath={modals.diffViewerPaths[1]}
          themeVars={themeVars}
          onClose={() => modals.setDiffViewerPaths(null)}
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

      {/* 폰트 미리보기 */}
      {modals.fontPreviewPath && (
        <FontPreviewModal
          path={modals.fontPreviewPath}
          onClose={() => modals.setFontPreviewPath(null)}
          themeVars={themeVars}
        />
      )}

      {/* PDF 미리보기 */}
      {modals.pdfPreviewPath && (
        <PdfPreviewModal
          path={modals.pdfPreviewPath}
          onClose={() => modals.setPdfPreviewPath(null)}
          themeVars={themeVars}
        />
      )}

      {/* 오디오 미리듣기 */}
      {modals.audioPreviewPath && (
        <AudioPreviewModal
          path={modals.audioPreviewPath}
          entries={entries}
          onClose={() => modals.setAudioPreviewPath(null)}
          themeVars={themeVars}
        />
      )}

      {/* 코드 미리보기 */}
      {preview.codePreviewPath && (
        <CodePreviewModal
          path={preview.codePreviewPath}
          onClose={() => preview.setCodePreviewPath(null)}
          themeVars={themeVars}
          editRequestToken={preview.codePreviewEditRequest}
        />
      )}

      {/* FBX 3D 미리보기 */}
      {preview.fbxPreviewPath && (
        <FbxPreviewModal
          path={preview.fbxPreviewPath}
          onClose={() => preview.setFbxPreviewPath(null)}
          themeVars={themeVars}
        />
      )}

      {/* 폰트 병합 */}
      {modals.fontMergePaths && modals.fontMergePaths.length === 2 && (
        <FontMergeModal
          paths={modals.fontMergePaths}
          onClose={() => modals.setFontMergePaths(null)}
          onApply={(outputPath) => {
            modals.setFontMergePaths(null);
            fileOps.handleMergeFontsComplete(outputPath);
          }}
          themeVars={themeVars}
        />
      )}

      {/* 스마트 폴더 병합 */}
      {modals.folderMergeRequest && (
        <FolderMergeModal
          request={modals.folderMergeRequest}
          onClose={() => modals.setFolderMergeRequest(null)}
          onComplete={handleFolderMergeComplete}
          themeVars={themeVars}
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

      {/* 드래그/OS드롭 중복 확인 다이얼로그 */}
      {dropConfirm && (
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
                같은 이름의 파일이 {dropConfirm.duplicates.length}개 존재합니다.
              </p>
              <p className="text-xs mb-3" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
                덮어씌우시겠습니까? (아니오 = 중복 파일만 스킵)
              </p>
              <div
                className="text-xs rounded-md px-3 py-2 max-h-[120px] overflow-y-auto"
                style={{ backgroundColor: themeVars?.surface ?? '#111827' }}
              >
                {dropConfirm.duplicates.map((name, i) => (
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
                onClick={async () => {
                  const info = dropConfirm;
                  setDropConfirm(null);
                  // 아니오: 중복 파일 스킵(덮어쓰기 false) — 백엔드가 스킵 처리
                  await executeDrop(info, false);
                  loadDirectory(currentPath);
                }}
              >
                아니오
              </button>
              <button
                className="px-4 py-1.5 text-xs rounded-md transition-colors hover:opacity-80"
                style={{
                  backgroundColor: themeVars?.accent ?? '#3b82f6',
                  color: '#fff',
                }}
                onClick={async () => {
                  const info = dropConfirm;
                  setDropConfirm(null);
                  await executeDrop(info, true);
                  loadDirectory(currentPath);
                }}
              >
                네
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// 폴더 용량 정보 다이얼로그
function FolderSizeInfoDialog({ dialog, themeVars, onChildOpen, onClose }: {
  dialog: FolderSizeDialogState;
  themeVars: ThemeVars | null;
  onChildOpen: (child: NonNullable<FolderSizeDialogState['children']>[number]) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const mutedColor = themeVars?.muted ?? '#94a3b8';
  const textColor = themeVars?.text ?? '#e5e7eb';
  const borderColor = themeVars?.border ?? '#334155';

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="폴더 용량 정보"
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] rounded-lg shadow-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: themeVars?.surface2 ?? '#1e293b',
          border: `1px solid ${borderColor}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${borderColor}` }}>
          <div className="flex items-center gap-2 min-w-0">
            <HardDrive size={16} className="shrink-0" style={{ color: themeVars?.accent ?? '#3b82f6' }} />
            <span className="text-sm font-medium truncate" style={{ color: textColor }} title={dialog.folderName}>
              폴더 용량 정보
            </span>
          </div>
          <button
            type="button"
            className="p-1 rounded-md hover:opacity-75"
            style={{ color: mutedColor }}
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-4 overflow-hidden">
          <div className="mb-4 min-w-0">
            <div className="text-xs mb-1" style={{ color: mutedColor }}>폴더</div>
            <div className="text-sm font-medium truncate" style={{ color: textColor }} title={dialog.path}>
              {dialog.folderName}
            </div>
            <div className="mt-1 text-[11px] truncate" style={{ color: mutedColor }} title={dialog.path}>
              {dialog.path}
            </div>
          </div>

          {dialog.status === 'loading' && (
            <div className="flex items-center gap-2 rounded-md px-3 py-3" style={{ backgroundColor: themeVars?.surface ?? '#111827', color: textColor }}>
              <Loader2 size={16} className="animate-spin shrink-0" />
              <span className="text-sm">폴더 용량 계산 중...</span>
            </div>
          )}

          {dialog.status === 'error' && (
            <div className="rounded-md px-3 py-3 text-sm" style={{ backgroundColor: '#7f1d1d33', color: '#fecaca', border: '1px solid #ef444455' }}>
              폴더 용량 확인 실패: {dialog.error}
            </div>
          )}

          {dialog.status === 'ready' && (
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <InfoPopupRow label="전체 용량" value={dialog.sizeText ?? '-'} themeVars={themeVars} />
                <InfoPopupRow label="정확한 바이트" value={`${dialog.bytes ?? '0'} bytes`} themeVars={themeVars} />
                <InfoPopupRow label="파일" value={`${(dialog.fileCount ?? 0).toLocaleString()}개`} themeVars={themeVars} />
                <InfoPopupRow label="폴더" value={`${(dialog.folderCount ?? 0).toLocaleString()}개`} themeVars={themeVars} />
              </div>

              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium" style={{ color: textColor }}>용량 상위 항목</span>
                  <span className="text-[11px]" style={{ color: mutedColor }}>
                    {(dialog.children?.length ?? 0).toLocaleString()}개
                  </span>
                </div>
                {dialog.children && dialog.children.length > 0 ? (
                  <div className="max-h-[52vh] overflow-y-auto pr-1 space-y-2">
                    {dialog.children.map(child => (
                      <FolderSizeChildRow
                        key={child.path}
                        child={child}
                        themeVars={themeVars}
                        onOpen={onChildOpen}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md px-3 py-3 text-sm" style={{ backgroundColor: themeVars?.surface ?? '#111827', color: mutedColor }}>
                    표시할 하위 항목이 없습니다.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end px-4 py-3" style={{ borderTop: `1px solid ${borderColor}` }}>
          <button
            type="button"
            className="px-4 py-1.5 text-xs rounded-md transition-colors hover:opacity-80"
            style={{
              backgroundColor: themeVars?.accent ?? '#3b82f6',
              color: '#fff',
              border: 'none',
            }}
            onClick={onClose}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

function FolderSizeChildRow({ child, themeVars, onOpen }: {
  child: NonNullable<FolderSizeDialogState['children']>[number];
  themeVars: ThemeVars | null;
  onOpen: (child: NonNullable<FolderSizeDialogState['children']>[number]) => void;
}) {
  const mutedColor = themeVars?.muted ?? '#94a3b8';
  const textColor = themeVars?.text ?? '#e5e7eb';
  const accentColor = themeVars?.accent ?? '#3b82f6';
  const percentText = `${child.percent >= 10 ? child.percent.toFixed(0) : child.percent.toFixed(1)}%`;
  const barWidth = child.bytes > 0 ? Math.max(2, child.percent) : 0;
  const detail = child.isDir
    ? `파일 ${child.fileCount.toLocaleString()}개 · 폴더 ${child.folderCount.toLocaleString()}개`
    : '파일';

  return (
    <button
      type="button"
      className="w-full cursor-pointer rounded-md px-3 py-2 text-left transition-opacity hover:opacity-85 focus:outline-none focus:ring-2"
      style={{ backgroundColor: themeVars?.surface ?? '#111827' }}
      title={child.path}
      onClick={() => onOpen(child)}
    >
      <div className="mb-2 flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {child.isDir ? (
            <Folder size={14} className="shrink-0" style={{ color: accentColor }} />
          ) : (
            <FileText size={14} className="shrink-0" style={{ color: mutedColor }} />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium" style={{ color: textColor }}>{child.name}</div>
            <div className="truncate text-[11px]" style={{ color: mutedColor }}>{detail}</div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-medium" style={{ color: textColor }}>{child.bytesText}</div>
          <div className="text-[11px]" style={{ color: mutedColor }}>{percentText}</div>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: `${accentColor}22` }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${barWidth}%`,
            backgroundColor: child.isDir ? accentColor : mutedColor,
          }}
        />
      </div>
    </button>
  );
}

function InfoPopupRow({ label, value, themeVars }: {
  label: string;
  value: string;
  themeVars: ThemeVars | null;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md px-3 py-2"
      style={{ backgroundColor: themeVars?.surface ?? '#111827' }}
    >
      <span className="text-xs shrink-0" style={{ color: themeVars?.muted ?? '#94a3b8' }}>{label}</span>
      <span className="text-sm font-medium text-right truncate" style={{ color: themeVars?.text ?? '#e5e7eb' }} title={value}>
        {value}
      </span>
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
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (value.trim()) onConfirm(value.trim());
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onCancel();
              }
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
