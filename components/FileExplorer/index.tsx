import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry, ClipboardData, ThumbnailSize } from '../../types';
import { ThemeVars } from './types';
import NavigationBar from './NavigationBar';
import FileGrid from './FileGrid';
import ContextMenu from './ContextMenu';
import BulkRenameModal from './BulkRenameModal';
import StatusBar from './StatusBar';
import TabBar from './TabBar';
import { useInternalDragDrop } from './hooks/useInternalDragDrop';
import { usePreview } from './hooks/usePreview';
import { useTabManagement } from './hooks/useTabManagement';
import { PreviewModals } from './PreviewModals';
import { cancelAllQueued } from './hooks/invokeQueue';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { isCloudPath } from '../../utils/pathUtils';

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
  // 분할 뷰: 공유 클립보드 사용, 단일 뷰: 내부 상태 사용
  const [internalClipboard, setInternalClipboard] = useState<ClipboardData | null>(null);
  const clipboard = sharedClipboard !== undefined ? sharedClipboard : internalClipboard;
  const setClipboard = onClipboardChange ?? setInternalClipboard;
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified' | 'type'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [thumbnailSize, setThumbnailSize] = useState<ThumbnailSize>(120);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; paths: string[] } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [bulkRenamePaths, setBulkRenamePaths] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'details'>('grid');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const selectionAnchorRef = useRef<number>(-1); // Shift 선택 시작점

  // --- 검색/필터 상태 ---
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeExtFilters, setActiveExtFilters] = useState<Set<string>>(new Set());

  // --- 미리보기 (비디오/이미지/텍스트) ---
  const preview = usePreview();

  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // 뒤로/위로 이동 시 이전 폴더를 자동 선택하기 위한 ref
  const lastVisitedChildRef = useRef<string | null>(null);

  // 파생값은 useTabManagement에서 제공 (loadDirectory 뒤에서 초기화)

  // --- 디렉토리 로딩 ---
  const loadRequestRef = useRef(0); // 동시 요청 시 마지막 요청만 반영
  const entriesCacheRef = useRef<Map<string, FileEntry[]>>(new Map()); // 탭별 entries 캐시

  const loadDirectory = useCallback(async (path: string) => {
    if (!path) return;
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
    duplicateTab, closeOtherTabs,
  } = useTabManagement({ instanceId, loadDirectory, onPathChange, onSplitModeChange });

  // --- 정렬 ---
  function sortEntries(list: FileEntry[], by: string, dir: string): FileEntry[] {
    return [...list].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      let cmp = 0;
      switch (by) {
        case 'name': cmp = a.name.localeCompare(b.name, 'ko'); break;
        case 'size': cmp = a.size - b.size; break;
        case 'modified': cmp = a.modified - b.modified; break;
        case 'type': cmp = a.file_type.localeCompare(b.file_type); break;
        default: cmp = a.name.localeCompare(b.name, 'ko');
      }
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  // 정렬 변경 시 재정렬
  useEffect(() => {
    setEntries(prev => sortEntries(prev, sortBy, sortDir));
  }, [sortBy, sortDir]);

  // 파일 확장자 추출 유틸
  const getExt = useCallback((entry: FileEntry): string => {
    if (entry.is_dir) return 'folder';
    const dot = entry.name.lastIndexOf('.');
    return dot > 0 ? entry.name.slice(dot + 1).toLowerCase() : 'other';
  }, []);

  // 현재 디렉토리에 존재하는 확장자 목록 (폴더 포함)
  const availableExtensions = useMemo(() => {
    const exts = new Set<string>();
    entries.forEach(e => exts.add(getExt(e)));
    return exts;
  }, [entries, getExt]);

  // --- 검색 + 확장자 필터로 표시할 항목 파생 ---
  const displayEntries = useMemo(() => {
    let result = entries;
    if (activeExtFilters.size > 0) {
      result = result.filter(e => activeExtFilters.has(getExt(e)));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e => e.name.toLowerCase().includes(q));
    }
    return result;
  }, [entries, activeExtFilters, searchQuery, getExt]);

  // --- initialPath 변경 시 탭 생성 또는 기존 탭으로 전환 ---
  useEffect(() => {
    if (!initialPath) return;
    openTab(initialPath);
  }, [initialPath, initialPathKey]);

  // 앱 시작 시 저장된 탭이 있으면 마지막 활성 탭 로드
  useEffect(() => {
    if (activeTab && !initialPath) {
      loadDirectory(activeTab.path);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // navigateTo 래퍼: 검색 상태 초기화
  const handleNavigateTo = useCallback((path: string) => {
    setSearchQuery('');
    setIsSearchActive(false);
    navigateTo(path);
  }, [navigateTo]);

  // goBack 래퍼: 이전 경로 자동 선택
  const goBack = useCallback(() => {
    const prevPath = tabGoBack();
    if (prevPath) lastVisitedChildRef.current = prevPath;
  }, [tabGoBack]);

  // goUp: 상위 경로로 이동
  const goUp = useCallback(() => {
    if (!currentPath) return;
    const sep = currentPath.includes('/') ? '/' : '\\';
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
    setSelectedPaths(entries.map(e => e.path));
  }, [entries]);

  const deselectAll = useCallback(() => {
    setSelectedPaths([]);
  }, []);

  // 박스 드래그 선택용 다중 경로 설정
  const handleSelectPaths = useCallback((paths: string[]) => {
    setSelectedPaths(paths);
  }, []);

  // --- 파일 조작 ---
  const handleCopy = useCallback(async () => {
    if (selectedPaths.length === 0) return;
    setClipboard({ paths: selectedPaths, action: 'copy' });
    // OS 클립보드에도 파일 경로 등록 (외부 앱에서 Ctrl+V 가능)
    try { await invoke('write_files_to_clipboard', { paths: selectedPaths }); } catch { /* 무시 */ }
  }, [selectedPaths]);

  const handleCut = useCallback(async () => {
    if (selectedPaths.length === 0) return;
    setClipboard({ paths: selectedPaths, action: 'cut' });
    // OS 클립보드에도 파일 경로 등록
    try { await invoke('write_files_to_clipboard', { paths: selectedPaths }); } catch { /* 무시 */ }
  }, [selectedPaths]);

  const handlePaste = useCallback(async () => {
    if (!currentPath) return;
    try {
      // 내부 클립보드 우선, 없으면 OS 클립보드에서 읽기
      let paths: string[];
      let action: 'copy' | 'cut';
      if (clipboard) {
        paths = clipboard.paths;
        action = clipboard.action;
      } else {
        const osPaths = await invoke<string[]>('read_files_from_clipboard');
        if (osPaths && osPaths.length > 0) {
          paths = osPaths;
          action = 'copy'; // 외부에서 복사한 파일은 항상 copy
        } else {
          // 파일 경로 없으면 이미지 데이터 붙여넣기 시도
          const savedPath = await invoke<string | null>('paste_image_from_clipboard', { destDir: currentPath });
          if (savedPath) {
            loadDirectory(currentPath);
            setSelectedPaths([savedPath]);
          }
          return;
        }
      }

      if (action === 'copy') {
        await invoke('copy_items', { sources: paths, dest: currentPath });
      } else {
        await invoke('move_items', { sources: paths, dest: currentPath });
        setClipboard(null);
      }
      loadDirectory(currentPath);
    } catch (e) {
      console.error('붙여넣기 실패:', e);
    }
  }, [clipboard, currentPath, loadDirectory]);

  const handleDelete = useCallback(async (paths: string[], permanent = false) => {
    if (paths.length === 0) return;
    try {
      await invoke('delete_items', { paths, useTrash: !permanent });
      setSelectedPaths(prev => prev.filter(p => !paths.includes(p)));
      loadDirectory(currentPath);
    } catch (e) {
      console.error('삭제 실패:', e);
      setError(`삭제 실패: ${e}`);
    }
  }, [currentPath, loadDirectory]);

  const handleDuplicate = useCallback(async () => {
    if (selectedPaths.length === 0 || !currentPath) return;
    try {
      const newPaths = await invoke<string[]>('duplicate_items', { paths: selectedPaths });
      await loadDirectory(currentPath);
      setSelectedPaths(newPaths);
    } catch (e) {
      console.error('복제 실패:', e);
    }
  }, [selectedPaths, currentPath, loadDirectory]);

  const handleCreateDirectory = useCallback(async () => {
    if (!currentPath) return;
    const sep = currentPath.includes('/') ? '/' : '\\';
    // 중복 방지: "새 폴더", "새 폴더 2", "새 폴더 3"...
    let baseName = '새 폴더';
    let candidate = baseName;
    let counter = 2;
    const existingNames = new Set(entries.map(e => e.name));
    while (existingNames.has(candidate)) {
      candidate = `${baseName} ${counter++}`;
    }
    const newPath = `${currentPath}${sep}${candidate}`;
    try {
      await invoke('create_directory', { path: newPath });
      await loadDirectory(currentPath);
      // 생성 후 바로 인라인 이름변경 시작
      setRenamingPath(newPath);
      setSelectedPaths([newPath]);
    } catch (e) {
      console.error('폴더 생성 실패:', e);
    }
  }, [currentPath, loadDirectory, entries]);

  const handleRenameStart = useCallback((path: string) => {
    setRenamingPath(path);
    setContextMenu(null);
  }, []);

  // 일괄 이름변경 모달 열기
  const handleBulkRename = useCallback((paths: string[]) => {
    setBulkRenamePaths(paths);
    setContextMenu(null);
  }, []);

  // 일괄 이름변경 적용
  const handleBulkRenameApply = useCallback(async (renames: { oldPath: string; newPath: string }[]) => {
    for (const { oldPath, newPath } of renames) {
      await invoke('rename_item', { oldPath, newPath });
    }
    if (currentPath) {
      const result = await invoke<FileEntry[]>('list_directory', { path: currentPath });
      setEntries(sortEntries(result, sortBy, sortDir));
    }
    setSelectedPaths([]);
    window.dispatchEvent(new Event('qf-files-changed'));
  }, [currentPath, sortBy, sortDir]);

  const handleRenameCommit = useCallback(async (oldPath: string, newName: string) => {
    setRenamingPath(null);
    if (!newName.trim()) return;
    const sep = oldPath.includes('/') ? '/' : '\\';

    // 유틸: 파일 베이스명과 확장자 분리
    const getBaseName = (p: string) => {
      const name = p.split(/[/\\]/).pop() ?? '';
      const dot = name.lastIndexOf('.');
      return dot > 0 ? name.substring(0, dot) : name;
    };
    const getExt = (p: string) => {
      const name = p.split(/[/\\]/).pop() ?? '';
      const dot = name.lastIndexOf('.');
      return dot > 0 ? name.substring(dot) : '';
    };

    // 새 이름에서 베이스명 추출
    const newBaseName = getBaseName(newName) || newName;
    const newExt = getExt(newName);

    // 일괄 이름변경 대상 결정: 선택된 파일 중 동일 베이스명만
    const oldBaseName = getBaseName(oldPath);
    const batchPaths = selectedPaths.length > 1
      ? selectedPaths.filter(p => getBaseName(p) === oldBaseName)
      : [oldPath];

    try {
      const renamedPaths: string[] = [];
      for (const p of batchPaths) {
        const dir = p.substring(0, p.lastIndexOf(sep));
        // 대표 파일은 입력한 확장자 사용, 나머지는 기존 확장자 유지
        const ext = p === oldPath ? newExt : getExt(p);
        const targetName = newBaseName + ext;
        const targetPath = dir + sep + targetName;
        if (targetPath !== p) {
          await invoke('rename_item', { oldPath: p, newPath: targetPath });
        }
        renamedPaths.push(targetPath);
      }

      // 이름 변경 후 디렉토리 재로드
      const result = await invoke<FileEntry[]>('list_directory', { path: currentPath });
      const sorted = sortEntries(result, sortBy, sortDir);
      setEntries(sorted);
      setSelectedPaths(renamedPaths);
      const idx = sorted.findIndex(e => renamedPaths.includes(e.path));
      if (idx >= 0) setFocusedIndex(idx);
    } catch (e) {
      console.error('이름 변경 실패:', e);
    }
  }, [currentPath, selectedPaths, sortBy, sortDir]);

  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await invoke('copy_path', { path });
    } catch (e) {
      console.error('경로 복사 실패:', e);
    }
  }, []);

  // --- ZIP 압축 ---
  const handleCompressZip = useCallback(async (paths: string[]) => {
    if (paths.length === 0 || !currentPath) return;
    const sep = currentPath.includes('/') ? '/' : '\\';
    const firstName = paths[0].split(/[/\\]/).pop() ?? 'archive';
    const baseName = paths.length === 1 ? firstName.replace(/\.[^.]+$/, '') : (currentPath.split(/[/\\]/).pop() ?? 'archive');
    const zipPath = `${currentPath}${sep}${baseName}.zip`;
    try {
      await invoke('compress_to_zip', { paths, dest: zipPath });
      loadDirectory(currentPath);
    } catch (e) {
      console.error('압축 실패:', e);
    }
  }, [currentPath, loadDirectory]);

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

  // --- 키보드 단축키 ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 분할 뷰: 포커스된 패널만 키보드 단축키 응답
      if (!isFocused) return;
      if (renamingPath) return;
      const active = document.activeElement;
      const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
      if (isInput && e.key !== 'Escape') return;

      const ctrl = e.ctrlKey || e.metaKey;
      const isMac = navigator.platform.startsWith('Mac');

      // --- 탭 단축키 ---
      // Ctrl+W: 현재 탭 닫기
      if (ctrl && !e.altKey && e.key === 'w') {
        e.preventDefault();
        if (tabs.length > 1 && activeTabId) handleTabClose(activeTabId);
        return;
      }
      // Ctrl+Alt+W: 현재 탭만 남기고 나머지 모두 닫기
      if (ctrl && e.altKey && e.key === 'w') {
        e.preventDefault();
        closeOtherTabs();
        return;
      }
      // Ctrl+T: 현재 탭 복제
      if (ctrl && e.key === 't') {
        e.preventDefault();
        duplicateTab();
        return;
      }

      // Tab / Shift+Tab: 탭 순환
      if (e.key === 'Tab' && !isInput) {
        e.preventDefault();
        if (tabs.length <= 1) return;
        const currentIdx = tabs.findIndex(t => t.id === activeTabId);
        if (e.shiftKey) {
          const prevIdx = (currentIdx - 1 + tabs.length) % tabs.length;
          handleTabSelect(tabs[prevIdx].id);
        } else {
          const nextIdx = (currentIdx + 1) % tabs.length;
          handleTabSelect(tabs[nextIdx].id);
        }
        return;
      }

      // --- 내비게이션 ---
      if (isMac) {
        if (ctrl && e.key === '[') { e.preventDefault(); goBack(); return; }
        if (ctrl && e.key === ']') { e.preventDefault(); goForward(); return; }
        if (ctrl && e.key === 'ArrowUp') { e.preventDefault(); goUp(); return; }
        if (ctrl && e.key === 'ArrowDown') {
          if (selectedPaths.length === 1) {
            const entry = entries.find(en => en.path === selectedPaths[0]);
            if (entry) { e.preventDefault(); openEntry(entry); return; }
          }
        }
      } else {
        if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); return; }
        if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); return; }
        if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); goUp(); return; }
        // Windows: Alt+↓ 로 폴더/파일 진입
        if (e.altKey && e.key === 'ArrowDown') {
          if (selectedPaths.length === 1) {
            const entry = entries.find(en => en.path === selectedPaths[0]);
            if (entry) { e.preventDefault(); openEntry(entry); return; }
          }
        }
      }

      // Ctrl+F: 검색 토글
      if (ctrl && e.key === 'f') {
        e.preventDefault();
        setIsSearchActive(prev => {
          if (prev) { setSearchQuery(''); return false; }
          setTimeout(() => searchInputRef.current?.focus(), 0);
          return true;
        });
        return;
      }

      // ESC: 검색 닫기 → 클립보드 해제 → 선택 해제
      if (e.key === 'Escape') {
        if (isSearchActive) { setSearchQuery(''); setIsSearchActive(false); return; }
        if (clipboard) { setClipboard(null); return; }
        deselectAll();
        return;
      }

      // Mac: ⌫/Delete 키로 파일 삭제 (선택 있을 때), 미선택 시 뒤로 이동
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        if (selectedPaths.length > 0) {
          handleDelete(selectedPaths, e.shiftKey);
          return;
        }
        if (e.key === 'Backspace' && !ctrl) { goBack(); return; }
      }

      if (e.key === 'Enter') {
        if (selectedPaths.length === 1) {
          const entry = entries.find(en => en.path === selectedPaths[0]);
          if (entry) { e.preventDefault(); openEntry(entry); return; }
        }
        return;
      }

      // --- Quick Look / 미리보기 (Spacebar 토글) ---
      if (e.key === ' ') {
        e.preventDefault();
        // 미리보기가 이미 열려있으면 닫기만 수행 (토글)
        if (preview.isAnyPreviewOpen) {
          preview.closeAllPreviews();
          return;
        }
        // 선택된 파일이 하나일 때만 미리보기 열기
        if (selectedPaths.length !== 1) return;
        const entry = entries.find(en => en.path === selectedPaths[0]);
        if (!entry) return;

        if (entry.file_type === 'video') {
          // 동영상: 내장 비디오 플레이어
          preview.setVideoPlayerPath(entry.path);
        } else if (entry.file_type === 'image' || /\.psd$/i.test(entry.name)) {
          // 이미지/PSD: 내장 미리보기 모달
          preview.handlePreviewImage(entry.path);
        } else if (/\.psb$/i.test(entry.name) && isMac) {
          // PSB: psd 크레이트 미지원 → macOS Quick Look
          invoke('quick_look', { path: entry.path }).catch(console.error);
        } else if (['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'yaml', 'yml', 'toml', 'xml', 'csv', 'log'].includes(entry.name.split('.').pop()?.toLowerCase() ?? '')) {
          // 텍스트 파일: 내장 텍스트 미리보기
          preview.handlePreviewText(entry.path);
        } else if (isMac) {
          // macOS: Quick Look 폴백
          invoke('quick_look', { path: selectedPaths[0] }).catch(console.error);
        }
        return;
      }

      // --- 탐색기 줌 (Ctrl +/-) ---
      if (ctrl && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        cancelAllQueued();
        setThumbnailSize(prev => {
          const idx = THUMBNAIL_SIZES.indexOf(prev);
          return THUMBNAIL_SIZES[Math.min(THUMBNAIL_SIZES.length - 1, idx + 1)];
        });
        return;
      }
      if (ctrl && e.key === '-') {
        e.preventDefault();
        cancelAllQueued();
        setThumbnailSize(prev => {
          const idx = THUMBNAIL_SIZES.indexOf(prev);
          return THUMBNAIL_SIZES[Math.max(0, idx - 1)];
        });
        return;
      }
      if (ctrl && e.key === '0') {
        e.preventDefault();
        cancelAllQueued();
        setThumbnailSize(120);
        return;
      }

      // --- 파일 조작 ---
      if (ctrl && e.key === 'a') { e.preventDefault(); selectAll(); return; }
      if (ctrl && e.key === 'c') { handleCopy(); return; }
      if (ctrl && e.key === 'x') { handleCut(); return; }
      if (ctrl && e.key === 'v') { handlePaste(); return; }
      if (ctrl && e.key === 'd') { e.preventDefault(); handleDuplicate(); return; }
      if (ctrl && e.shiftKey && (e.key === 'N' || e.key === 'n' || e.code === 'KeyN')) { e.preventDefault(); handleCreateDirectory(); return; }

      if (e.key === 'F2') {
        if (selectedPaths.length === 1) {
          handleRenameStart(selectedPaths[0]);
        } else if (selectedPaths.length > 1) {
          // 동일 베이스명(확장자만 다름) → 인라인 이름변경 (커밋 시 일괄 적용)
          // 다른 이름 섞임 → 일괄 이름변경 모달
          const getBaseName = (p: string) => {
            const name = p.split(/[/\\]/).pop() ?? '';
            const dot = name.lastIndexOf('.');
            return dot > 0 ? name.substring(0, dot) : name;
          };
          const baseNames = new Set(selectedPaths.map(getBaseName));
          if (baseNames.size === 1) {
            handleRenameStart(selectedPaths[0]);
          } else {
            handleBulkRename(selectedPaths);
          }
        }
        return;
      }

      // Windows: Delete 키로 파일 삭제
      if (e.key === 'Delete') {
        if (selectedPaths.length > 0) {
          handleDelete(selectedPaths, e.shiftKey);
        }
        return;
      }

      // --- 방향키 포커스 이동 ---
      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        if (entries.length === 0) return;

        const cols = (() => {
          if (!gridRef.current) return 4;
          const cardWidth = thumbnailSize + 16 + 8;
          return Math.max(1, Math.floor(gridRef.current.clientWidth / cardWidth));
        })();

        const current = focusedIndex < 0 ? 0 : focusedIndex;
        let next = current;

        // 경계에서 멈추기: 이동 가능한 경우에만 이동
        if (e.key === 'ArrowRight' && current < entries.length - 1) next = current + 1;
        else if (e.key === 'ArrowLeft' && current > 0) next = current - 1;
        else if (e.key === 'ArrowDown' && current + cols <= entries.length - 1) next = current + cols;
        else if (e.key === 'ArrowUp' && current - cols >= 0) next = current - cols;

        setFocusedIndex(next);

        if (e.shiftKey) {
          // Shift+방향키: 앵커~이동 위치까지 범위 선택 (반대 방향 이동 시 축소)
          if (selectionAnchorRef.current < 0) selectionAnchorRef.current = current;
          const from = Math.min(selectionAnchorRef.current, next);
          const to = Math.max(selectionAnchorRef.current, next);
          setSelectedPaths(entries.slice(from, to + 1).map(e => e.path));
        } else {
          selectionAnchorRef.current = -1;
          setSelectedPaths([entries[next].path]);
        }

        // 포커스된 항목이 화면에 보이도록 자동 스크롤
        requestAnimationFrame(() => {
          const el = gridRef.current?.querySelector(`[data-file-path="${CSS.escape(entries[next].path)}"]`);
          el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isFocused, renamingPath, selectAll, deselectAll, handleCopy, handleCut, handlePaste, handleDuplicate,
    handleCreateDirectory, handleRenameStart, handleDelete,
    goBack, goForward, goUp, selectedPaths, entries, openEntry,
    thumbnailSize, focusedIndex, clipboard, isSearchActive,
    tabs, activeTabId, activeTab, handleTabSelect, handleTabClose, duplicateTab, closeOtherTabs,
    preview.handlePreviewImage, preview.handlePreviewText,
    preview.isAnyPreviewOpen,
  ]);

  // --- 창 포커스 시 변경 감지 후 조건부 새로고침 ---
  // 파일이 변경되지 않았으면 리렌더링 하지 않아 깜빡임 방지
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const handleFocus = () => {
      if (!currentPath || renamingPath) return;
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
  }, [currentPath, renamingPath, sortBy, sortDir]);

  // --- 다른 패널에서 파일 이동 시 새로고침 ---
  useEffect(() => {
    const handler = () => { if (currentPath) loadDirectory(currentPath); };
    window.addEventListener('qf-files-changed', handler);
    return () => window.removeEventListener('qf-files-changed', handler);
  }, [currentPath, loadDirectory]);

  // --- Ctrl+마우스 휠 썸네일 확대/축소 ---
  // 터치패드 완전 차단: deltaMode=1(라인 단위) = 마우스 휠만 허용
  // deltaMode=0(픽셀 단위) = 터치패드이므로 차단 (핀치/스크롤 모두)
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      // 마우스 휠만 허용 (deltaMode=1: 라인 단위)
      // 터치패드는 deltaMode=0(픽셀 단위)이므로 모두 차단
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
      // Tauri는 물리 픽셀 좌표를 전달할 수 있으므로 두 좌표 체계 모두 확인
      const inBounds = (px: number, py: number) =>
        px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom;
      if (!inBounds(pos.x, pos.y) && !inBounds(pos.x / dpr, pos.y / dpr)) return;

      // 이미 같은 디렉토리에 있는 파일은 제외
      const filtered = droppedPaths.filter(p => {
        const sep = p.includes('/') ? '/' : '\\';
        const dir = p.substring(0, p.lastIndexOf(sep));
        return dir !== currentPath;
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
      className="h-full flex flex-col outline-none"
      tabIndex={0}
      onClick={handleContainerClick}
      style={{
        backgroundColor: themeVars?.bg ?? '#0f172a',
      }}
    >
      {/* 탭 바 */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={handleTabSelect}
        onTabClose={handleTabClose}
        onTabReorder={handleTabReorder}
        onTabReceive={handleTabReceive}
        onTabRemove={handleTabRemove}
        instanceId={instanceId}
        themeVars={themeVars}
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
            onCreateDirectory={handleCreateDirectory}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={(by, dir) => { setSortBy(by); setSortDir(dir); }}
            thumbnailSize={thumbnailSize}
            onThumbnailSizeChange={setThumbnailSize}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            isSearchActive={isSearchActive}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onSearchToggle={() => {
              setIsSearchActive(prev => {
                if (prev) { setSearchQuery(''); return false; }
                setTimeout(() => searchInputRef.current?.focus(), 0);
                return true;
              });
            }}
            searchInputRef={searchInputRef}
            activeExtFilters={activeExtFilters}
            availableExtensions={availableExtensions}
            onExtFilterToggle={(ext: string) => {
              setActiveExtFilters(prev => {
                const next = new Set(prev);
                if (next.has(ext)) next.delete(ext);
                else next.add(ext);
                return next;
              });
            }}
            onExtFilterClear={() => setActiveExtFilters(new Set())}
            splitMode={splitMode}
            onSplitModeChange={onSplitModeChange}
            themeVars={themeVars}
          />

          {/* 파일 그리드 */}
          <FileGrid
            entries={displayEntries}
            selectedPaths={selectedPaths}
            clipboard={clipboard}
            renamingPath={renamingPath}
            thumbnailSize={thumbnailSize}
            viewMode={viewMode}
            sortBy={sortBy}
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
            onContextMenu={handleContextMenu}
            onRenameCommit={handleRenameCommit}
            themeVars={themeVars}
          />

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
          paths={contextMenu.paths}
          clipboard={clipboard}
          entries={entries}
          onClose={closeContextMenu}
          onOpen={(path) => {
            const entry = entries.find(e => e.path === path);
            if (entry) openEntry(entry);
          }}
          onOpenInOs={openInOsExplorer}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onDelete={(paths) => handleDelete(paths, false)}
          onDuplicate={handleDuplicate}
          onRename={handleRenameStart}
          onCopyPath={handleCopyPath}
          onAddToFavorites={(path) => {
            const name = path.split(/[/\\]/).pop() ?? path;
            onAddToFavorites(path, name);
          }}
          onCompressZip={handleCompressZip}
          onPreviewPsd={preview.handlePreviewImage}
          onBulkRename={handleBulkRename}
        />
      )}

      {/* 일괄 이름변경 모달 */}
      {bulkRenamePaths && (
        <BulkRenameModal
          paths={bulkRenamePaths}
          onClose={() => setBulkRenamePaths(null)}
          onApply={handleBulkRenameApply}
          themeVars={themeVars}
        />
      )}
    </div>
  );
}
