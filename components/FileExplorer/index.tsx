import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry, ClipboardData, ThumbnailSize } from '../../types';
import { ThemeVars, Tab } from './types';
import NavigationBar from './NavigationBar';
import FileGrid from './FileGrid';
import ContextMenu from './ContextMenu';
import StatusBar from './StatusBar';
import TabBar from './TabBar';
import VideoPlayer from './VideoPlayer';
import { useInternalDragDrop } from './hooks/useInternalDragDrop';
import { cancelAllQueued } from './hooks/invokeQueue';

interface FileExplorerProps {
  instanceId?: string;   // 분할 뷰 시 localStorage 키 분리용 (기본: 'default')
  isFocused?: boolean;   // 포커스된 패널만 키보드 단축키 응답 (기본: true)
  splitMode?: 'single' | 'horizontal' | 'vertical';
  onSplitModeChange?: (mode: 'single' | 'horizontal' | 'vertical') => void;
  initialPath: string;
  onPathChange: (path: string) => void;
  onAddToFavorites: (path: string, name: string) => void;
  themeVars: ThemeVars | null;
}

const THUMBNAIL_SIZES: ThumbnailSize[] = [40, 60, 80, 100, 120, 160, 200, 240];
const TABS_KEY = 'qf_explorer_tabs';
const ACTIVE_TAB_KEY = 'qf_explorer_active_tab';

// 경로의 마지막 세그먼트를 탭 제목으로 사용
function pathTitle(path: string): string {
  return path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? path;
}

