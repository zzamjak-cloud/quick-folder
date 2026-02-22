import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Settings,
  Folder,
  Copy,
  Trash2,
  Edit2,
  ExternalLink,
  Palette,
  Search,
  ZoomIn,
  MoreVertical,
  ChevronDown,
  ChevronRight
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
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  DropAnimation,
  useDroppable,
  CollisionDetection,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { v4 as uuidv4 } from 'uuid';
import { Category, FolderShortcut, ToastMessage } from './types';
import { Button } from './components/ui/Button';
import { Modal } from './components/ui/Modal';
import { ToastContainer } from './components/ToastContainer';
import { UpdateModal } from './components/UpdateModal';
import FileExplorer from './components/FileExplorer';
import { invoke } from '@tauri-apps/api/core';

// 커스텀 훅
import {
  useThemeManagement,
  THEME_PRESETS,
  COLORS,
  FOLDER_TEXT_COLORS,
  normalizeHexColor,
} from './hooks/useThemeManagement';
import { useWindowState } from './hooks/useWindowState';
import { useAutoUpdate } from './hooks/useAutoUpdate';
import { useTauriDragDrop, isExternalFileDragEvent } from './hooks/useTauriDragDrop';
import {
  useCategoryManagement,
  LEGACY_TEXT_CLASS_TO_HEX,
  LEGACY_BG_CLASS_TO_HEX,
} from './hooks/useCategoryManagement';

// --- Sortable Item Component ---
interface SortableShortcutItemProps {
  shortcut: FolderShortcut;
  categoryId: string;
  handleOpenFolder: (path: string) => void;
  handleCopyPath: (path: string) => void;
  deleteShortcut: (catId: string, sId: string) => void;
  openEditFolderModal: (catId: string, shortcut: FolderShortcut) => void;
  key?: React.Key;
}

