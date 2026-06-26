import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Folder,
  Palette,
  ZoomIn,
  HelpCircle,
  Languages,
} from 'lucide-react';
import {
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  CollisionDetection,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
// CSS import 제거 - transform 미사용 (드래그 중 아이템 위치 고정)
import { v4 as uuidv4 } from 'uuid';
import { Category, FolderShortcut, ToastMessage, ClipboardData } from './types';
import FileExplorer from './components/FileExplorer';
import TempFileTray from './components/TempFileTray';
import { downloadDir, desktopDir } from '@tauri-apps/api/path';
import { getCurrentWindow, LogicalSize, LogicalPosition, availableMonitors } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { isTauri } from './utils/isTauri';
import type { DropIndicator } from './components/CategoryColumn';
import { AppSidebar } from './components/AppSidebar';
import { AppModals } from './components/AppModals';
import ContextMenu from './components/FileExplorer/ContextMenu';
import type { ContextMenuSection, Tab } from './components/FileExplorer/types';
import type { AppLanguage, TranslationKey } from './utils/i18n';
import {
  LANGUAGE_STORAGE_KEY,
  getInitialLanguage,
  installDomLocalization,
  translate,
} from './utils/i18n';
import {
  readBooleanStorage,
  readExplorerActiveTabId,
  readExplorerTabs,
  readJsonStorage,
  readNumberStorage,
  readStorage,
  removeStorage,
  storageKeys,
  writeBooleanStorage,
  writeExplorerActiveTabId,
  writeExplorerTabs,
  writeJsonStorage,
  writeNumberStorage,
  writeStorage,
} from './utils/storage';
import { tauriCommands } from './utils/tauriCommands';

// 커스텀 훅
import {
  useThemeManagement,
  adjustColorForTheme,
} from './hooks/useThemeManagement';
import { useWindowState } from './hooks/useWindowState';
import { useAutoUpdate } from './hooks/useAutoUpdate';
import { useTauriDragDrop } from './hooks/useTauriDragDrop';
import {
  useCategoryManagement,
  LEGACY_TEXT_CLASS_TO_HEX,
  LEGACY_BG_CLASS_TO_HEX,
} from './hooks/useCategoryManagement';

// 최근항목 특수 경로 상수
const RECENT_PATH = '__recent__';
const SYSTEM_ROOT_PATH = '__system_root__';
const EDGE_TRAY_LABEL = 'edge-tray';
const TEMP_TRAY_WINDOW_WIDTH = 360;
const TEMP_TRAY_WINDOW_MIN_HEIGHT = 520;
const TEMP_TRAY_WINDOW_MAX_HEIGHT = 720;
const TEMP_TRAY_WINDOW_MARGIN = 16;
const SETTINGS_MENU_WIDTH = 180;

type SplitMode = 'single' | 'horizontal' | 'vertical';

interface WindowFrame {
  width: number;
  height: number;
  x: number;
  y: number;
}

function mergeUniquePaths(prev: string[], next: string[]) {
  const merged = [...prev];
  for (const path of next) {
    if (!merged.includes(path)) merged.push(path);
  }
  return merged;
}

function readStoredActiveTab(instanceId = 'default'): Tab | null {
  const tabs = readExplorerTabs(instanceId);
  const activeTabId = readExplorerActiveTabId(instanceId);
  return tabs.find(tab => tab.id === activeTabId) ?? tabs[0] ?? null;
}

function pathTitle(path: string): string {
  if (path === RECENT_PATH) return '최근항목';
  if (path === SYSTEM_ROOT_PATH) return navigator.platform.startsWith('Mac') ? 'Macintosh HD' : '내 PC';
  return path.replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean).pop() ?? path;
}

function createTabSnapshot(path: string): Tab {
  return {
    id: uuidv4(),
    path,
    history: [path],
    historyIndex: 0,
    title: pathTitle(path),
  };
}

