import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Plus,
  Settings,
  Folder,
  Trash2,
  Palette,
  Search,
  ZoomIn,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Clock,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  CollisionDetection,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
// CSS import 제거 - transform 미사용 (드래그 중 아이템 위치 고정)
import { v4 as uuidv4 } from 'uuid';
import { Category, FolderShortcut, ToastMessage, ClipboardData } from './types';
import { Button } from './components/ui/Button';
import { Modal } from './components/ui/Modal';
import { ToastContainer } from './components/ToastContainer';
import { UpdateModal } from './components/UpdateModal';
import FileExplorer from './components/FileExplorer';
import { invoke } from '@tauri-apps/api/core';
import { CategoryColumn, DropIndicator } from './components/CategoryColumn';
import { ThemeSettingsModal } from './components/ThemeSettingsModal';
import { ZoomModal } from './components/ZoomModal';

// 커스텀 훅
import {
  useThemeManagement,
  COLORS,
  FOLDER_TEXT_COLORS,
  normalizeHexColor,
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

export default function App() {
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

  // --- 커스텀 훅 ---
  const theme = useThemeManagement(addToast);
  const catMgmt = useCategoryManagement(addToast);
  const autoUpdate = useAutoUpdate(addToast);
  useWindowState();

  const { themeVars } = theme;
  const { categories, setCategories } = catMgmt;

  // --- UI 상태 ---
  const [searchQuery, setSearchQuery] = useState('');
  const [isBgModalOpen, setIsBgModalOpen] = useState(false);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);

  // 좌측 패널 너비
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    const saved = localStorage.getItem('qf_left_panel_width');
    return saved ? JSON.parse(saved) : 280;
  });

  // 좌측 사이드바 접기/펼치기
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('qf_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('qf_sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // explorerPath: { path, key } 구조로 같은 경로를 다시 설정해도 useEffect가 반응하도록 함
  const [explorerRequest, setExplorerRequest] = useState<{ path: string; key: number }>({ path: '', key: 0 });
  const setExplorerPath = useCallback((path: string) => {
    setExplorerRequest(prev => ({ path, key: prev.key + 1 }));
  }, []);

  // --- 분할 뷰 상태 ---
  const [splitMode, setSplitMode] = useState<'single' | 'horizontal' | 'vertical'>(() => {
    return (localStorage.getItem('qf_split_mode') as 'single' | 'horizontal' | 'vertical') || 'single';
  });
  const [explorerRequest2, setExplorerRequest2] = useState<{ path: string; key: number }>({ path: '', key: 0 });
  const setExplorerPath2 = useCallback((path: string) => {
    setExplorerRequest2(prev => ({ path, key: prev.key + 1 }));
  }, []);
  const [focusedPane, setFocusedPane] = useState<0 | 1>(0);
  // 분할 뷰에서 두 패널이 클립보드를 공유
  const [sharedClipboard, setSharedClipboard] = useState<ClipboardData | null>(null);
  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = localStorage.getItem('qf_split_ratio');
    return saved ? Number(saved) : 0.5;
  });
  const splitContainerRef = useRef<HTMLDivElement>(null);

  // --- 분할 뷰 localStorage 동기화 ---
  useEffect(() => {
    localStorage.setItem('qf_split_mode', splitMode);
  }, [splitMode]);

  useEffect(() => {
    localStorage.setItem('qf_split_ratio', String(splitRatio));
  }, [splitRatio]);

  // --- 글로벌 키보드 단축키 (Ctrl+\: 분할 뷰, Ctrl+B: 사이드바 토글) ---
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        setSplitMode(prev => {
          if (prev === 'single') return 'horizontal';
          if (prev === 'horizontal') return 'vertical';
          return 'single';
        });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
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
      await invoke('copy_path', { path });
      addToast("경로가 클립보드에 복사되었습니다!", "success");
    } catch (error) {
      console.error(error);
      addToast("복사에 실패했습니다.", "error");
    }
  }, [addToast]);

  const handleOpenFolder = useCallback(async (path: string) => {
    try {
      await invoke('open_folder', { path });
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

  // 즐겨찾기 폴더 경로 목록 (FileExplorer에서 최근항목 조회 시 사용)
  const recentRoots = useMemo(() =>
    categories.flatMap(c => c.shortcuts.map(s => s.path)),
    [categories]
  );

  const handleOpenInExplorer = useCallback((path: string) => {
    if (splitMode === 'single' || focusedPane === 0) {
      setExplorerPath(path);
    } else {
      setExplorerPath2(path);
    }
  }, [splitMode, focusedPane]);

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
      localStorage.setItem('qf_left_panel_width', JSON.stringify(currentWidth));
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
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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

  // --- 필터 ---
  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return categories.map(cat => {
      const isTitleMatch = cat.title.toLowerCase().includes(q);
      const shortcutsToShow = isTitleMatch
        ? cat.shortcuts
        : cat.shortcuts.filter(s =>
          s.name.toLowerCase().includes(q) ||
          s.path.toLowerCase().includes(q)
        );
      return { ...cat, shortcuts: shortcutsToShow };
    }).filter(cat =>
      cat.shortcuts.length > 0 ||
      cat.title.toLowerCase().includes(q)
    );
  }, [categories, searchQuery]);

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
      {/* macOS 커스텀 타이틀바 (overlay 모드) */}
      <div
        data-tauri-drag-region
        className="flex-shrink-0 flex items-center border-b border-[var(--qf-border)]"
        style={{
          height: 36,
          paddingLeft: 72,
          backgroundColor: themeVars?.surface ?? '#111827',
          WebkitAppRegion: 'drag' as unknown as string,
        }}
      >
        <span
          className="text-xs font-semibold text-[var(--qf-muted)] select-none pointer-events-none"
        >
          QuickFolder
        </span>
      </div>

      {/* Split Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Favorites Panel */}
        <div
          style={{ width: sidebarCollapsed ? 32 : leftPanelWidth }}
          className="flex-shrink-0 flex flex-col overflow-hidden transition-[width] duration-200"
        >
          {/* 사이드바 헤더: 폴딩 아이콘 + (펼침 시) 검색/버튼 */}
          <div className="flex-shrink-0 border-b border-[var(--qf-border)]">
            {sidebarCollapsed ? (
              /* 접힌 상태: 폴딩 아이콘만 */
              <div className="flex items-center justify-center" style={{ height: 36 }}>
                <button
                  onClick={() => setSidebarCollapsed(prev => !prev)}
                  className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)]"
                  title="사이드바 펼치기 (Ctrl+B)"
                >
                  <PanelLeftOpen size={14} />
                </button>
              </div>
            ) : (
              /* 펼친 상태: 폴딩 아이콘 행 + 검색/버튼 행 (2줄) */
              <>
                <div className="flex items-center px-3" style={{ height: 32 }}>
                  <button
                    onClick={() => setSidebarCollapsed(prev => !prev)}
                    className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)]"
                    title="사이드바 접기 (Ctrl+B)"
                  >
                    <PanelLeftClose size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 px-3 pb-2">
                  <input
                    type="text"
                    placeholder="검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-[var(--qf-surface)] border border-[var(--qf-border)] text-[var(--qf-text)] rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--qf-accent)] flex-1 min-w-0 transition-all placeholder:text-[var(--qf-muted)]"
                  />
                  <button
                    type="button"
                    onClick={() => setIsZoomModalOpen(true)}
                    className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)] flex-shrink-0"
                    title="확대/축소"
                  >
                    <ZoomIn size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBgModalOpen(true)}
                    className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)] flex-shrink-0"
                    title="테마 설정"
                  >
                    <Palette size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={catMgmt.openAddCategoryModal}
                    className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)] flex-shrink-0"
                    title="카테고리 추가"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* 사이드바 콘텐츠 (접힌 상태에서 숨김) */}
          {!sidebarCollapsed && (
            <>
              <div className="flex-1 overflow-y-auto p-4">

          {/* 최근항목 버튼 */}
          <div
            className="flex items-center gap-2 px-2 py-1.5 mb-3 rounded-lg cursor-pointer select-none hover:bg-[var(--qf-surface-hover)] transition-colors"
            onClick={handleOpenRecent}
          >
            <Clock size={14} className="text-[var(--qf-accent)]" />
            <span className="text-xs font-semibold text-[var(--qf-text)]">최근항목</span>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={customCollisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <main
              className="w-full"
              onDragOverCapture={(e) => {
                e.preventDefault();
                updateHoveredCategoryFromDragEvent(e);
              }}
              onDragLeaveCapture={clearHoveredCategoryIfLeftMain}
            >
              <div
                style={{
                  transform: `scale(${theme.zoomScale})`,
                  transformOrigin: 'top left',
                  width: `${100 / theme.zoomScale}%`,
                }}
              >
              <SortableContext
                items={filteredCategories.map(c => c.id)}
                strategy={rectSortingStrategy}
              >
                {(
                  <div
                    style={{
                      columnCount: 1,
                      columnGap: '0.75rem',
                      width: '100%',
                      marginTop: '-0.75rem',
                    }}
                  >
                  {filteredCategories.map((category, idx) => (
                    <CategoryColumn
                      key={category.id}
                      category={category}
                      categoryIndex={idx}
                      toggleCollapse={catMgmt.toggleCollapse}
                      handleAddFolder={catMgmt.handleAddFolder}
                      openEditCategoryModal={catMgmt.openEditCategoryModal}
                      deleteCategory={catMgmt.deleteCategory}
                      handleOpenFolder={handleOpenInExplorer}
                      handleCopyPath={handleCopyPath}
                      deleteShortcut={catMgmt.deleteShortcut}
                      openEditFolderModal={catMgmt.openEditFolderModal}
                      searchQuery={searchQuery}
                      dropIndicator={dropIndicator}
                    />
                  ))}

                {filteredCategories.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-[var(--qf-muted)]" style={{ breakInside: 'avoid' }}>
                    <Search size={48} className="mb-4 opacity-50" />
                    <p className="text-lg font-medium">검색 결과가 없거나 등록된 카테고리가 없습니다.</p>
                    <Button onClick={catMgmt.openAddCategoryModal} className="mt-4" variant="secondary">
                      새 카테고리 만들기
                    </Button>
                  </div>
                )}
                  </div>
                )}
               </SortableContext>
              </div>
            </main>
            <DragOverlay>
              {activeId ? (() => {
                const activeCategory = categories.find(c => c.id === activeId);
                if (activeCategory) {
                  return (
                    <div className="bg-[var(--qf-surface-2)] border-2 border-[var(--qf-accent)] rounded-2xl p-3 shadow-2xl backdrop-blur-sm min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <h2
                          className="font-semibold"
                          style={{
                            color:
                              activeCategory.color?.startsWith('#')
                                ? activeCategory.color
                                : (activeCategory.color &&
                                    (LEGACY_TEXT_CLASS_TO_HEX[activeCategory.color] ||
                                      LEGACY_BG_CLASS_TO_HEX[activeCategory.color])) ||
                                  undefined,
                          }}
                        >
                          {activeCategory.title}
                        </h2>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="bg-[var(--qf-surface-2)] p-2 rounded-lg shadow-xl border border-[var(--qf-accent-50)] flex items-center gap-3">
                      <div className="p-1.5 rounded-md bg-[var(--qf-surface)] text-[var(--qf-accent)]">
                        <Folder size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[var(--qf-text)] truncate">Moving...</div>
                      </div>
                    </div>
                  );
                }
              })() : null}
            </DragOverlay>
          </DndContext>
              </div>
            </>
          )}
        </div>

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
          className={`flex-1 min-w-0 overflow-hidden flex ${splitMode === 'vertical' ? 'flex-col' : 'flex-row'}`}
        >
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
              onSplitModeChange={setSplitMode}
              initialPath={explorerRequest.path}
              initialPathKey={explorerRequest.key}
              onPathChange={setExplorerPath}
              onAddToFavorites={handleAddFavoriteFromExplorer}
              onAddToCategory={catMgmt.handleAddFolder}
              themeVars={themeVars}
              sharedClipboard={sharedClipboard}
              onClipboardChange={setSharedClipboard}
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
                  onSplitModeChange={setSplitMode}
                  initialPath={explorerRequest2.path}
                  initialPathKey={explorerRequest2.key}
                  onPathChange={setExplorerPath2}
                  onAddToFavorites={handleAddFavoriteFromExplorer}
                  onAddToCategory={catMgmt.handleAddFolder}
                  themeVars={themeVars}
                  sharedClipboard={sharedClipboard}
                  onClipboardChange={setSharedClipboard}
                  recentRoots={recentRoots}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* --- Modals --- */}

      <ThemeSettingsModal isOpen={isBgModalOpen} onClose={() => setIsBgModalOpen(false)} theme={theme} />
      <ZoomModal isOpen={isZoomModalOpen} onClose={() => setIsZoomModalOpen(false)} zoomPercent={theme.zoomPercent} setZoomPercent={theme.setZoomPercent} />

      {/* Category Modal */}
      <Modal
        isOpen={catMgmt.isCatModalOpen}
        onClose={() => catMgmt.setIsCatModalOpen(false)}
        title={catMgmt.editingCategory ? "카테고리 수정" : "새 카테고리 추가"}
      >
        <form onSubmit={catMgmt.handleSaveCategory} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--qf-muted)] mb-1">카테고리 이름</label>
            <input type="text" required value={catMgmt.catFormTitle} onChange={(e) => catMgmt.setCatFormTitle(e.target.value)} className="w-full bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none" placeholder="예: 업무용, 개인용..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--qf-muted)] mb-2">색상 태그</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button key={color.value} type="button" onClick={() => catMgmt.setCatFormColor(color.value)} className={`w-8 h-8 rounded-full transition-transform ${catMgmt.catFormColor === color.value ? 'ring-2 ring-offset-2 ring-offset-[var(--qf-surface)] ring-white scale-110' : 'hover:scale-110 opacity-70 hover:opacity-100'}`} style={{ backgroundColor: color.value }} title={color.name} />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input type="color" value={normalizeHexColor(catMgmt.catFormColor) ?? '#60a5fa'} onChange={(e) => catMgmt.setCatFormColor(e.target.value)} className="h-10 w-12 rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface-2)] p-1" aria-label="카테고리 텍스트 커스텀 컬러 선택" />
              <input type="text" value={catMgmt.catFormColor} onChange={(e) => catMgmt.setCatFormColor(e.target.value)} placeholder="#60a5fa" className="flex-1 bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs" />
              <Button type="button" variant="secondary" onClick={() => { const v = normalizeHexColor(catMgmt.catFormColor); if (v) catMgmt.setCatFormColor(v); else addToast("색상 값은 #RRGGBB 형식이어야 합니다.", "error"); }}>적용</Button>
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => catMgmt.setIsCatModalOpen(false)}>취소</Button>
            <Button type="submit">{catMgmt.editingCategory ? "수정 완료" : "추가하기"}</Button>
          </div>
        </form>
      </Modal>

      {/* Folder Shortcut Modal */}
      <Modal
        isOpen={catMgmt.isFolderModalOpen}
        onClose={() => catMgmt.setIsFolderModalOpen(false)}
        title={catMgmt.editingShortcut ? "폴더 바로가기 수정" : "폴더 바로가기 추가"}
      >
        <form onSubmit={catMgmt.handleSaveFolder} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--qf-muted)] mb-1">바로가기 이름</label>
            <input type="text" required value={catMgmt.folderFormName} onChange={(e) => catMgmt.setFolderFormName(e.target.value)} className="w-full bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none" placeholder="예: 프로젝트 문서" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--qf-muted)] mb-1">폴더 경로</label>
            <div className="relative">
              <input type="text" required value={catMgmt.folderFormPath} onChange={(e) => catMgmt.setFolderFormPath(e.target.value)} className="w-full bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg pl-3 pr-10 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs" placeholder="C:\Users\Name\Documents..." />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-[var(--qf-muted)]"><Folder size={14} /></div>
            </div>
            <p className="text-xs text-[var(--qf-muted)] mt-1">* 탐색기 주소창의 경로를 복사해서 붙여넣으세요.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--qf-muted)] mb-2">텍스트 색상</label>
            <div className="flex flex-wrap gap-2">
              {FOLDER_TEXT_COLORS.map((color) => (
                <button key={color.value || color.name} type="button" onClick={() => catMgmt.setFolderFormColor(color.value)} className={`w-8 h-8 rounded-full transition-transform ${catMgmt.folderFormColor === color.value ? 'ring-2 ring-offset-2 ring-offset-[var(--qf-surface)] ring-white scale-110' : 'hover:scale-110 opacity-70 hover:opacity-100'}`} style={{ backgroundColor: color.value || (themeVars?.text ?? '#e5e7eb'), border: color.value ? undefined : '1px solid rgba(255,255,255,0.18)' }} title={color.name} />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input type="color" value={normalizeHexColor(catMgmt.folderFormColor) ?? '#ffffff'} onChange={(e) => catMgmt.setFolderFormColor(e.target.value)} className="h-10 w-12 rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface-2)] p-1" aria-label="폴더 텍스트 커스텀 컬러 선택" />
              <input type="text" value={catMgmt.folderFormColor} onChange={(e) => catMgmt.setFolderFormColor(e.target.value)} placeholder="#ffffff" className="flex-1 bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs" />
              <Button type="button" variant="secondary" onClick={() => { if (!catMgmt.folderFormColor) return; const v = normalizeHexColor(catMgmt.folderFormColor); if (v) catMgmt.setFolderFormColor(v); else addToast("색상 값은 #RRGGBB 형식이어야 합니다.", "error"); }}>적용</Button>
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => catMgmt.setIsFolderModalOpen(false)}>취소</Button>
            <Button type="submit">{catMgmt.editingShortcut ? "수정 완료" : "추가하기"}</Button>
          </div>
        </form>
      </Modal>

      {/* Update Modal */}
      {autoUpdate.updateInfo && (
        <UpdateModal
          isOpen={autoUpdate.isUpdateModalOpen}
          onClose={() => autoUpdate.setIsUpdateModalOpen(false)}
          onUpdate={autoUpdate.handleUpdate}
          version={autoUpdate.updateInfo.version}
          currentVersion={autoUpdate.currentAppVersion}
          releaseNotes={autoUpdate.updateInfo.body}
          isDownloading={autoUpdate.isDownloading}
          downloadProgress={autoUpdate.downloadProgress}
        />
      )}

      {/* Notifications */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