function SortableShortcutItem({ shortcut, categoryId, handleOpenFolder, handleCopyPath, deleteShortcut, openEditFolderModal }: SortableShortcutItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: shortcut.id,
    data: {
      type: 'Shortcut',
      shortcut,
      categoryId
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group/item flex items-center justify-between p-2 rounded-lg transition-colors border border-transparent bg-[var(--qf-surface)] hover:bg-[var(--qf-surface-hover)] hover:border-[var(--qf-border)]"
      {...attributes}
      {...listeners}
    >
      <div
        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
        onClick={() => handleOpenFolder(shortcut.path)}
        title={`${shortcut.path} (클릭하여 탐색기에서 열기)`}
      >
        <div className="text-[var(--qf-accent)] transition-colors">
          <Folder size={16} />
        </div>
        <div className="min-w-0">
          <div
            className="text-sm font-medium group-hover/item:opacity-80 truncate"
            style={{
              color:
                shortcut.color?.startsWith('#')
                  ? shortcut.color
                  : (shortcut.color && LEGACY_TEXT_CLASS_TO_HEX[shortcut.color]) || undefined,
            }}
          >
            {shortcut.name}
          </div>
        </div>
      </div>

      {/* MoreVertical 드롭다운 */}
      <div
        className="relative opacity-0 group-hover/item:opacity-100 transition-opacity"
        ref={menuRef}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-1.5 text-[var(--qf-muted)] hover:text-[var(--qf-text)] hover:bg-[var(--qf-surface-hover)] rounded-md"
          title="더 보기"
        >
          <MoreVertical size={13} />
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-xl overflow-hidden min-w-[130px]"
            style={{
              backgroundColor: 'var(--qf-surface-2)',
              border: '1px solid var(--qf-border)',
            }}
          >
            {[
              {
                icon: <Edit2 size={12} />,
                label: '수정',
                onClick: () => { openEditFolderModal(categoryId, shortcut); setMenuOpen(false); },
              },
              {
                icon: <Copy size={12} />,
                label: '경로 복사',
                onClick: () => { handleCopyPath(shortcut.path); setMenuOpen(false); },
              },
              {
                icon: <Trash2 size={12} style={{ color: '#f87171' }} />,
                label: '삭제',
                onClick: () => { deleteShortcut(categoryId, shortcut.id); setMenuOpen(false); },
              },
            ].map(item => (
              <button
                key={item.label}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); item.onClick(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-[var(--qf-surface-hover)] text-[var(--qf-text)]"
              >
                <span className="text-[var(--qf-muted)]">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

// --- Category Component ---
interface CategoryColumnProps {
  category: Category;
  toggleCollapse: (id: string) => void;
  handleAddFolder: (catId: string, path?: string, name?: string) => void;
  openEditCategoryModal: (cat: Category) => void;
  deleteCategory: (id: string) => void;
  handleOpenFolder: (path: string) => void;
  handleCopyPath: (path: string) => void;
  deleteShortcut: (catId: string, sId: string) => void;
  openEditFolderModal: (catId: string, shortcut: FolderShortcut) => void;
  searchQuery: string;
  key?: React.Key;
}

function CategoryColumn({
  category,
  toggleCollapse,
  handleAddFolder,
  openEditCategoryModal,
  deleteCategory,
  handleOpenFolder,
  handleCopyPath,
  deleteShortcut,
  openEditFolderModal,
  searchQuery
}: CategoryColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver
  } = useSortable({
    id: category.id,
    data: {
      type: 'Category',
      category,
      categoryId: category.id
    }
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    breakInside: 'avoid' as const,
    display: 'inline-block',
    width: '100%',
    marginTop: '1.5rem',
  };

  const isExpanded = !category.isCollapsed || searchQuery.length > 0;
  const categoryTitleHex =
    category.color?.startsWith('#')
      ? category.color
      : (category.color && (LEGACY_TEXT_CLASS_TO_HEX[category.color] || LEGACY_BG_CLASS_TO_HEX[category.color])) || '';

  return (
    <SortableContext
      id={category.id}
      items={category.shortcuts.map(s => s.id)}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        style={style}
        data-category-id={category.id}
        className={`border rounded-2xl overflow-hidden backdrop-blur-sm transition-colors group flex flex-col w-full bg-[var(--qf-surface)] border-[var(--qf-border)] ${isOver ? 'border-[var(--qf-accent-50)] bg-[var(--qf-surface-2)]' : 'hover:border-[var(--qf-border)]'} ${isDragging ? 'shadow-2xl shadow-[var(--qf-accent-20)]' : ''}`}
      >
        <div
          className={`p-3 border-b flex items-center justify-between bg-[var(--qf-surface-2)] border-[var(--qf-border)] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          {...attributes}
          {...listeners}
        >
          <div
            className="flex items-center gap-2 cursor-pointer select-none"
            onClick={() => toggleCollapse(category.id)}
          >
            {isExpanded ? <ChevronDown size={18} className="text-[var(--qf-muted)]" /> : <ChevronRight size={18} className="text-[var(--qf-muted)]" />}
            <h2
              className="font-semibold truncate max-w-[140px]"
              style={{ color: categoryTitleHex || undefined }}
              title={category.title}
            >
              {category.title}
            </h2>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => handleAddFolder(category.id)}
              className="p-1.5 text-[var(--qf-muted)] hover:text-[var(--qf-accent)] hover:bg-[var(--qf-surface-hover)] rounded-md transition-colors"
              title="폴더 추가"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => openEditCategoryModal(category)}
              className="p-1.5 text-[var(--qf-muted)] hover:text-[var(--qf-text)] hover:bg-[var(--qf-surface-hover)] rounded-md transition-colors"
              title="카테고리 수정"
            >
              <Settings size={14} />
            </button>
            <button
              onClick={() => deleteCategory(category.id)}
              className="p-1.5 text-[var(--qf-muted)] hover:text-red-400 hover:bg-[var(--qf-surface-hover)] rounded-md transition-colors"
              title="카테고리 삭제"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="p-3 flex-1">
            {category.shortcuts.length === 0 ? (
              <div className="text-center py-6 text-[var(--qf-muted)] text-xs italic">
                등록된 폴더가 없습니다
                <br />
                <span className="text-[10px] opacity-70 mt-1 block">폴더를 이곳으로 드래그하세요</span>
              </div>
            ) : (
              <ul className="space-y-1.5 min-h-[50px]">
                {category.shortcuts.map(shortcut => (
                  <SortableShortcutItem
                    key={shortcut.id}
                    shortcut={shortcut}
                    categoryId={category.id}
                    handleOpenFolder={handleOpenFolder}
                    handleCopyPath={handleCopyPath}
                    deleteShortcut={deleteShortcut}
                    openEditFolderModal={openEditFolderModal}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </SortableContext>
  );
}

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
  const [columnCount, setColumnCount] = useState(1);
  const [masonryKey, setMasonryKey] = useState(0);
  const [isMasonryVisible, setIsMasonryVisible] = useState(true);
  const [isBgModalOpen, setIsBgModalOpen] = useState(false);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const masonryRef = React.useRef<HTMLDivElement>(null);

  // 분할 패널 상태
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    const saved = localStorage.getItem('qf_left_panel_width');
    return saved ? JSON.parse(saved) : 280;
  });
  const [explorerPath, setExplorerPath] = useState('');

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

  const handleOpenInExplorer = useCallback((path: string) => {
    setExplorerPath(path);
  }, []);

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

  // --- 열 수 계산 ---
  useEffect(() => {
    const updateColumnCount = () => {
      const container = document.querySelector('main');
      const width = container ? container.clientWidth : window.innerWidth;

      let newCount: number;
      if (width >= 1400) newCount = 5;
      else if (width >= 1100) newCount = 4;
      else if (width >= 800) newCount = 3;
      else if (width >= 400) newCount = 2;
      else newCount = 1;

      setColumnCount(prev => prev !== newCount ? newCount : prev);
    };

    const initTimer = setTimeout(updateColumnCount, 100);
    window.addEventListener('resize', updateColumnCount, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    const connectObserver = () => {
      const mainElement = document.querySelector('main');
      if (mainElement) {
        resizeObserver = new ResizeObserver(updateColumnCount);
        resizeObserver.observe(mainElement);
      }
    };
    setTimeout(connectObserver, 200);

    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('resize', updateColumnCount);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  // columnCount 변경 시 CSS 변수 업데이트 + 컨테이너 재생성
  useEffect(() => {
    document.documentElement.style.setProperty('--masonry-columns', String(columnCount));
    setIsMasonryVisible(false);
    requestAnimationFrame(() => {
      setMasonryKey(prev => prev + 1);
      requestAnimationFrame(() => {
        setIsMasonryVisible(true);
      });
    });
  }, [columnCount]);

  // --- DnD ---
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    const activeType = args.active?.data?.current?.type;
    if (activeType === 'Category') return rectIntersection(args);
    return closestCenter(args);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.data.current?.type === 'Category') return;

    const activeSectionId = active.data.current?.categoryId as string | undefined;
    const overSectionId = (over.data.current?.categoryId ?? over.id) as string;
    if (!activeSectionId || !overSectionId) return;

    if (activeSectionId === overSectionId) {
      if (over.id === overSectionId) return;
      setCategories(prev => {
        const catIdx = prev.findIndex(c => c.id === activeSectionId);
        if (catIdx === -1) return prev;
        const activeIdx = prev[catIdx].shortcuts.findIndex(s => s.id === active.id);
        const overIdx = prev[catIdx].shortcuts.findIndex(s => s.id === over.id);
        if (activeIdx === -1 || overIdx === -1 || activeIdx === overIdx) return prev;
        const updated = [...prev];
        updated[catIdx] = {
          ...updated[catIdx],
          shortcuts: arrayMove(updated[catIdx].shortcuts, activeIdx, overIdx),
        };
        return updated;
      });
      return;
    }

    setCategories((prev) => {
      const activeCategory = prev.find((c) => c.id === activeSectionId);
      const overCategory = prev.find((c) => c.id === overSectionId);
      if (!activeCategory || !overCategory) return prev;

      const activeItems = activeCategory.shortcuts;
      const overItems = overCategory.shortcuts;
      const activeIndex = activeItems.findIndex((i) => i.id === active.id);
      const overIndex = overItems.findIndex((i) => i.id === over.id);

      let newIndex: number;
      if (over.id === overSectionId) {
        newIndex = overItems.length + 1;
      } else {
        const isBelowOverItem =
          over &&
          active.rect.current.translated &&
          active.rect.current.translated.top > over.rect.top + over.rect.height;
        const modifier = isBelowOverItem ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      }

      return prev.map((c) => {
        if (c.id === activeSectionId) {
          return { ...c, shortcuts: c.shortcuts.filter((item) => item.id !== active.id) };
        } else if (c.id === overSectionId) {
          return {
            ...c,
            shortcuts: [
              ...c.shortcuts.slice(0, newIndex),
              activeItems[activeIndex],
              ...c.shortcuts.slice(newIndex),
            ],
          };
        }
        return c;
      });
    });
  }, [setCategories]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) { setActiveId(null); return; }

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    if (activeType === 'Category' && overType === 'Category') {
      setCategories((prev) => {
        const activeIndex = prev.findIndex((c) => c.id === active.id);
        const overIndex = prev.findIndex((c) => c.id === over.id);
        if (activeIndex !== overIndex) {
          return arrayMove(prev, activeIndex, overIndex);
        }
        return prev;
      });
    }

    setActiveId(null);
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
      {/* Split Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Favorites Panel */}
        <div style={{ width: leftPanelWidth }} className="flex-shrink-0 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-3 pt-3 pb-2 flex flex-col gap-2 border-b border-[var(--qf-border)]">
            <input
              type="text"
              placeholder="검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[var(--qf-surface)] border border-[var(--qf-border)] text-[var(--qf-text)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--qf-accent)] w-full transition-all placeholder:text-[var(--qf-muted)]"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--qf-muted)] font-medium">즐겨찾기</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsZoomModalOpen(true)}
                  className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)]"
                  title="확대/축소"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsBgModalOpen(true)}
                  className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)]"
                  title="테마 설정"
                >
                  <Palette size={14} />
                </button>
                <button
                  type="button"
                  onClick={catMgmt.openAddCategoryModal}
                  className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)]"
                  title="카테고리 추가"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
          <DndContext
            sensors={sensors}
            collisionDetection={customCollisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <main
              className="w-full"
              onDragEnterCapture={updateHoveredCategoryFromDragEvent}
              onDragOverCapture={(e) => {
                if (isExternalFileDragEvent(e)) e.preventDefault();
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
                {isMasonryVisible && (
                  <div
                    ref={masonryRef}
                    key={`masonry-${columnCount}-${masonryKey}`}
                    style={{
                      columnCount: columnCount,
                      columnGap: '1.5rem',
                      width: '100%',
                      marginTop: '-1.5rem',
                    }}
                  >
                  {filteredCategories.map(category => (
                    <CategoryColumn
                      key={category.id}
                      category={category}
                      toggleCollapse={catMgmt.toggleCollapse}
                      handleAddFolder={catMgmt.handleAddFolder}
                      openEditCategoryModal={catMgmt.openEditCategoryModal}
                      deleteCategory={catMgmt.deleteCategory}
                      handleOpenFolder={handleOpenInExplorer}
                      handleCopyPath={handleCopyPath}
                      deleteShortcut={catMgmt.deleteShortcut}
                      openEditFolderModal={catMgmt.openEditFolderModal}
                      searchQuery={searchQuery}
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
        </div>

        {/* 드래그 구분선 */}
        <div
          className="w-1 flex-shrink-0 cursor-col-resize bg-[var(--qf-border)] hover:bg-[var(--qf-accent)] transition-colors"
          onMouseDown={handleDividerMouseDown}
        />

        {/* Right: File Explorer */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <FileExplorer
            initialPath={explorerPath}
            onPathChange={setExplorerPath}
            onAddToFavorites={handleAddFavoriteFromExplorer}
            themeVars={themeVars}
          />
        </div>
      </div>

      {/* --- Modals --- */}

      {/* Theme Settings Modal */}
      <Modal
        isOpen={isBgModalOpen}
        onClose={() => setIsBgModalOpen(false)}
        title="테마 설정"
      >
        <div className="space-y-5">
          <div>
            <div className="text-sm font-medium text-[var(--qf-muted)] mb-2">프리셋 테마</div>
            <div className="grid grid-cols-2 gap-2">
              {THEME_PRESETS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    theme.setThemeId(t.id);
                    theme.setBgInputValue(t.bg);
                    theme.setAccentInputValue(t.accent);
                  }}
                  className={`flex items-center gap-2 p-2 rounded-lg border transition-colors bg-[var(--qf-surface)] hover:bg-[var(--qf-surface-hover)] border-[var(--qf-border)] ${theme.themeId === t.id ? 'ring-2 ring-[var(--qf-accent)]' : ''}`}
                  title={`${t.bg} / ${t.accent}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-md border border-white/10" style={{ backgroundColor: t.bg }} />
                    <span className="w-2.5 h-2.5 rounded-full border border-white/10" style={{ backgroundColor: t.accent }} />
                  </span>
                  <span className="text-xs text-[var(--qf-text)] truncate">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-[var(--qf-muted)] mb-2">커스텀 (배경 + 강조색)</div>
            <div className="flex items-center gap-3 mb-3">
              <input type="color" value={normalizeHexColor(theme.bgInputValue) ?? theme.customBg} onChange={(e) => theme.setBgInputValue(e.target.value)} className="h-10 w-12 rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface-2)] p-1" aria-label="배경색 선택" />
              <input type="text" value={theme.bgInputValue} onChange={(e) => theme.setBgInputValue(e.target.value)} placeholder="#0f172a" className="flex-1 bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs" />
            </div>
            <div className="flex items-center gap-3">
              <input type="color" value={normalizeHexColor(theme.accentInputValue) ?? theme.customAccent} onChange={(e) => theme.setAccentInputValue(e.target.value)} className="h-10 w-12 rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface-2)] p-1" aria-label="강조색 선택" />
              <input type="text" value={theme.accentInputValue} onChange={(e) => theme.setAccentInputValue(e.target.value)} placeholder="#3b82f6" className="flex-1 bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs" />
              <Button type="button" variant="secondary" onClick={() => theme.applyCustomTheme(theme.bgInputValue, theme.accentInputValue)}>적용</Button>
            </div>
            <div className="text-[11px] text-[var(--qf-muted)] mt-2">* `#RRGGBB` 형식만 지원합니다.</div>
          </div>

          <div className="pt-2 flex justify-between items-center">
            <Button type="button" variant="ghost" onClick={() => { theme.setThemeId(THEME_PRESETS[0].id); theme.setBgInputValue(THEME_PRESETS[0].bg); theme.setAccentInputValue(THEME_PRESETS[0].accent); }}>기본값으로</Button>
            <Button type="button" variant="ghost" onClick={() => setIsBgModalOpen(false)}>닫기</Button>
          </div>
        </div>
      </Modal>

      {/* Zoom Modal */}
      <Modal
        isOpen={isZoomModalOpen}
        onClose={() => setIsZoomModalOpen(false)}
        title="확대/축소"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-[var(--qf-muted)]">현재</div>
            <div className="text-sm font-semibold text-[var(--qf-text)]">{theme.zoomPercent}%</div>
          </div>
          <input type="range" min={50} max={150} step={10} value={theme.zoomPercent} onChange={(e) => theme.setZoomPercent(Number(e.target.value))} className="w-full" aria-label="확대/축소 슬라이더" />
          <div className="flex items-center justify-between">
            <Button type="button" variant="secondary" onClick={() => theme.setZoomPercent((p) => Math.max(50, p - 10))}>－</Button>
            <Button type="button" variant="ghost" onClick={() => theme.setZoomPercent(100)}>100%로</Button>
            <Button type="button" variant="secondary" onClick={() => theme.setZoomPercent((p) => Math.min(150, p + 10))}>＋</Button>
          </div>
        </div>
      </Modal>

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