export default function App() {
  const isMac = navigator.platform.startsWith('Mac');

  // --- 토스트 (다른 훅들의 의존성) ---
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = uuidv4();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const [language, setLanguage] = useState<AppLanguage>(() => getInitialLanguage());
  const t = useCallback((key: TranslationKey) => translate(language, key), [language]);

  // --- 커스텀 훅 ---
  const theme = useThemeManagement(addToast);
  const catMgmt = useCategoryManagement(addToast);
  const autoUpdate = useAutoUpdate(addToast);
  useWindowState();

  const { themeVars } = theme;
  const { categories, setCategories } = catMgmt;

  // --- UI 상태 ---
  const [isBgModalOpen, setIsBgModalOpen] = useState(false);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [settingsMenu, setSettingsMenu] = useState<{ x: number; y: number } | null>(null);
  const [collapsedSessionMenu, setCollapsedSessionMenu] = useState<{ categoryId: string; x: number; y: number } | null>(null);

  // 좌측 패널 너비
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    return readJsonStorage(storageKeys.leftPanelWidth, 280);
  });

  // 좌측 사이드바 접기/펼치기
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return readBooleanStorage(storageKeys.sidebarCollapsed);
  });

  useEffect(() => {
    writeBooleanStorage(storageKeys.sidebarCollapsed, sidebarCollapsed);
    if (!sidebarCollapsed) setCollapsedSessionMenu(null);
    setSettingsMenu(null);
  }, [sidebarCollapsed]);

  useEffect(() => {
    document.documentElement.lang = language;
    return installDomLocalization(language);
  }, [language]);

  // explorerPath: { path, key } 구조로 같은 경로를 다시 설정해도 useEffect가 반응하도록 함
  // 단, 동일 경로 재요청(=FileExplorer→onPathChange 에코)에서는 key를 올리지 않아
  // navigateTo→onPathChange→key++→prop변경→effect 재실행의 자기 에코 무한루프를 차단한다.
  // (같은 경로 재진입은 어차피 index.tsx:585 가드가 막으므로 관측상 동작 변화 없음)
  const [explorerRequest, setExplorerRequest] = useState<{ path: string; key: number }>({ path: '', key: 0 });
  const lastExplorerPathRef = useRef('');
  const requestExplorerPath = useCallback((path: string, force = false) => {
    if (!force && path === lastExplorerPathRef.current) return;
    lastExplorerPathRef.current = path;
    setExplorerRequest(prev => ({ path, key: prev.key + 1 }));
  }, []);
  const setExplorerPath = useCallback((path: string) => {
    requestExplorerPath(path);
  }, [requestExplorerPath]);

  // --- 분할 뷰 상태 ---
  const [splitMode, setSplitMode] = useState<SplitMode>(() => {
    return (readStorage(storageKeys.splitMode) as SplitMode) || 'single';
  });
  const [explorerRequest2, setExplorerRequest2] = useState<{ path: string; key: number }>({ path: '', key: 0 });
  const lastExplorerPath2Ref = useRef('');
  const requestExplorerPath2 = useCallback((path: string, force = false) => {
    if (!force && path === lastExplorerPath2Ref.current) return;
    lastExplorerPath2Ref.current = path;
    setExplorerRequest2(prev => ({ path, key: prev.key + 1 }));
  }, []);
  const setExplorerPath2 = useCallback((path: string) => {
    requestExplorerPath2(path);
  }, [requestExplorerPath2]);
  const [focusedPane, setFocusedPane] = useState<0 | 1>(0);
  // 분할 뷰에서 두 패널이 클립보드를 공유
  const [sharedClipboard, setSharedClipboard] = useState<ClipboardData | null>(null);
  const [splitRatio, setSplitRatio] = useState(() => {
    return readNumberStorage(storageKeys.splitRatio, 0.5);
  });
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [trayDragStates, setTrayDragStates] = useState<Record<string, { dragging: boolean; trayActive: boolean }>>({});
  const handleTrayDragStateChange = useCallback((instanceId: string, dragging: boolean, trayActive: boolean) => {
    setTrayDragStates(prev => {
      // 값이 동일하면 같은 참조 반환 → 리렌더 스킵 (무한 루프 차단)
      const cur = prev[instanceId];
      if (cur && cur.dragging === dragging && cur.trayActive === trayActive) return prev;
      return { ...prev, [instanceId]: { dragging, trayActive } };
    });
  }, []);
  // 인스턴스별 안정적 래퍼 — 매 렌더 새 함수가 자식 effect를 재구독시키지 않도록 useCallback 고정
  const handleTrayDragStateDefault = useCallback(
    (dragging: boolean, trayActive: boolean) => handleTrayDragStateChange('default', dragging, trayActive),
    [handleTrayDragStateChange],
  );
  const handleTrayDragStatePane1 = useCallback(
    (dragging: boolean, trayActive: boolean) => handleTrayDragStateChange('pane-1', dragging, trayActive),
    [handleTrayDragStateChange],
  );
  const trayDropOverlayVisible = useMemo(
    () => Object.values(trayDragStates).some(state => state.dragging),
    [trayDragStates],
  );
  const trayDropOverlayActive = useMemo(
    () => Object.values(trayDragStates).some(state => state.trayActive),
    [trayDragStates],
  );
  const [tempTrayPaths, setTempTrayPaths] = useState<string[]>(() => {
    const parsed = readJsonStorage<unknown>(storageKeys.tempTrayPaths, []);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  });

  const getPaneActivePath = useCallback((pane: 0 | 1) => {
    if (pane === 1) {
      return explorerRequest2.path || readStoredActiveTab('pane-1')?.path || '';
    }
    return explorerRequest.path || readStoredActiveTab()?.path || '';
  }, [explorerRequest.path, explorerRequest2.path]);

  const seedSecondaryPaneFromPath = useCallback((path: string) => {
    if (!path) return;
    const sourceTab = readStoredActiveTab();
    const clonedTab: Tab = sourceTab && sourceTab.path === path
      ? { ...sourceTab, id: uuidv4(), pinned: false }
      : createTabSnapshot(path);

    writeExplorerTabs('pane-1', [clonedTab]);
    writeExplorerActiveTabId('pane-1', clonedTab.id);
    requestExplorerPath2(path, true);
  }, [requestExplorerPath2]);

  const handleSplitModeChange = useCallback((nextMode: SplitMode, options?: { closingInstanceId?: string; closedPaths?: string[] }) => {
    if (nextMode === splitMode) return;

    if (splitMode === 'single' && nextMode !== 'single') {
      const sourcePath = getPaneActivePath(0);
      seedSecondaryPaneFromPath(sourcePath);
      setFocusedPane(0);
      setSplitMode(nextMode);
      return;
    }

    if (splitMode !== 'single' && nextMode === 'single') {
      const sourcePane: 0 | 1 = options?.closingInstanceId === 'default'
        ? 1
        : options?.closingInstanceId === 'pane-1'
          ? 0
          : focusedPane;
      const sourcePath = getPaneActivePath(sourcePane);
      const sourcePathWasClosed = options?.closedPaths?.some(closedPath =>
        sourcePath === closedPath || sourcePath.startsWith(closedPath + '/') || sourcePath.startsWith(closedPath + '\\')
      );
      requestExplorerPath(sourcePath && !sourcePathWasClosed ? sourcePath : SYSTEM_ROOT_PATH, true);
      setFocusedPane(0);
      setSplitMode('single');
      return;
    }

    setSplitMode(nextMode);
  }, [focusedPane, getPaneActivePath, requestExplorerPath, seedSecondaryPaneFromPath, splitMode]);

  const cycleSplitMode = useCallback(() => {
    if (splitMode === 'single') {
      handleSplitModeChange('horizontal');
      return;
    }
    if (splitMode === 'horizontal') {
      handleSplitModeChange('vertical');
      return;
    }
    handleSplitModeChange('single');
  }, [handleSplitModeChange, splitMode]);

  useEffect(() => {
    const handleOpenArchivePane = (event: Event) => {
      const { path, sourceInstanceId } = (event as CustomEvent<{ path?: string; sourceInstanceId?: string }>).detail ?? {};
      if (!path) return;

      if (splitMode === 'single') {
        removeStorage(storageKeys.explorerTabs('pane-1'));
        removeStorage(storageKeys.explorerActiveTab('pane-1'));
        setExplorerPath2(path);
        setFocusedPane(1);
        setSplitMode('horizontal');
        return;
      }

      const targetInstanceId = sourceInstanceId === 'pane-1' ? 'default' : 'pane-1';
      window.dispatchEvent(new CustomEvent('qf-open-new-tab', {
        detail: { path, targetInstanceId },
      }));
      setFocusedPane(targetInstanceId === 'pane-1' ? 1 : 0);
    };

    window.addEventListener('qf-open-archive-pane', handleOpenArchivePane as EventListener);
    return () => {
      window.removeEventListener('qf-open-archive-pane', handleOpenArchivePane as EventListener);
    };
  }, [setExplorerPath2, splitMode]);
  const tempTrayWindowAppliedRef = useRef(false);
  // 트레이 종료 시 창 뎁스: 닫기/취소는 전면, OS 드래그로 비우면 배경
  const trayRestoreDepthRef = useRef<'foreground' | 'background'>('foreground');

  useEffect(() => {
    writeJsonStorage(storageKeys.tempTrayPaths, tempTrayPaths);
  }, [tempTrayPaths]);

  const handleStageFilesToTray = useCallback((paths: string[]) => {
    setTempTrayPaths(prev => mergeUniquePaths(prev, paths));
  }, []);

  const handleRemoveTrayFiles = useCallback((paths: string[], source: 'trash' | 'drag' = 'trash') => {
    setTempTrayPaths((prev) => {
      const next = prev.filter(path => !paths.includes(path));
      if (next.length === 0) {
        trayRestoreDepthRef.current = source === 'drag' ? 'background' : 'foreground';
      }
      return next;
    });
  }, []);

  const handleClearTray = useCallback(() => {
    trayRestoreDepthRef.current = 'foreground';
    setTempTrayPaths([]);
  }, []);

  // --- 임시 트레이 진입 시 창을 우측 트레이 크기로 정렬 ---
  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const appWindow = getCurrentWindow();

    const getWindowFrame = async (): Promise<WindowFrame> => {
      const [size, position, scaleFactor] = await Promise.all([
        appWindow.innerSize(),
        appWindow.outerPosition(),
        appWindow.scaleFactor(),
      ]);
      return {
        width: Math.round(size.width / scaleFactor),
        height: Math.round(size.height / scaleFactor),
        x: Math.round(position.x / scaleFactor),
        y: Math.round(position.y / scaleFactor),
      };
    };

    const getCurrentMonitorBounds = async () => {
      const [monitors, size, position] = await Promise.all([
        availableMonitors(),
        appWindow.innerSize(),
        appWindow.outerPosition(),
      ]);
      if (monitors.length === 0) return null;

      const centerX = position.x + size.width / 2;
      const centerY = position.y + size.height / 2;
      const monitor = monitors.find((m) => {
        const area = m.workArea ?? { position: m.position, size: m.size };
        return centerX >= area.position.x
          && centerX <= area.position.x + area.size.width
          && centerY >= area.position.y
          && centerY <= area.position.y + area.size.height;
      }) ?? monitors[0];

      const area = monitor.workArea ?? { position: monitor.position, size: monitor.size };
      const scaleFactor = monitor.scaleFactor || await appWindow.scaleFactor();
      return {
        x: Math.round(area.position.x / scaleFactor),
        y: Math.round(area.position.y / scaleFactor),
        width: Math.round(area.size.width / scaleFactor),
        height: Math.round(area.size.height / scaleFactor),
      };
    };

    const alignTrayWindow = async () => {
      if (!readStorage(storageKeys.tempTrayWindowRestore)) {
        writeJsonStorage(storageKeys.tempTrayWindowRestore, await getWindowFrame());
      }
      tempTrayWindowAppliedRef.current = true;
      await appWindow.setAlwaysOnTop(true);

      const monitor = await getCurrentMonitorBounds();
      if (!monitor || cancelled) return;

      const width = Math.min(TEMP_TRAY_WINDOW_WIDTH, Math.max(280, monitor.width - TEMP_TRAY_WINDOW_MARGIN * 2));
      const availableHeight = Math.max(360, monitor.height - TEMP_TRAY_WINDOW_MARGIN * 2);
      const preferredHeight = Math.min(
        TEMP_TRAY_WINDOW_MAX_HEIGHT,
        Math.max(TEMP_TRAY_WINDOW_MIN_HEIGHT, Math.round(monitor.height * 0.72))
      );
      const height = Math.min(preferredHeight, availableHeight);
      const x = monitor.x + monitor.width - width - TEMP_TRAY_WINDOW_MARGIN;
      const y = monitor.y + Math.max(TEMP_TRAY_WINDOW_MARGIN, Math.round((monitor.height - height) / 2));

      await appWindow.setSize(new LogicalSize(width, height));
      await appWindow.setPosition(new LogicalPosition(x, y));
    };

    const restoreExplorerWindow = async () => {
      const depth = trayRestoreDepthRef.current;
      trayRestoreDepthRef.current = 'foreground';

      await appWindow.setAlwaysOnTop(false);
      const frame = readJsonStorage<WindowFrame | null>(storageKeys.tempTrayWindowRestore, null);
      if (!frame) return;

      if (!tempTrayWindowAppliedRef.current) {
        removeStorage(storageKeys.tempTrayWindowRestore);
        return;
      }

      removeStorage(storageKeys.tempTrayWindowRestore);
      tempTrayWindowAppliedRef.current = false;

      if (cancelled) return;
      await appWindow.setSize(new LogicalSize(frame.width, frame.height));
      await appWindow.setPosition(new LogicalPosition(frame.x, frame.y));
      writeJsonStorage(storageKeys.windowState, frame);

      try {
        if (depth === 'foreground') {
          if (await appWindow.isMinimized()) {
            await appWindow.unminimize();
          }
          await appWindow.setFocus();
        } else {
          // 드롭 대상 앱이 전면에 남도록 포커스·Z-order를 내림
          await appWindow.setFocusable(false);
          await appWindow.setFocusable(true);
        }
      } catch (err) {
        console.error('탐색기 창 뎁스 복원 실패:', err);
      }
    };

    timer = setTimeout(() => {
      const task = tempTrayPaths.length > 0 ? alignTrayWindow : restoreExplorerWindow;
      task().catch((err) => console.error('임시 트레이 창 정렬 실패:', err));
    }, 120);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [tempTrayPaths.length]);

  // --- 문제 발생 시 떠 있는 Edge Tray 오버레이 즉시 정리 ---
  useEffect(() => {
    if (!isTauri()) return;
    const closeEdgeTray = async () => {
      try {
        const edgeWin = await WebviewWindow.getByLabel(EDGE_TRAY_LABEL);
        if (!edgeWin) return;
        await edgeWin.close();
      } catch (e) {
        console.error('Edge Tray 정리 실패:', e);
      }
    };
    void closeEdgeTray();
  }, []);

  // --- 분할 뷰 저장소 동기화 ---
  useEffect(() => {
    writeStorage(storageKeys.splitMode, splitMode);
  }, [splitMode]);

  useEffect(() => {
    writeNumberStorage(storageKeys.splitRatio, splitRatio);
  }, [splitRatio]);

  // --- 글로벌 키보드 단축키 (Ctrl+L: 분할 뷰, Ctrl+B: 사이드바 토글) ---
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 마크다운 편집기가 열려있으면 글로벌 단축키 무시
      if (document.querySelector('[data-markdown-editor]')) return;

      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyL') {
        e.preventDefault();
        cycleSplitMode();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed(prev => !prev);
      }

    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [cycleSplitMode]);

  // --- 창 도킹 단축키: Ctrl(Cmd) + Alt(Opt) + Shift + 화살표 ---
  // capture 단계에서 처리하여 다른 핸들러보다 먼저 실행
  useEffect(() => {
    const handleDockKeyDown = async (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.altKey || !e.shiftKey) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      if (!isTauri()) return;

      try {
        const appWindow = getCurrentWindow();
        const monitors = await availableMonitors();
        if (monitors.length === 0) return;
        // 현재 창 위치 기준으로 모니터 탐색
        const pos = await appWindow.outerPosition();
        const scaleFactor = await appWindow.scaleFactor();
        const wx = pos.x / scaleFactor;
        const wy = pos.y / scaleFactor;
        // 창이 속한 모니터 찾기 (없으면 첫 번째 모니터 사용)
        const monitor = monitors.find(m => {
          const ml = m.position.x / scaleFactor;
          const mt = m.position.y / scaleFactor;
          const mr = ml + m.size.width / scaleFactor;
          const mb = mt + m.size.height / scaleFactor;
          return wx >= ml && wx < mr && wy >= mt && wy < mb;
        }) || monitors[0];
        const mw = Math.round(monitor.size.width / scaleFactor);
        const mh = Math.round(monitor.size.height / scaleFactor);
        const mx = Math.round(monitor.position.x / scaleFactor);
        const my = Math.round(monitor.position.y / scaleFactor);

        let x = mx, y = my, w = mw, h = mh;
        if (e.key === 'ArrowLeft')  { w = Math.round(mw / 2); }
        if (e.key === 'ArrowRight') { w = Math.round(mw / 2); x = mx + Math.round(mw / 2); }
        if (e.key === 'ArrowUp')    { h = Math.round(mh / 2); }
        if (e.key === 'ArrowDown')  { h = Math.round(mh / 2); y = my + Math.round(mh / 2); }

        console.log('창 도킹:', e.key, { x, y, w, h, scaleFactor });
        await appWindow.setSize(new LogicalSize(w, h));
        await appWindow.setPosition(new LogicalPosition(x, y));
      } catch (err) {
        console.error('창 도킹 실패:', err);
      }
    };
    window.addEventListener('keydown', handleDockKeyDown, true);
    return () => window.removeEventListener('keydown', handleDockKeyDown, true);
  }, []);

  // --- Tauri 드래그앤드롭 ---
  const {
    updateHoveredCategoryFromDragEvent,
    clearHoveredCategoryIfLeftMain,
    hoveredCategoryIdRef,
  } = useTauriDragDrop(catMgmt.handleAddFolder);

  // Tauri 드래그에서 카테고리를 찾지 못했을 때의 폴백 처리
  // (useTauriDragDrop 내부에서 카테고리를 찾지 못하면 여기서 처리)

  // --- 클립보드/탐색기 핸들러 ---
  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await tauriCommands.copyPath(path);
      addToast("경로가 클립보드에 복사되었습니다!", "success");
    } catch (error) {
      console.error(error);
      addToast("복사에 실패했습니다.", "error");
    }
  }, [addToast]);

  const handleOpenFolder = useCallback(async (path: string) => {
    try {
      await tauriCommands.openFolder(path);
    } catch (error) {
      console.error(error);
      addToast("폴더를 열 수 없습니다.", "error");
    }
  }, [addToast]);

  // 최근항목 버튼 클릭 → 탐색기에서 최근항목 탭 열기
  const handleOpenRecent = useCallback(() => {
    if (splitMode === 'single' || focusedPane === 0) {
      setExplorerPath(RECENT_PATH);
    } else {
      setExplorerPath2(RECENT_PATH);
    }
  }, [splitMode, focusedPane]);

  // 다운로드 폴더 경로
  const [downloadPath, setDownloadPath] = useState<string | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    downloadDir().then(setDownloadPath).catch(console.error);
  }, []);

  const handleOpenDownloads = useCallback(() => {
    if (!downloadPath) return;
    if (splitMode === 'single' || focusedPane === 0) {
      setExplorerPath(downloadPath);
    } else {
      setExplorerPath2(downloadPath);
    }
  }, [splitMode, focusedPane, downloadPath]);

  // 데스크탑 폴더 경로
  const [desktopPath, setDesktopPath] = useState<string | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    desktopDir().then(setDesktopPath).catch(console.error);
  }, []);

  const handleOpenDesktop = useCallback(() => {
    if (!desktopPath) return;
    if (splitMode === 'single' || focusedPane === 0) {
      setExplorerPath(desktopPath);
    } else {
      setExplorerPath2(desktopPath);
    }
  }, [splitMode, focusedPane, desktopPath]);

  const openPathInFocusedPane = useCallback((path: string) => {
    if (!path) return;
    if (splitMode === 'single' || focusedPane === 0) {
      setExplorerPath(path);
    } else {
      setExplorerPath2(path);
    }
  }, [splitMode, focusedPane, setExplorerPath, setExplorerPath2]);

  const handleOpenSystemRoot = useCallback(() => {
    openPathInFocusedPane(SYSTEM_ROOT_PATH);
  }, [openPathInFocusedPane]);

  // 폴더 이름 변경 시 사이드바 즐겨찾기 경로 동기화
  useEffect(() => {
    const handler = (e: Event) => {
      const { oldPath, newPath } = (e as CustomEvent).detail;
      setCategories(prev => prev.map(cat => ({
        ...cat,
        shortcuts: cat.shortcuts.map(s => {
          // 정확히 일치하거나 하위 경로인 경우 갱신
          if (s.path === oldPath) {
            return { ...s, path: newPath, name: newPath.split(/[/\\]/).pop() ?? s.name };
          }
          if (s.path.startsWith(oldPath + '/') || s.path.startsWith(oldPath + '\\')) {
            return { ...s, path: newPath + s.path.slice(oldPath.length) };
          }
          return s;
        }),
      })));
    };
    window.addEventListener('qf-tab-rename', handler);
    return () => window.removeEventListener('qf-tab-rename', handler);
  }, [setCategories]);

  // 폴더 삭제 시 사이드바 즐겨찾기에서 제거
  useEffect(() => {
    const handler = (e: Event) => {
      const { paths } = (e as CustomEvent).detail as { paths: string[] };
      setCategories(prev => prev.map(cat => ({
        ...cat,
        shortcuts: cat.shortcuts.filter(s =>
          !paths.some(dp => s.path === dp || s.path.startsWith(dp + '/') || s.path.startsWith(dp + '\\'))
        ),
      })));
    };
    window.addEventListener('qf-tab-delete', handler);
    return () => window.removeEventListener('qf-tab-delete', handler);
  }, [setCategories]);

  // 즐겨찾기 폴더 경로 목록 (FileExplorer에서 최근항목 조회 시 사용)
  const recentRoots = useMemo(() =>
    categories.flatMap(c => c.shortcuts.map(s => s.path)),
    [categories]
  );

  // Ctrl(Cmd)+클릭 시 새 탭에서 열기
  const handleOpenInNewTab = useCallback((path: string) => {
    window.dispatchEvent(new CustomEvent('qf-open-new-tab', { detail: { path } }));
  }, []);

  const handleOpenInExplorer = useCallback((path: string) => {
    if (splitMode === 'single' || focusedPane === 0) {
      setExplorerPath(path);
    } else {
      setExplorerPath2(path);
    }
  }, [splitMode, focusedPane]);

  const collapsedSessionBadges = useMemo(() => {
    const firstLetters = categories.map(category => Array.from(category.title.trim())[0]?.toUpperCase() || '?');
    const firstLetterCounts = firstLetters.reduce((acc, letter) => {
      acc.set(letter, (acc.get(letter) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());

    return categories.map(category => {
      const letters = Array.from(category.title.trim());
      const firstLetter = letters[0]?.toUpperCase() || '?';
      const label = (firstLetterCounts.get(firstLetter) ?? 0) > 1
        ? letters.slice(0, 2).join('').toUpperCase() || firstLetter
        : firstLetter;
      const rawColor = category.color?.startsWith('#')
        ? category.color
        : (category.color &&
            (LEGACY_TEXT_CLASS_TO_HEX[category.color] ||
              LEGACY_BG_CLASS_TO_HEX[category.color])) ||
          undefined;
      return {
        category,
        label,
        color: rawColor ? adjustColorForTheme(rawColor, theme.isDark) : undefined,
      };
    });
  }, [categories, theme.isDark]);

  const collapsedSessionMenuSections = useMemo<ContextMenuSection[]>(() => {
    if (!collapsedSessionMenu) return [];
    const category = categories.find(cat => cat.id === collapsedSessionMenu.categoryId);
    if (!category) return [];
    return [{
      id: 'session-folders',
      items: category.shortcuts.length > 0
        ? category.shortcuts.map(shortcut => ({
            id: shortcut.id,
            icon: <Folder size={13} />,
            label: shortcut.name,
            onClick: () => handleOpenInExplorer(shortcut.path),
          }))
        : [{
            id: 'empty',
            icon: <Folder size={13} />,
            label: '등록된 폴더 없음',
            disabled: true,
            onClick: () => {},
          }],
    }];
  }, [categories, collapsedSessionMenu, handleOpenInExplorer]);

  const handleOpenSettingsMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setCollapsedSessionMenu(null);
    setSettingsMenu(prev => prev
      ? null
      : {
          x: Math.max(8, rect.right - SETTINGS_MENU_WIDTH),
          y: rect.bottom + 4,
        }
    );
  }, []);

  const handleLanguageChange = useCallback((nextLanguage: AppLanguage) => {
    writeStorage(LANGUAGE_STORAGE_KEY, nextLanguage);
    if (nextLanguage === language) return;
    window.location.reload();
  }, [language]);

  const settingsMenuSections = useMemo<ContextMenuSection[]>(() => [{
    id: 'app-settings',
    items: [
      {
        id: 'help',
        icon: <HelpCircle size={13} />,
        label: t('settings.help'),
        onClick: () => setIsHelpModalOpen(true),
      },
      {
        id: 'sidebar-zoom',
        icon: <ZoomIn size={13} />,
        label: t('settings.sidebarZoom'),
        onClick: () => setIsZoomModalOpen(true),
      },
      {
        id: 'theme-color',
        icon: <Palette size={13} />,
        label: t('settings.themeColor'),
        onClick: () => setIsBgModalOpen(true),
      },
      {
        id: 'language',
        icon: <Languages size={13} />,
        label: t('settings.language'),
        onClick: () => setIsLanguageModalOpen(true),
      },
    ],
  }], [t]);

  const handleAddFavoriteFromExplorer = useCallback((path: string, name: string) => {
    if (categories.length === 0) {
      addToast('즐겨찾기에 추가하려면 먼저 카테고리를 만들어 주세요.', 'error');
      return;
    }
    catMgmt.handleAddFolder(categories[0].id, path, name);
  }, [categories, catMgmt.handleAddFolder, addToast]);

  // 분할 패널 드래그 핸들러
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftPanelWidth;
    let currentWidth = startWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      currentWidth = Math.max(200, Math.min(600, startWidth + moveEvent.clientX - startX));
      setLeftPanelWidth(currentWidth);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      writeJsonStorage(storageKeys.leftPanelWidth, currentWidth);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [leftPanelWidth]);

  // --- 분할 뷰 구분선 드래그 핸들러 ---
  const handleSplitDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const isHorizontal = splitMode === 'horizontal';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const ratio = isHorizontal
        ? (moveEvent.clientX - rect.left) / rect.width
        : (moveEvent.clientY - rect.top) / rect.height;
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [splitMode]);

  // 항상 1컬럼 사용 (CSS 변수 초기 설정)
  useEffect(() => {
    document.documentElement.style.setProperty('--masonry-columns', '1');
  }, []);

  // --- DnD ---
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const dropIndicatorRef = useRef<DropIndicator | null>(null);
  // 충돌 감지에서 접힌 카테고리를 필터하기 위한 ref
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // 충돌 감지: 카테고리↔카테고리, 즐겨찾기↔즐겨찾기+빈카테고리 분리
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    const activeType = args.active?.data?.current?.type;
    if (activeType === 'Category') {
      // 카테고리 드래그: 카테고리만 충돌 대상
      const catContainers = args.droppableContainers.filter(
        c => c.data.current?.type === 'Category'
      );
      return closestCenter({ ...args, droppableContainers: catContainers });
    }
    // 즐겨찾기 드래그: 즐겨찾기 아이템 + 열린 카테고리 컨테이너(빈 카테고리 드롭용)
    const validContainers = args.droppableContainers.filter(c => {
      const cType = c.data.current?.type;
      if (cType === 'Shortcut') {
        // 접힌 카테고리 내부 아이템 제외
        const catId = c.data.current?.categoryId as string | undefined;
        if (catId) {
          const cat = categoriesRef.current.find(ct => ct.id === catId);
          if (cat?.isCollapsed) return false;
        }
        return true;
      }
      // 카테고리 컨테이너: 열린 상태 + 빈 카테고리만 허용 (빈 곳에 즐겨찾기 드롭용)
      if (cType === 'Category') {
        const cat = categoriesRef.current.find(ct => ct.id === c.id);
        if (cat && !cat.isCollapsed && cat.shortcuts.length === 0) return true;
      }
      return false;
    });
    return closestCenter({ ...args, droppableContainers: validContainers });
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setDropIndicator(null);
    dropIndicatorRef.current = null;
  }, []);

  // handleDragOver: 인디케이터 위치만 계산 (실제 이동 없음)
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) {
      setDropIndicator(null);
      dropIndicatorRef.current = null;
      return;
    }

    const activeType = active.data.current?.type;

    if (activeType === 'Category') {
      // 카테고리 드래그: 카테고리 사이 위치 계산
      if (over.data.current?.type !== 'Category') {
        setDropIndicator(null);
        dropIndicatorRef.current = null;
        return;
      }
      const cats = categoriesRef.current;
      const activeIdx = cats.findIndex(c => c.id === active.id);
      const overIdx = cats.findIndex(c => c.id === over.id);
      if (overIdx === -1 || activeIdx === overIdx) {
        setDropIndicator(null);
        dropIndicatorRef.current = null;
        return;
      }
      // 드래그 중인 항목보다 뒤에 있으면 → 뒤에 삽입, 앞에 있으면 → 앞에 삽입
      const insertIdx = overIdx > activeIdx ? overIdx + 1 : overIdx;
      const indicator: DropIndicator = { type: 'category', index: insertIdx };
      setDropIndicator(indicator);
      dropIndicatorRef.current = indicator;
      return;
    }

    // 즐겨찾기 드래그
    let overCatId: string;
    if (over.data.current?.type === 'Category') {
      // 빈 카테고리 위에 드롭 (충돌 감지에서 빈 카테고리 허용)
      overCatId = over.id as string;
    } else {
      overCatId = (over.data.current?.categoryId ?? over.id) as string;
    }
    const overCat = categoriesRef.current.find(c => c.id === overCatId);
    // 접힌 카테고리는 드롭 불가
    if (!overCat || overCat.isCollapsed) {
      setDropIndicator(null);
      dropIndicatorRef.current = null;
      return;
    }

    if (over.data.current?.type === 'Shortcut') {
      const overIdx = overCat.shortcuts.findIndex(s => s.id === over.id);
      const isBelowCenter = active.rect.current.translated &&
        active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
      const insertIdx = isBelowCenter ? overIdx + 1 : overIdx;
      const indicator: DropIndicator = { type: 'shortcut', categoryId: overCatId, index: insertIdx };
      setDropIndicator(indicator);
      dropIndicatorRef.current = indicator;
    } else {
      // 카테고리 빈 영역: 마지막에 추가
      const indicator: DropIndicator = { type: 'shortcut', categoryId: overCatId, index: overCat.shortcuts.length };
      setDropIndicator(indicator);
      dropIndicatorRef.current = indicator;
    }
  }, []);

  // handleDragEnd: 인디케이터 위치 기반 실제 이동
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active } = event;
    const indicator = dropIndicatorRef.current;
    setActiveId(null);
    setDropIndicator(null);
    dropIndicatorRef.current = null;

    if (!indicator) return;

    if (indicator.type === 'category') {
      // 카테고리 순서 변경
      setCategories(prev => {
        const activeIdx = prev.findIndex(c => c.id === active.id);
        if (activeIdx === -1) return prev;
        let toIdx = indicator.index;
        if (activeIdx < toIdx) toIdx -= 1;
        if (activeIdx === toIdx) return prev;
        return arrayMove(prev, activeIdx, toIdx);
      });
    } else {
      // 즐겨찾기 이동
      const activeCatId = active.data.current?.categoryId as string;
      const targetCatId = indicator.categoryId;
      const insertIdx = indicator.index;

      setCategories(prev => {
        const srcIdx = prev.findIndex(c => c.id === activeCatId);
        const tgtIdx = prev.findIndex(c => c.id === targetCatId);
        if (srcIdx === -1 || tgtIdx === -1) return prev;

        const shortcut = prev[srcIdx].shortcuts.find(s => s.id === active.id);
        if (!shortcut) return prev;

        const updated = prev.map(c => ({ ...c, shortcuts: [...c.shortcuts] }));

        // 원본에서 제거
        const srcShortcuts = updated[srcIdx].shortcuts;
        const removeIdx = srcShortcuts.findIndex(s => s.id === active.id);
        if (removeIdx === -1) return prev;
        srcShortcuts.splice(removeIdx, 1);

        // 삽입 인덱스 조정 (같은 카테고리에서 앞에서 제거된 경우)
        let adjustedIdx = insertIdx;
        if (srcIdx === tgtIdx && removeIdx < insertIdx) {
          adjustedIdx -= 1;
        }

        // 대상에 삽입
        updated[tgtIdx].shortcuts.splice(adjustedIdx, 0, shortcut);
        return updated;
      });
    }
  }, [setCategories]);


  return (
    <div
      id="qf-root"
      className="h-screen overflow-hidden flex flex-col text-[var(--qf-text)]"
      style={{
        backgroundColor: themeVars?.bg ?? '#0f172a',
        ['--qf-bg' as string]: themeVars?.bg ?? '#0f172a',
        ['--qf-surface' as string]: themeVars?.surface ?? '#111827',
        ['--qf-surface-2' as string]: themeVars?.surface2 ?? '#1f2937',
        ['--qf-surface-hover' as string]: themeVars?.surfaceHover ?? '#334155',
        ['--qf-border' as string]: themeVars?.border ?? '#334155',
        ['--qf-text' as string]: themeVars?.text ?? '#e5e7eb',
        ['--qf-muted' as string]: themeVars?.muted ?? '#94a3b8',
        ['--qf-accent' as string]: themeVars?.accent ?? '#3b82f6',
        ['--qf-accent-hover' as string]: themeVars?.accentHover ?? '#60a5fa',
        ['--qf-accent-20' as string]: themeVars?.accent20 ?? 'rgba(59,130,246,0.20)',
        ['--qf-accent-50' as string]: themeVars?.accent50 ?? 'rgba(59,130,246,0.50)',
      }}
    >
      {/* macOS 커스텀 타이틀바 (overlay 모드) — Windows는 OS 타이틀바에 버전 표시 */}
      {isMac && (
        <div
          data-tauri-drag-region
          className="flex-shrink-0 flex items-center border-b border-[var(--qf-border)]"
          style={{
            height: 36,
            paddingLeft: 72,
            backgroundColor: themeVars?.surface ?? '#111827',
            WebkitAppRegion: 'drag',
          } as React.CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }}
        >
          <span
            className="text-xs font-semibold text-[var(--qf-muted)] select-none pointer-events-none"
          >
            QuickFolder <span className="opacity-50 font-normal">v{__APP_VERSION__}</span>
          </span>
        </div>
      )}

      {tempTrayPaths.length > 0 && (
        <TempFileTray
          paths={tempTrayPaths}
          onRemove={handleRemoveTrayFiles}
          onClear={handleClearTray}
          onError={(message) => addToast(message, 'error')}
        />
      )}
      <div className={`flex flex-1 overflow-hidden${tempTrayPaths.length > 0 ? ' hidden' : ''}`}>
        <AppSidebar
          sidebarCollapsed={sidebarCollapsed}
          leftPanelWidth={leftPanelWidth}
          setSidebarCollapsed={setSidebarCollapsed}
          t={t}
          onOpenSettingsMenu={handleOpenSettingsMenu}
          onOpenRecent={handleOpenRecent}
          onOpenSystemRoot={handleOpenSystemRoot}
          onOpenDesktop={handleOpenDesktop}
          onOpenDownloads={handleOpenDownloads}
          isMac={isMac}
          desktopPath={desktopPath}
          downloadPath={downloadPath}
          collapsedSessionBadges={collapsedSessionBadges}
          setCollapsedSessionMenu={setCollapsedSessionMenu}
          sensors={sensors}
          customCollisionDetection={customCollisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          updateHoveredCategoryFromDragEvent={updateHoveredCategoryFromDragEvent}
          clearHoveredCategoryIfLeftMain={clearHoveredCategoryIfLeftMain}
          zoomScale={theme.zoomScale}
          categories={categories}
          activeId={activeId}
          dropIndicator={dropIndicator}
          isDark={theme.isDark}
          openAddCategoryModal={catMgmt.openAddCategoryModal}
          toggleCollapse={catMgmt.toggleCollapse}
          toggleCollapseAll={catMgmt.toggleCollapseAll}
          handleAddFolder={catMgmt.handleAddFolder}
          openEditCategoryModal={catMgmt.openEditCategoryModal}
          updateCategory={catMgmt.updateCategory}
          deleteCategory={catMgmt.deleteCategory}
          handleOpenFolder={handleOpenInExplorer}
          handleOpenInNewTab={handleOpenInNewTab}
          handleCopyPath={handleCopyPath}
          deleteShortcut={catMgmt.deleteShortcut}
          openEditFolderModal={catMgmt.openEditFolderModal}
        />

        {/* 드래그 구분선 (접힌 상태에서는 너비 조절 비활성화) */}
        <div
          className={`w-1 flex-shrink-0 bg-[var(--qf-border)] transition-colors ${
            sidebarCollapsed ? 'cursor-default' : 'cursor-col-resize hover:bg-[var(--qf-accent)]'
          }`}
          onMouseDown={sidebarCollapsed ? undefined : handleDividerMouseDown}
        />

        {/* Right: File Explorer(s) — 분할 뷰 지원 */}
        <div
          ref={splitContainerRef}
          className={`relative flex-1 min-w-0 overflow-hidden flex ${splitMode === 'vertical' ? 'flex-col' : 'flex-row'}`}
        >
          {trayDropOverlayVisible && (
            <div className="pointer-events-none absolute inset-y-0 right-0 z-[9998] flex items-stretch">
              <div
                className="m-2 flex w-20 flex-col items-center justify-start rounded-md border border-dashed pt-2 text-[10px] font-semibold transition-colors"
                style={{
                  borderColor: trayDropOverlayActive ? (themeVars?.accent ?? '#3b82f6') : 'rgba(148,163,184,0.75)',
                  backgroundColor: trayDropOverlayActive ? (themeVars?.accent20 ?? 'rgba(59,130,246,0.2)') : 'rgba(15,23,42,0.72)',
                  color: trayDropOverlayActive ? (themeVars?.text ?? '#e5e7eb') : (themeVars?.muted ?? '#94a3b8'),
                }}
              >
                Temp
              </div>
            </div>
          )}
          {/* 패널 0 (메인) */}
          <div
            className="min-w-0 min-h-0 overflow-hidden"
            style={{
              flex: splitMode === 'single' ? '1 1 0%' : `0 0 ${splitRatio * 100}%`,
              borderTop: splitMode !== 'single' && focusedPane === 0
                ? `2px solid ${themeVars?.accent ?? '#3b82f6'}` : '2px solid transparent',
            }}
            onMouseDownCapture={() => { if (splitMode !== 'single') setFocusedPane(0); }}
          >
            <FileExplorer
              instanceId="default"
              isFocused={splitMode === 'single' || focusedPane === 0}
              splitMode={splitMode}
              onSplitModeChange={handleSplitModeChange}
              initialPath={explorerRequest.path}
              initialPathKey={explorerRequest.key}
              onPathChange={setExplorerPath}
              onAddToFavorites={handleAddFavoriteFromExplorer}
              onAddToCategory={catMgmt.handleAddFolder}
              themeVars={themeVars}
              sharedClipboard={sharedClipboard}
              onClipboardChange={setSharedClipboard}
              onStageFilesToTray={handleStageFilesToTray}
              onTrayDragStateChange={handleTrayDragStateDefault}
              recentRoots={recentRoots}
            />
          </div>

          {/* 분할 구분선 + 패널 1 */}
          {splitMode !== 'single' && (
            <>
              <div
                className={`flex-shrink-0 transition-colors ${
                  splitMode === 'horizontal'
                    ? 'w-1 cursor-col-resize'
                    : 'h-1 cursor-row-resize'
                }`}
                style={{ backgroundColor: 'var(--qf-border)' }}
                onMouseDown={handleSplitDividerMouseDown}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `var(--qf-accent)`)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = `var(--qf-border)`)}
              />
              <div
                className="min-w-0 min-h-0 overflow-hidden flex-1"
                style={{
                  borderTop: focusedPane === 1
                    ? `2px solid ${themeVars?.accent ?? '#3b82f6'}` : '2px solid transparent',
                }}
                onMouseDownCapture={() => setFocusedPane(1)}
              >
                <FileExplorer
                  instanceId="pane-1"
                  isFocused={focusedPane === 1}
                  splitMode={splitMode}
                  onSplitModeChange={handleSplitModeChange}
                  initialPath={explorerRequest2.path}
                  initialPathKey={explorerRequest2.key}
                  onPathChange={setExplorerPath2}
                  onAddToFavorites={handleAddFavoriteFromExplorer}
                  onAddToCategory={catMgmt.handleAddFolder}
                  themeVars={themeVars}
                  sharedClipboard={sharedClipboard}
                  onClipboardChange={setSharedClipboard}
                  onStageFilesToTray={handleStageFilesToTray}
                  onTrayDragStateChange={handleTrayDragStatePane1}
                  recentRoots={recentRoots}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {collapsedSessionMenu && (
        <ContextMenu
          x={collapsedSessionMenu.x}
          y={collapsedSessionMenu.y}
          sections={collapsedSessionMenuSections}
          onClose={() => setCollapsedSessionMenu(null)}
        />
      )}

      {settingsMenu && (
        <ContextMenu
          x={settingsMenu.x}
          y={settingsMenu.y}
          sections={settingsMenuSections}
          onClose={() => setSettingsMenu(null)}
        />
      )}

      <AppModals
        isBgModalOpen={isBgModalOpen}
        setIsBgModalOpen={setIsBgModalOpen}
        isZoomModalOpen={isZoomModalOpen}
        setIsZoomModalOpen={setIsZoomModalOpen}
        isLanguageModalOpen={isLanguageModalOpen}
        setIsLanguageModalOpen={setIsLanguageModalOpen}
        isHelpModalOpen={isHelpModalOpen}
        setIsHelpModalOpen={setIsHelpModalOpen}
        theme={theme}
        themeVars={themeVars}
        language={language}
        onLanguageChange={handleLanguageChange}
        t={t}
        catMgmt={catMgmt}
        autoUpdate={autoUpdate}
        addToast={addToast}
        toasts={toasts}
        removeToast={removeToast}
      />
    </div>
  );
}
