import { useState, useEffect, useCallback } from 'react';
import { Tab } from '../types';

// localStorage 키
const TABS_KEY = 'qf_explorer_tabs';
const ACTIVE_TAB_KEY = 'qf_explorer_active_tab';

const RECENT_PATH = '__recent__';

function pathTitle(path: string): string {
  if (path === RECENT_PATH) return '최근항목';
  if (!path) return '';
  return path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? path;
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

  // 현재 탭만 남기고 나머지 닫기 (Ctrl+Alt+W)
  const closeOtherTabs = useCallback(() => {
    if (tabs.length > 1 && activeTabId) {
      setTabs(prev => prev.filter(t => t.id === activeTabId));
    }
  }, [tabs.length, activeTabId]);

  return {
    tabs, activeTabId, activeTab, currentPath,
    canGoBack, canGoForward,
    openTab, navigateTo, goBack, goForward,
    handleTabSelect, handleTabClose, handleTabReorder,
    handleTabReceive, handleTabRemove,
    duplicateTab, closeOtherTabs,
  };
}
