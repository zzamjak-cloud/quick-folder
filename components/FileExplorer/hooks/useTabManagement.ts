import { useState, useEffect, useCallback, useRef } from 'react';
import { Tab } from '../types';
import { getFileName } from '../../../utils/pathUtils';

// localStorage 키
const TABS_KEY = 'qf_explorer_tabs';
const ACTIVE_TAB_KEY = 'qf_explorer_active_tab';

const RECENT_PATH = '__recent__';

function pathTitle(path: string): string {
  if (path === RECENT_PATH) return '최근항목';
  if (!path) return '';
  return getFileName(path.replace(/[/\\]+$/, ''));
}

interface UseTabManagementOptions {
  instanceId: string;
  loadDirectory: (path: string) => void;
  onPathChange: (path: string) => void;
  onSplitModeChange?: (mode: 'single' | 'horizontal' | 'vertical') => void;
}

export function useTabManagement({
  instanceId,
  loadDirectory,
  onPathChange,
  onSplitModeChange,
}: UseTabManagementOptions) {
  const tabsKey = instanceId === 'default' ? TABS_KEY : `${TABS_KEY}_${instanceId}`;
  const activeTabKey = instanceId === 'default' ? ACTIVE_TAB_KEY : `${ACTIVE_TAB_KEY}_${instanceId}`;

  const [tabs, setTabs] = useState<Tab[]>(() => {
    try { return JSON.parse(localStorage.getItem(tabsKey) ?? '[]'); }
    catch { return []; }
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    return localStorage.getItem(activeTabKey) ?? '';
  });

  // 파생 값
  const activeTab = tabs.find(t => t.id === activeTabId) ?? null;
  const currentPath = activeTab?.path ?? '';
  const canGoBack = !!(activeTab && activeTab.historyIndex > 0);
  const canGoForward = !!(activeTab && activeTab.historyIndex < activeTab.history.length - 1);

  // localStorage 동기화
  useEffect(() => {
    localStorage.setItem(tabsKey, JSON.stringify(tabs));
  }, [tabs, tabsKey]);

  useEffect(() => {
    localStorage.setItem(activeTabKey, activeTabId);
  }, [activeTabId, activeTabKey]);

  // --- 탭 생성/전환 ---
  const openTab = useCallback((path: string) => {
    const existing = tabs.find(t => t.path === path);
    if (existing) {
      setActiveTabId(existing.id);
      loadDirectory(path);
    } else {
      const newTab: Tab = {
        id: crypto.randomUUID(),
        path,
        history: [path],
        historyIndex: 0,
        title: pathTitle(path),
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
      loadDirectory(path);
    }
  }, [tabs, loadDirectory]);

  // --- 내비게이션 ---
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

  const goBack = useCallback((): string | null => {
    if (!activeTab || activeTab.historyIndex <= 0) return null;
    const newPath = activeTab.history[activeTab.historyIndex - 1];
    const title = pathTitle(newPath);
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, path: newPath, title, historyIndex: t.historyIndex - 1 } : t
    ));
    onPathChange(newPath);
    loadDirectory(newPath);
    return currentPath; // 이전 경로 반환 (자동 선택용)
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

  // --- 탭 조작 ---
  const handleTabSelect = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    setActiveTabId(tabId);
    loadDirectory(tab.path);
  }, [tabs, loadDirectory]);

  const handleTabClose = useCallback((tabId: string) => {
    // 고정된 탭은 닫을 수 없음
    setTabs(prev => {
      const target = prev.find(t => t.id === tabId);
      if (target?.pinned) return prev;
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

  const handleTabReorder = useCallback((fromIndex: number, toIndex: number) => {
    setTabs(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const handleTabReceive = useCallback((tab: Tab, insertIndex: number) => {
    setTabs(prev => {
      const next = [...prev];
      next.splice(insertIndex, 0, tab);
      return next;
    });
    setActiveTabId(tab.id);
    loadDirectory(tab.path);
  }, [loadDirectory]);

  const handleTabRemove = useCallback((tabId: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId);
      if (tabId === activeTabId && newTabs.length > 0) {
        const closedIdx = prev.findIndex(t => t.id === tabId);
        const nextTab = newTabs[Math.min(closedIdx, newTabs.length - 1)];
        setActiveTabId(nextTab.id);
        loadDirectory(nextTab.path);
      } else if (newTabs.length === 0) {
        setActiveTabId('');
        if (onSplitModeChange) onSplitModeChange('single');
      }
      return newTabs;
    });
  }, [activeTabId, loadDirectory, onSplitModeChange]);

  // 현재 탭 복제 (Ctrl+T)
  const duplicateTab = useCallback(() => {
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
  }, [activeTab, activeTabId]);

  // 현재 탭만 남기고 나머지 닫기 (Ctrl+Alt+W) — 고정 탭은 유지
  const closeOtherTabs = useCallback(() => {
    if (tabs.length > 1 && activeTabId) {
      setTabs(prev => prev.filter(t => t.id === activeTabId || t.pinned));
    }
  }, [tabs.length, activeTabId]);

  // 탭 고정/해제 토글
  const togglePinTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const updated = prev.map(t =>
        t.id === tabId ? { ...t, pinned: !t.pinned } : t
      );
      // 고정 탭을 왼쪽에 모음
      const pinned = updated.filter(t => t.pinned);
      const unpinned = updated.filter(t => !t.pinned);
      return [...pinned, ...unpinned];
    });
  }, []);

  // --- 이벤트 기반 탭 경로 동기화 ---
  // setTabs를 ref로 감싸서 이벤트 핸들러에서 최신 상태 접근
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  useEffect(() => {
    // 폴더 이름 변경 이벤트: { oldPath, newPath }
    const handleRename = (e: Event) => {
      const { oldPath, newPath } = (e as CustomEvent).detail;
      setTabs(prev => {
        let changed = false;
        const updated = prev.map(tab => {
          if (tab.path === oldPath || tab.path.startsWith(oldPath + '/') || tab.path.startsWith(oldPath + '\\')) {
            changed = true;
            const updatedPath = tab.path === oldPath
              ? newPath
              : newPath + tab.path.slice(oldPath.length);
            const updatedHistory = tab.history.map(h => {
              if (h === oldPath) return newPath;
              if (h.startsWith(oldPath + '/') || h.startsWith(oldPath + '\\')) {
                return newPath + h.slice(oldPath.length);
              }
              return h;
            });
            return { ...tab, path: updatedPath, title: pathTitle(updatedPath), history: updatedHistory };
          }
          return tab;
        });
        return changed ? updated : prev;
      });
    };

    // 폴더 삭제 이벤트: { paths }
    const handleDelete = (e: Event) => {
      const { paths: deletedPaths } = (e as CustomEvent).detail;
      setTabs(prev => {
        const shouldRemove = (tab: Tab) =>
          deletedPaths.some((dp: string) =>
            tab.path === dp || tab.path.startsWith(dp + '/') || tab.path.startsWith(dp + '\\')
          );
        const remaining = prev.filter(t => !shouldRemove(t));
        if (remaining.length === prev.length) return prev;
        if (!remaining.find(t => t.id === activeTabIdRef.current) && remaining.length > 0) {
          const nextTab = remaining[0];
          setActiveTabId(nextTab.id);
          loadDirectory(nextTab.path);
        } else if (remaining.length === 0) {
          setActiveTabId('');
        }
        return remaining;
      });
    };

    // 사이드바에서 Ctrl+클릭으로 새 탭 열기
    const handleOpenNewTab = (e: Event) => {
      const { path } = (e as CustomEvent).detail;
      const newTab: Tab = {
        id: crypto.randomUUID(),
        path,
        history: [path],
        historyIndex: 0,
        title: pathTitle(path),
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
      loadDirectory(path);
    };

    window.addEventListener('qf-tab-rename', handleRename);
    window.addEventListener('qf-tab-delete', handleDelete);
    window.addEventListener('qf-open-new-tab', handleOpenNewTab);
    return () => {
      window.removeEventListener('qf-tab-rename', handleRename);
      window.removeEventListener('qf-tab-delete', handleDelete);
      window.removeEventListener('qf-open-new-tab', handleOpenNewTab);
    };
  }, [loadDirectory]);

  return {
    tabs, activeTabId, activeTab, currentPath,
    canGoBack, canGoForward,
    openTab, navigateTo, goBack, goForward,
    handleTabSelect, handleTabClose, handleTabReorder,
    handleTabReceive, handleTabRemove,
    duplicateTab, closeOtherTabs, togglePinTab,
  };
}
