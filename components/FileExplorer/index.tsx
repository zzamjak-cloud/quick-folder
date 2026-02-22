import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry, ClipboardData, ThumbnailSize } from '../../types';
import { ThemeVars, Tab } from './types';
import NavigationBar from './NavigationBar';
import FileGrid from './FileGrid';
import ContextMenu from './ContextMenu';
import StatusBar from './StatusBar';
import TabBar from './TabBar';

interface FileExplorerProps {
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
  initialPath,
  onPathChange,
  onAddToFavorites,
  themeVars,
}: FileExplorerProps) {
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
    try { return JSON.parse(localStorage.getItem(TABS_KEY) ?? '[]'); }
    catch { return []; }
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    return localStorage.getItem(ACTIVE_TAB_KEY) ?? '';
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // 활성 탭에서 파생된 값
  const activeTab = tabs.find(t => t.id === activeTabId) ?? null;
  const currentPath = activeTab?.path ?? '';
  const canGoBack = !!(activeTab && activeTab.historyIndex > 0);
  const canGoForward = !!(activeTab && activeTab.historyIndex < activeTab.history.length - 1);

  // --- 탭 localStorage 동기화 ---
  useEffect(() => {
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_TAB_KEY, activeTabId);
  }, [activeTabId]);

  // --- 디렉토리 로딩 ---
  const loadDirectory = useCallback(async (path: string) => {
    if (!path) return;
    setLoading(true);
    setError(null);
    setSelectedPaths([]);
    setFocusedIndex(-1);
    try {
      const result = await invoke<FileEntry[]>('list_directory', { path });
      setEntries(sortEntries(result, sortBy, sortDir));
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
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, path: newPath, title, historyIndex: t.historyIndex - 1 } : t
    ));
    onPathChange(newPath);
    loadDirectory(newPath);
  }, [activeTab, activeTabId, onPathChange, loadDirectory]);

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

  // --- 파일/폴더 열기 ---
  const openEntry = useCallback(async (entry: FileEntry) => {
    if (entry.is_dir) {
      navigateTo(entry.path);
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
      }

      if (e.key === 'Backspace') { e.preventDefault(); goBack(); return; }

      if (e.key === 'Enter') {
        if (selectedPaths.length === 1) {
          const entry = entries.find(en => en.path === selectedPaths[0]);
          if (entry) { e.preventDefault(); openEntry(entry); return; }
        }
        return;
      }

      // --- Quick Look (Spacebar) ---
      if (e.key === ' ' && selectedPaths.length === 1) {
        e.preventDefault();
        invoke('quick_look', { path: selectedPaths[0] }).catch(console.error);
        return;
      }

      // --- 탐색기 줌 (Ctrl +/-) ---
      if (ctrl && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setThumbnailSize(prev => {
          const idx = THUMBNAIL_SIZES.indexOf(prev);
          return THUMBNAIL_SIZES[Math.min(THUMBNAIL_SIZES.length - 1, idx + 1)];
        });
        return;
      }
      if (ctrl && e.key === '-') {
        e.preventDefault();
        setThumbnailSize(prev => {
          const idx = THUMBNAIL_SIZES.indexOf(prev);
          return THUMBNAIL_SIZES[Math.max(0, idx - 1)];
        });
        return;
      }
      if (ctrl && e.key === '0') {
        e.preventDefault();
        setThumbnailSize(120);
        return;
      }

      // --- 파일 조작 ---
      if (ctrl && e.key === 'a') { e.preventDefault(); selectAll(); return; }
      if (ctrl && e.key === 'c') { handleCopy(); return; }
      if (ctrl && e.key === 'x') { handleCut(); return; }
      if (ctrl && e.key === 'v') { handlePaste(); return; }
      if (ctrl && e.shiftKey && e.key === 'N') { e.preventDefault(); handleCreateDirectory(); return; }

      if (e.key === 'F2') {
        if (selectedPaths.length === 1) handleRenameStart(selectedPaths[0]);
        return;
      }

      if (e.key === 'Delete' || (isMac && ctrl && e.key === 'Backspace')) {
        if (e.shiftKey) {
          handleDelete(selectedPaths, true);
        } else {
          handleDelete(selectedPaths, false);
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
    renamingPath, selectAll, handleCopy, handleCut, handlePaste,
    handleCreateDirectory, handleRenameStart, handleDelete,
    goBack, goForward, goUp, selectedPaths, entries, openEntry,
    thumbnailSize, focusedIndex,
    tabs, activeTabId, activeTab, handleTabSelect,
  ]);

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
      className="h-full flex flex-col outline-none"
      tabIndex={0}
      onClick={handleContainerClick}
      style={{ backgroundColor: themeVars?.bg ?? '#0f172a' }}
    >
      {/* 탭 바 */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={handleTabSelect}
        onTabClose={handleTabClose}
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
            themeVars={themeVars}
          />

          {/* 파일 그리드 */}
          <FileGrid
            entries={entries}
            selectedPaths={selectedPaths}
            renamingPath={renamingPath}
            thumbnailSize={thumbnailSize}
            viewMode={viewMode}
            sortBy={sortBy}
            focusedIndex={focusedIndex}
            gridRef={gridRef}
            loading={loading}
            error={error}
            onSelect={selectEntry}
            onDeselectAll={deselectAll}
            onOpen={openEntry}
            onContextMenu={handleContextMenu}
            onRenameCommit={handleRenameCommit}
            themeVars={themeVars}
          />

          {/* 상태 바 */}
          <StatusBar
            entries={entries}
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
          onRename={handleRenameStart}
          onCopyPath={handleCopyPath}
          onAddToFavorites={(path) => {
            const name = path.split(/[/\\]/).pop() ?? path;
            onAddToFavorites(path, name);
          }}
        />
      )}
    </div>
  );
}