export default function FileExplorer({
  instanceId = 'default',
  isFocused = true,
  splitMode,
  onSplitModeChange,
  initialPath,
  onPathChange,
  onAddToFavorites,
  themeVars,
}: FileExplorerProps) {
  // --- localStorage 키 (instanceId로 분할 뷰 시 분리) ---
  const tabsKey = instanceId === 'default' ? TABS_KEY : `${TABS_KEY}_${instanceId}`;
  const activeTabKey = instanceId === 'default' ? ACTIVE_TAB_KEY : `${ACTIVE_TAB_KEY}_${instanceId}`;

  // --- 상태 ---
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified' | 'type'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [thumbnailSize, setThumbnailSize] = useState<ThumbnailSize>(120);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; paths: string[] } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'details'>('grid');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // --- 탭 상태 (localStorage 영속) ---
  const [tabs, setTabs] = useState<Tab[]>(() => {
    try { return JSON.parse(localStorage.getItem(tabsKey) ?? '[]'); }
    catch { return []; }
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    return localStorage.getItem(activeTabKey) ?? '';
  });

  // --- 검색/필터 상태 ---
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeExtFilters, setActiveExtFilters] = useState<Set<string>>(new Set());

  // --- 비디오 플레이어 상태 ---
  const [videoPlayerPath, setVideoPlayerPath] = useState<string | null>(null);

  // --- 이미지/PSD 미리보기 상태 ---
  const [previewImagePath, setPreviewImagePath] = useState<string | null>(null);
  const [previewImageData, setPreviewImageData] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // --- 텍스트 미리보기 상태 ---
  const [previewTextPath, setPreviewTextPath] = useState<string | null>(null);
  const [previewTextContent, setPreviewTextContent] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // 뒤로/위로 이동 시 이전 폴더를 자동 선택하기 위한 ref
  const lastVisitedChildRef = useRef<string | null>(null);

  // 활성 탭에서 파생된 값
  const activeTab = tabs.find(t => t.id === activeTabId) ?? null;
  const currentPath = activeTab?.path ?? '';
  const canGoBack = !!(activeTab && activeTab.historyIndex > 0);
  const canGoForward = !!(activeTab && activeTab.historyIndex < activeTab.history.length - 1);

  // --- 탭 localStorage 동기화 ---
  useEffect(() => {
    localStorage.setItem(tabsKey, JSON.stringify(tabs));
  }, [tabs, tabsKey]);

  useEffect(() => {
    localStorage.setItem(activeTabKey, activeTabId);
  }, [activeTabId, activeTabKey]);

  // --- 디렉토리 로딩 ---
  const loadDirectory = useCallback(async (path: string) => {
    if (!path) return;
    cancelAllQueued(); // 이전 디렉토리의 대기 중인 썸네일 요청 모두 취소
    setLoading(true);
    setError(null);
    setSelectedPaths([]);
    setFocusedIndex(-1);
    try {
      const result = await invoke<FileEntry[]>('list_directory', { path });
      const sortedResult = sortEntries(result, sortBy, sortDir);
      setEntries(sortedResult);
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
      setError(String(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortDir]);

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
    const existing = tabs.find(t => t.path === initialPath);
    if (existing) {
      setActiveTabId(existing.id);
      loadDirectory(initialPath);
    } else {
      const newTab: Tab = {
        id: crypto.randomUUID(),
        path: initialPath,
        history: [initialPath],
        historyIndex: 0,
        title: pathTitle(initialPath),
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
      loadDirectory(initialPath);
    }
  }, [initialPath]);

  // 앱 시작 시 저장된 탭이 있으면 마지막 활성 탭 로드
  useEffect(() => {
    if (activeTab && !initialPath) {
      loadDirectory(activeTab.path);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- 내비게이션 (탭 기반) ---
  const navigateTo = useCallback((path: string) => {
    setSearchQuery('');
    setIsSearchActive(false);
    const title = pathTitle(path);
    setTabs(prev => prev.map(tab => {
      if (tab.id !== activeTabId) return tab;
      const newHistory = tab.history.slice(0, tab.historyIndex + 1);
      return {
        ...tab,
        path,
        title,
        history: [...newHistory, path],
        historyIndex: newHistory.length,
      };
    }));
    onPathChange(path);
    loadDirectory(path);
  }, [activeTabId, onPathChange, loadDirectory]);

  const goBack = useCallback(() => {
    if (!activeTab || activeTab.historyIndex <= 0) return;
    const newPath = activeTab.history[activeTab.historyIndex - 1];
    const title = pathTitle(newPath);
    // 뒤로 이동 시 현재 경로를 저장하여 부모 디렉토리에서 자동 선택
    lastVisitedChildRef.current = currentPath;
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, path: newPath, title, historyIndex: t.historyIndex - 1 } : t
    ));
    onPathChange(newPath);
    loadDirectory(newPath);
  }, [activeTab, activeTabId, currentPath, onPathChange, loadDirectory]);

  const goForward = useCallback(() => {
    if (!activeTab || activeTab.historyIndex >= activeTab.history.length - 1) return;
    const newPath = activeTab.history[activeTab.historyIndex + 1];
    const title = pathTitle(newPath);
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, path: newPath, title, historyIndex: t.historyIndex + 1 } : t
    ));
    onPathChange(newPath);
    loadDirectory(newPath);
  }, [activeTab, activeTabId, onPathChange, loadDirectory]);

  const goUp = useCallback(() => {
    if (!currentPath) return;
    const sep = currentPath.includes('/') ? '/' : '\\';
    const parts = currentPath.replace(/[/\\]+$/, '').split(sep);
    if (parts.length <= 1) return;
    parts.pop();
    const parent = parts.join(sep) || sep;
    // 위로 이동 시 현재 경로를 저장하여 부모 디렉토리에서 자동 선택
    lastVisitedChildRef.current = currentPath;
    navigateTo(parent);
  }, [currentPath, navigateTo]);

  // --- 탭 관리 ---
  const handleTabSelect = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    setActiveTabId(tabId);
    loadDirectory(tab.path);
  }, [tabs, loadDirectory]);

  const handleTabClose = useCallback((tabId: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId);
      if (tabId === activeTabId && newTabs.length > 0) {
        const closedIdx = prev.findIndex(t => t.id === tabId);
        const nextTab = newTabs[Math.min(closedIdx, newTabs.length - 1)];
        setActiveTabId(nextTab.id);
        loadDirectory(nextTab.path);
      } else if (newTabs.length === 0) {
        setActiveTabId('');
      }
      return newTabs;
    });
  }, [activeTabId, loadDirectory]);

  // --- 탭 드래그 순서 변경 (같은 패널 내) ---
  const handleTabReorder = useCallback((fromIndex: number, toIndex: number) => {
    setTabs(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  // --- 다른 패널에서 탭을 받아오기 (교차 패널 이동) ---
  const handleTabReceive = useCallback((tab: Tab, insertIndex: number) => {
    setTabs(prev => {
      const next = [...prev];
      next.splice(insertIndex, 0, tab);
      return next;
    });
    setActiveTabId(tab.id);
    loadDirectory(tab.path);
  }, [loadDirectory]);

  // --- 다른 패널로 탭을 보낸 후 제거 (교차 패널 이동) ---
  const handleTabRemove = useCallback((tabId: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId);
      if (tabId === activeTabId && newTabs.length > 0) {
        const closedIdx = prev.findIndex(t => t.id === tabId);
        const nextTab = newTabs[Math.min(closedIdx, newTabs.length - 1)];
        setActiveTabId(nextTab.id);
        loadDirectory(nextTab.path);
      } else if (newTabs.length === 0) {
        // 탭이 모두 빠져나가면 single 모드로 자동 전환
        setActiveTabId('');
        if (onSplitModeChange) onSplitModeChange('single');
      }
      return newTabs;
    });
  }, [activeTabId, loadDirectory, onSplitModeChange]);

  // --- 파일/폴더 열기 ---
  const openEntry = useCallback(async (entry: FileEntry) => {
    if (entry.is_dir) {
      navigateTo(entry.path);
    } else if (entry.file_type === 'video') {
      // 동영상은 내장 플레이어로 재생
      setVideoPlayerPath(entry.path);
    } else {
      try {
        await invoke('open_folder', { path: entry.path });
      } catch (e) {
        console.error('파일 열기 실패:', e);
      }
    }
  }, [navigateTo]);

  const openInOsExplorer = useCallback(async (path: string) => {
    try {
      await invoke('open_folder', { path });
    } catch (e) {
      console.error('탐색기 열기 실패:', e);
    }
  }, []);

  // --- 선택 ---
  const selectEntry = useCallback((path: string, multi: boolean, range: boolean) => {
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

  // --- 파일 조작 ---
  const handleCopy = useCallback(() => {
    if (selectedPaths.length === 0) return;
    setClipboard({ paths: selectedPaths, action: 'copy' });
  }, [selectedPaths]);

  const handleCut = useCallback(() => {
    if (selectedPaths.length === 0) return;
    setClipboard({ paths: selectedPaths, action: 'cut' });
  }, [selectedPaths]);

  const handlePaste = useCallback(async () => {
    if (!clipboard || !currentPath) return;
    try {
      if (clipboard.action === 'copy') {
        await invoke('copy_items', { sources: clipboard.paths, dest: currentPath });
      } else {
        await invoke('move_items', { sources: clipboard.paths, dest: currentPath });
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
    const name = window.prompt('새 폴더 이름을 입력하세요:', '새 폴더');
    if (!name) return;
    const sep = currentPath.includes('/') ? '/' : '\\';
    const newPath = `${currentPath}${sep}${name}`;
    try {
      await invoke('create_directory', { path: newPath });
      loadDirectory(currentPath);
    } catch (e) {
      console.error('폴더 생성 실패:', e);
    }
  }, [currentPath, loadDirectory]);

  const handleRenameStart = useCallback((path: string) => {
    setRenamingPath(path);
    setContextMenu(null);
  }, []);

  const handleRenameCommit = useCallback(async (oldPath: string, newName: string) => {
    setRenamingPath(null);
    if (!newName.trim()) return;
    const sep = oldPath.includes('/') ? '/' : '\\';
    const parts = oldPath.split(sep);
    parts[parts.length - 1] = newName;
    const newPath = parts.join(sep);
    if (newPath === oldPath) return;
    try {
      await invoke('rename_item', { oldPath, newPath });
      loadDirectory(currentPath);
    } catch (e) {
      console.error('이름 변경 실패:', e);
    }
  }, [currentPath, loadDirectory]);

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

  // --- 이미지/PSD 미리보기 ---
  const handlePreviewImage = useCallback(async (path: string) => {
    setPreviewImagePath(path);
    setPreviewImageData(null);
    setPreviewLoading(true);
    try {
      const isPsd = path.toLowerCase().endsWith('.psd');
      const cmd = isPsd ? 'get_psd_thumbnail' : 'get_file_thumbnail';
      // 미리보기용 큰 해상도
      const b64 = await invoke<string | null>(cmd, { path, size: 800 });
      if (b64) {
        setPreviewImageData(`data:image/png;base64,${b64}`);
      }
    } catch {
      // 미리보기 생성 실패
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // --- 텍스트 파일 미리보기 ---
  const handlePreviewText = useCallback(async (path: string) => {
    setPreviewTextPath(path);
    setPreviewTextContent(null);
    try {
      const content = await invoke<string>('read_text_file', { path, maxBytes: 100000 });
      setPreviewTextContent(content);
    } catch {
      setPreviewTextContent('파일을 읽을 수 없습니다.');
    }
  }, []);

  // --- 컨텍스트 메뉴 ---
  const handleContextMenu = useCallback((e: React.MouseEvent, paths: string[]) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, paths });
  }, []);

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
      // Ctrl+T: 현재 탭 복제
      if (ctrl && e.key === 't') {
        e.preventDefault();
        if (!activeTab) return;
        const newTab: Tab = {
          id: crypto.randomUUID(),
          path: activeTab.path,
          history: [activeTab.path],
          historyIndex: 0,
          title: activeTab.title,
        };
        setTabs(prev => {
          const idx = prev.findIndex(t => t.id === activeTabId);
          return [...prev.slice(0, idx + 1), newTab, ...prev.slice(idx + 1)];
        });
        setActiveTabId(newTab.id);
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

      // Mac: ⌫ 키로 파일 삭제 (선택 있을 때), 미선택 시 뒤로 이동
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (isMac && selectedPaths.length > 0) {
          handleDelete(selectedPaths, e.shiftKey);
          return;
        }
        if (!ctrl) { goBack(); return; }
      }

      if (e.key === 'Enter') {
        if (selectedPaths.length === 1) {
          const entry = entries.find(en => en.path === selectedPaths[0]);
          if (entry) { e.preventDefault(); openEntry(entry); return; }
        }
        return;
      }

      // --- Quick Look / 미리보기 (Spacebar 토글) ---
      if (e.key === ' ' && selectedPaths.length === 1) {
        e.preventDefault();
        // 미리보기가 이미 열려있으면 닫기 (토글)
        if (previewImagePath || videoPlayerPath || previewTextPath) {
          setPreviewImagePath(null); setPreviewImageData(null);
          setVideoPlayerPath(null);
          setPreviewTextPath(null); setPreviewTextContent(null);
          return;
        }
        const entry = entries.find(en => en.path === selectedPaths[0]);
        if (!entry) return;

        if (entry.file_type === 'video') {
          // 동영상: 내장 비디오 플레이어
          setVideoPlayerPath(entry.path);
        } else if (entry.file_type === 'image' || entry.name.toLowerCase().endsWith('.psd')) {
          // 이미지/PSD: 내장 미리보기 모달
          handlePreviewImage(entry.path);
        } else if (['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'yaml', 'yml', 'toml', 'xml', 'csv', 'log'].includes(entry.name.split('.').pop()?.toLowerCase() ?? '')) {
          // 텍스트 파일: 내장 텍스트 미리보기
          handlePreviewText(entry.path);
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
      if (ctrl && e.shiftKey && e.key === 'N') { e.preventDefault(); handleCreateDirectory(); return; }

      if (e.key === 'F2') {
        if (selectedPaths.length === 1) handleRenameStart(selectedPaths[0]);
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

        const current = focusedIndex < 0 ? -1 : focusedIndex;
        let next = current;

        if (e.key === 'ArrowRight') next = Math.min(entries.length - 1, current + 1);
        else if (e.key === 'ArrowLeft') next = Math.max(0, current - 1);
        else if (e.key === 'ArrowDown') next = Math.min(entries.length - 1, current + cols);
        else if (e.key === 'ArrowUp') next = Math.max(0, current - cols);

        if (next < 0) next = 0;
        setFocusedIndex(next);
        setSelectedPaths([entries[next].path]);
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
    tabs, activeTabId, activeTab, handleTabSelect,
    handlePreviewImage, handlePreviewText,
  ]);

  // --- 창 포커스 시 현재 디렉토리 자동 새로고침 ---
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const handleFocus = () => {
      if (currentPath && !renamingPath) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => loadDirectory(currentPath), 300);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => { window.removeEventListener('focus', handleFocus); clearTimeout(timeoutId); };
  }, [currentPath, loadDirectory, renamingPath]);

  // --- 다른 패널에서 파일 이동 시 새로고침 ---
  useEffect(() => {
    const handler = () => { if (currentPath) loadDirectory(currentPath); };
    window.addEventListener('qf-files-changed', handler);
    return () => window.removeEventListener('qf-files-changed', handler);
  }, [currentPath, loadDirectory]);

  // --- Ctrl+마우스 휠 썸네일 확대/축소 ---
  // 터치패드 핀치 줌 방지: ctrlKey가 true여도 deltaMode=0 + 비정수 deltaY이면 핀치 제스처
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      // 터치패드 핀치 제스처 필터: deltaMode=0(픽셀) + 소수점 deltaY = 핀치
      if (e.deltaMode === 0 && !Number.isInteger(e.deltaY)) return;
      cancelAllQueued(); // 줌 변경 시 대기 중인 썸네일 요청 모두 취소
      const direction = e.deltaY < 0 ? 1 : -1;
      setThumbnailSize(prev => {
        const idx = THUMBNAIL_SIZES.indexOf(prev);
        return THUMBNAIL_SIZES[Math.max(0, Math.min(THUMBNAIL_SIZES.length - 1, idx + direction))];
      });
    };
    window.addEventListener('wheel', handler, { passive: false });
    return () => window.removeEventListener('wheel', handler);
  }, []);

  // --- 내부 드래그 → 폴더 이동 ---
  const { isDragging: isInternalDragging, dropTargetPath, handleDragMouseDown } = useInternalDragDrop({
    selectedPaths,
    currentPath,
    onMoveComplete: () => loadDirectory(currentPath),
  });

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
            onNavigate={navigateTo}
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

      {/* 비디오 플레이어 모달 */}
      {videoPlayerPath && (
        <VideoPlayer
          path={videoPlayerPath}
          onClose={() => setVideoPlayerPath(null)}
          themeVars={themeVars}
        />
      )}

      {/* 이미지/PSD 미리보기 모달 */}
      {previewImagePath && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={() => { setPreviewImagePath(null); setPreviewImageData(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setPreviewImagePath(null); setPreviewImageData(null); } }}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] rounded-lg overflow-hidden shadow-2xl"
            style={{ backgroundColor: themeVars?.surface2 ?? '#1e293b' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}>
              <span className="text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                {previewImagePath.split(/[/\\]/).pop()}
              </span>
              <button
                className="text-lg px-2 hover:opacity-70"
                style={{ color: themeVars?.muted ?? '#94a3b8' }}
                onClick={() => { setPreviewImagePath(null); setPreviewImageData(null); }}
              >
                ✕
              </button>
            </div>
            {/* 이미지 */}
            <div className="flex items-center justify-center p-4" style={{ minWidth: 300, minHeight: 200 }}>
              {previewLoading ? (
                <span className="text-sm" style={{ color: themeVars?.muted ?? '#94a3b8' }}>로딩 중...</span>
              ) : previewImageData ? (
                <img
                  src={previewImageData}
                  alt="미리보기"
                  className="max-w-[85vw] max-h-[80vh] object-contain"
                />
              ) : (
                <span className="text-sm" style={{ color: themeVars?.muted ?? '#94a3b8' }}>미리보기를 생성할 수 없습니다</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 텍스트 미리보기 모달 */}
      {previewTextPath && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={() => { setPreviewTextPath(null); setPreviewTextContent(null); }}
        >
          <div
            className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
            style={{
              backgroundColor: themeVars?.surface2 ?? '#1e293b',
              width: '70vw', maxWidth: 800, maxHeight: '85vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}>
              <span className="text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                {previewTextPath.split(/[/\\]/).pop()}
              </span>
              <button
                className="text-lg px-2 hover:opacity-70"
                style={{ color: themeVars?.muted ?? '#94a3b8' }}
                onClick={() => { setPreviewTextPath(null); setPreviewTextContent(null); }}
              >
                ✕
              </button>
            </div>
            {/* 텍스트 내용 */}
            <pre
              className="flex-1 overflow-auto p-4 text-xs leading-relaxed whitespace-pre-wrap"
              style={{ color: themeVars?.text ?? '#e5e7eb', maxHeight: '75vh' }}
            >
              {previewTextContent ?? '로딩 중...'}
            </pre>
          </div>
        </div>
      )}

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
          onPreviewPsd={handlePreviewImage}
        />
      )}
    </div>
  );
}
