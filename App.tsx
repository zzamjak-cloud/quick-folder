import React, { useState, useEffect } from 'react';
import {
  Plus,
  Settings,
  Folder,
  Copy,
  Trash2,
  Edit2,
  ExternalLink,
  LayoutGrid,
  Search,
  MoreVertical,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  pointerWithin,
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
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';

// --- Types & Constants ---
const STORAGE_KEY = 'quickfolder_widget_data';

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

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group/item flex items-center justify-between p-2 rounded-lg hover:bg-slate-700/50 transition-colors border border-transparent hover:border-slate-600/50 bg-slate-800/20"
      {...attributes}
      {...listeners}
    >
      <div
        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
        onClick={() => handleOpenFolder(shortcut.path)}
        title={`${shortcut.path} (클릭하여 열기)`}
      >
        <div className={`p-1.5 rounded-md bg-slate-800 text-blue-400 group-hover/item:text-blue-300 transition-colors`}>
          <Folder size={16} />
        </div>
        <div className="min-w-0">
          <div className={`text-sm font-medium ${shortcut.color || 'text-slate-200'} group-hover/item:opacity-80 truncate`}>
            {shortcut.name}
          </div>
          {/* Path hidden as per user feedback */}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity pl-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            openEditFolderModal(categoryId, shortcut);
          }}
          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-md"
          title="수정"
          onPointerDown={(e) => e.stopPropagation()} // Prevent drag start
        >
          <Edit2 size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopyPath(shortcut.path);
          }}
          className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-slate-700 rounded-md"
          title="경로 복사"
          onPointerDown={(e) => e.stopPropagation()} // Prevent drag start
        >
          <Copy size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteShortcut(categoryId, shortcut.id);
          }}
          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-md"
          title="삭제"
          onPointerDown={(e) => e.stopPropagation()} // Prevent drag start
        >
          <Trash2 size={12} />
        </button>
      </div>
    </li>
  );
}

// Fixed handleCopyPath prop type in component definition
// ...
const DEFAULT_CATEGORIES: Category[] = [
  {
    id: '1',
    title: '작업 공간',
    color: 'bg-blue-500',
    createdAt: Date.now(),
    shortcuts: [
      { id: '101', name: '프로젝트 A', path: 'D:\\Projects\\ProjectA', createdAt: Date.now() },
      { id: '102', name: '디자인 리소스', path: 'D:\\Assets\\Design', createdAt: Date.now() },
    ]
  },
  {
    id: '2',
    title: '다운로드 & 문서',
    color: 'bg-emerald-500',
    createdAt: Date.now(),
    shortcuts: [
      { id: '201', name: 'Downloads', path: 'C:\\Users\\User\\Downloads', createdAt: Date.now() },
      { id: '202', name: 'Documents', path: 'C:\\Users\\User\\Documents', createdAt: Date.now() },
    ]
  }
];

const COLORS = [
  { name: 'Blue', value: 'bg-blue-500' },
  { name: 'Emerald', value: 'bg-emerald-500' },
  { name: 'Purple', value: 'bg-purple-500' },
  { name: 'Amber', value: 'bg-amber-500' },
  { name: 'Rose', value: 'bg-rose-500' },
  { name: 'Slate', value: 'bg-slate-500' },
];

// 폴더 텍스트 색상 옵션
const FOLDER_TEXT_COLORS = [
  { name: '기본', textClass: 'text-slate-200', bgClass: 'bg-slate-200' },
  { name: '파란색', textClass: 'text-blue-400', bgClass: 'bg-blue-400' },
  { name: '초록색', textClass: 'text-emerald-400', bgClass: 'bg-emerald-400' },
  { name: '보라색', textClass: 'text-purple-400', bgClass: 'bg-purple-400' },
  { name: '노란색', textClass: 'text-amber-400', bgClass: 'bg-amber-400' },
  { name: '분홍색', textClass: 'text-rose-400', bgClass: 'bg-rose-400' },
  { name: '빨간색', textClass: 'text-red-400', bgClass: 'bg-red-400' },
  { name: '주황색', textClass: 'text-orange-400', bgClass: 'bg-orange-400' },
  { name: '하늘색', textClass: 'text-cyan-400', bgClass: 'bg-cyan-400' },
  { name: '연보라색', textClass: 'text-violet-400', bgClass: 'bg-violet-400' },
];

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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isExpanded = !category.isCollapsed || searchQuery.length > 0;

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
        className={`bg-slate-800/50 border rounded-2xl overflow-hidden backdrop-blur-sm transition-colors group flex flex-col w-full ${isOver ? 'border-blue-500/50 bg-slate-800/80' : 'border-slate-700/50 hover:border-slate-600'} ${isDragging ? 'shadow-2xl shadow-blue-500/20' : ''}`}
      >
        {/* Category Header */}
        <div
          className={`p-3 border-b border-slate-700/50 flex items-center justify-between bg-slate-800/80 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          {...attributes}
          {...listeners}
        >
          <div
            className="flex items-center gap-2 cursor-pointer select-none"
            onClick={() => toggleCollapse(category.id)}
          >
            {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
            <div className={`w-2.5 h-2.5 rounded-full ${category.color} shadow-lg shadow-${category.color.replace('bg-', '')}/50`} />
            <h2 className="font-semibold text-white truncate max-w-[120px]" title={category.title}>
              {category.title}
            </h2>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => handleAddFolder(category.id)}
              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-md transition-colors"
              title="폴더 추가"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => openEditCategoryModal(category)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
              title="카테고리 수정"
            >
              <Settings size={14} />
            </button>
            <button
              onClick={() => deleteCategory(category.id)}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-md transition-colors"
              title="카테고리 삭제"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Shortcuts List */}
        {isExpanded && (
          <div className="p-3 flex-1 overflow-y-auto max-h-[300px]">
            {category.shortcuts.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs italic">
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
  // --- State ---
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [columnCount, setColumnCount] = useState(1);
  const [masonryKey, setMasonryKey] = useState(0);
  const [isMasonryVisible, setIsMasonryVisible] = useState(true);
  const masonryRef = React.useRef<HTMLDivElement>(null);
  const hoveredCategoryIdRef = React.useRef<string | null>(null);

  // Modals
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catFormTitle, setCatFormTitle] = useState('');
  const [catFormColor, setCatFormColor] = useState(COLORS[0].value);

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [targetCategoryId, setTargetCategoryId] = useState<string | null>(null);
  const [folderFormName, setFolderFormName] = useState('');
  const [folderFormPath, setFolderFormPath] = useState('');
  const [folderFormColor, setFolderFormColor] = useState(FOLDER_TEXT_COLORS[0].textClass);
  const [editingShortcut, setEditingShortcut] = useState<FolderShortcut | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // --- Effects ---
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setCategories(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved data", e);
        setCategories(DEFAULT_CATEGORIES);
      }
    } else {
      setCategories(DEFAULT_CATEGORIES);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
    }
  }, [categories, isLoaded]);

  // 창 크기에 따라 열 수 계산
  useEffect(() => {
    const updateColumnCount = () => {
      // 실제 컨테이너 너비를 측정
      const container = document.querySelector('main');
      const width = container ? container.clientWidth : window.innerWidth;
      
      let newCount: number;
      // 브레이크포인트 조정 (컨테이너 너비 기준, 카드 너비 약 200-250px 기준)
      // 현재 컨테이너가 466px이므로 2열을 표시하려면 더 낮은 브레이크포인트 필요
      if (width >= 1400) {
        newCount = 5; // 2xl
      } else if (width >= 1100) {
        newCount = 4; // xl
      } else if (width >= 800) {
        newCount = 3; // lg
      } else if (width >= 400) {
        newCount = 2; // sm (400px 이상이면 2열)
      } else {
        newCount = 1; // 기본 (400px 미만)
      }
      
      setColumnCount(prev => {
        if (prev !== newCount) {
          return newCount;
        }
        return prev;
      });
    };

    // DOM이 준비된 후 실행
    const initTimer = setTimeout(() => {
      updateColumnCount();
    }, 100);
    
    // 리사이즈 이벤트 핸들러
    const handleResize = () => {
      updateColumnCount();
    };
    
    // window resize 이벤트
    window.addEventListener('resize', handleResize, { passive: true });
    
    // ResizeObserver를 사용하여 컨테이너 크기 변화 감지
    let resizeObserver: ResizeObserver | null = null;
    const connectObserver = () => {
      const mainElement = document.querySelector('main');
      if (mainElement) {
        resizeObserver = new ResizeObserver(() => {
          updateColumnCount();
        });
        resizeObserver.observe(mainElement);
      }
    };
    
    // DOM 준비 후 observer 연결
    setTimeout(connectObserver, 200);
    
    // 주기적으로 체크 (Tauri 앱에서 이벤트가 누락될 수 있음)
    const intervalId = setInterval(updateColumnCount, 500);
    
    return () => {
      clearTimeout(initTimer);
      clearInterval(intervalId);
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);
  
  // columnCount 변경 시 CSS 변수 업데이트 및 컨테이너 완전 재생성
  useEffect(() => {
    document.documentElement.style.setProperty('--masonry-columns', String(columnCount));
    
    // 컨테이너를 완전히 재생성하기 위해 잠시 숨겼다가 다시 표시
    setIsMasonryVisible(false);
    
    // 다음 프레임에 key를 변경하고 다시 표시하여 완전히 재생성
    requestAnimationFrame(() => {
      setMasonryKey(prev => prev + 1);
      requestAnimationFrame(() => {
        setIsMasonryVisible(true);
      });
    });
  }, [columnCount]);

  const isExternalFileDragEvent = (e: React.DragEvent) => {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes('Files');
  };

  const updateHoveredCategoryFromDragEvent = (e: React.DragEvent) => {
    if (!isExternalFileDragEvent(e)) return;
    // 외부(탐색기) 드래그 시에만 현재 호버된 카테고리를 DOM 타겟 기반으로 추적
    const target = e.target as HTMLElement | null;
    const categoryEl = target?.closest?.('[data-category-id]') as HTMLElement | null;
    const id = categoryEl?.getAttribute('data-category-id') ?? null;
    hoveredCategoryIdRef.current = id;
  };

  const clearHoveredCategoryIfLeftMain = (e: React.DragEvent) => {
    if (!isExternalFileDragEvent(e)) return;
    const related = e.relatedTarget as Node | null;
    // main 영역 밖으로 완전히 벗어났을 때만 초기화
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    hoveredCategoryIdRef.current = null;
  };

  // Tauri 드래그앤드롭 리스너
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isMounted = true;

    const setupDragDrop = async () => {
      const unlistenFn = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === 'drop') {
          const paths = event.payload.paths;
          const position = event.payload.position;

          if (paths && paths.length > 0) {
            const path = paths[0];
            const name = path.split(/[\\/]/).pop() || 'Unknown';

            // 1) 가장 안정적인 방식: 외부 드래그 중 DOM 타겟 기반으로 추적해 둔 카테고리 사용
            let categoryId: string | null = hoveredCategoryIdRef.current;

            // 2) 폴백: 좌표 기반(환경에 따라 좌표계가 달라질 수 있어 두 번 시도)
            if (!categoryId) {
              const element1 = document.elementFromPoint(position.x, position.y);
              categoryId = element1?.closest('[data-category-id]')?.getAttribute('data-category-id') ?? null;
            }
            if (!categoryId) {
              const dpr = window.devicePixelRatio || 1;
              const element2 = document.elementFromPoint(position.x / dpr, position.y / dpr);
              categoryId = element2?.closest('[data-category-id]')?.getAttribute('data-category-id') ?? null;
            }

            if (categoryId) {
              handleAddFolder(categoryId, path, name);
            } else {
              // 폴백: 최신 categories에서 첫 번째 카테고리 찾기
              setCategories(currentCategories => {
                if (currentCategories.length > 0) {
                  handleAddFolder(currentCategories[0].id, path, name);
                }
                return currentCategories;
              });
            }

            // 드롭 처리 후에는 호버 상태 초기화
            hoveredCategoryIdRef.current = null;
          }
        }
      });

      // 컴포넌트가 여전히 마운트되어 있을 때만 unlisten 할당
      if (isMounted) {
        unlisten = unlistenFn;
      } else {
        // 이미 언마운트된 경우 즉시 cleanup
        unlistenFn();
      }
    };

    setupDragDrop();

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, []); // 의존성 배열을 비워서 한 번만 등록

  // --- Actions ---
  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = uuidv4();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Category Actions
  const openAddCategoryModal = () => {
    setEditingCategory(null);
    setCatFormTitle('');
    setCatFormColor(COLORS[0].value);
    setIsCatModalOpen(true);
  };

  const openEditCategoryModal = (cat: Category) => {
    setEditingCategory(cat);
    setCatFormTitle(cat.title);
    setCatFormColor(cat.color);
    setIsCatModalOpen(true);
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catFormTitle.trim()) return;

    if (editingCategory) {
      setCategories(prev => prev.map(c =>
        c.id === editingCategory.id
          ? { ...c, title: catFormTitle, color: catFormColor }
          : c
      ));
      addToast("카테고리가 수정되었습니다.", "success");
    } else {
      const newCat: Category = {
        id: uuidv4(),
        title: catFormTitle,
        color: catFormColor,
        shortcuts: [],
        createdAt: Date.now()
      };
      setCategories(prev => [...prev, newCat]);
      addToast("새 카테고리가 추가되었습니다.", "success");
    }
    setIsCatModalOpen(false);
  };

  const deleteCategory = (id: string) => {
    if (confirm('정말로 이 카테고리를 삭제하시겠습니까? 포함된 모든 바로가기가 삭제됩니다.')) {
      setCategories(prev => prev.filter(c => c.id !== id));
      addToast("카테고리가 삭제되었습니다.", "info");
    }
  };

  // Folder Actions
  const openAddFolderModal = (catId: string) => {
    setTargetCategoryId(catId);
    setFolderFormName('');
    setFolderFormPath('');
    setFolderFormColor(FOLDER_TEXT_COLORS[0].textClass);
    setEditingShortcut(null);
    setIsFolderModalOpen(true);
  };

  const openEditFolderModal = (catId: string, shortcut: FolderShortcut) => {
    setTargetCategoryId(catId);
    setFolderFormName(shortcut.name);
    setFolderFormPath(shortcut.path);
    setFolderFormColor(shortcut.color || FOLDER_TEXT_COLORS[0].textClass);
    setEditingShortcut(shortcut);
    setIsFolderModalOpen(true);
  };

  const handleSaveFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCategoryId || !folderFormName.trim() || !folderFormPath.trim()) return;

    if (editingShortcut) {
      // 수정 모드
      setCategories(prev => prev.map(c => {
        if (c.id === targetCategoryId) {
          return {
            ...c,
            shortcuts: c.shortcuts.map(s =>
              s.id === editingShortcut.id
                ? { ...s, name: folderFormName, path: folderFormPath.replace(/"/g, ''), color: folderFormColor }
                : s
            )
          };
        }
        return c;
      }));
      addToast("바로가기가 수정되었습니다.", "success");
    } else {
      // 추가 모드
      const newShortcut: FolderShortcut = {
        id: uuidv4(),
        name: folderFormName,
        path: folderFormPath.replace(/"/g, ''), // Clean up common copy-paste artifacts
        color: folderFormColor,
        createdAt: Date.now()
      };

      setCategories(prev => prev.map(c => {
        if (c.id === targetCategoryId) {
          return { ...c, shortcuts: [...c.shortcuts, newShortcut] };
        }
        return c;
      }));

      addToast("바로가기가 추가되었습니다.", "success");
    }
    setIsFolderModalOpen(false);
  };

  const handleAddFolder = async (catId: string, path?: string, name?: string) => {
    if (path && name) {
      // Direct add (e.g., from Drop)
      const newShortcut: FolderShortcut = {
        id: uuidv4(),
        name: name,
        path: path,
        color: FOLDER_TEXT_COLORS[0].textClass, // 기본 색상
        createdAt: Date.now()
      };

      setCategories(prev => prev.map(c => {
        if (c.id === catId) {
          return { ...c, shortcuts: [...c.shortcuts, newShortcut] };
        }
        return c;
      }));
      addToast("폴더가 추가되었습니다.", "success");
      return;
    }

    try {
      const result = await invoke<{ path: string; name: string } | null>('select_folder');
      if (result && result.path && result.name) {
        const newShortcut: FolderShortcut = {
          id: uuidv4(),
          name: result.name,
          path: result.path,
          color: FOLDER_TEXT_COLORS[0].textClass, // 기본 색상
          createdAt: Date.now()
        };

        setCategories(prev => prev.map(c => {
          if (c.id === catId) {
            return { ...c, shortcuts: [...c.shortcuts, newShortcut] };
          }
          return c;
        }));
        addToast("폴더가 추가되었습니다.", "success");
      }
    } catch (error) {
      console.error("Folder selection failed:", error);
      addToast("폴더 선택 중 오류가 발생했습니다.", "error");
    }
  };

  const deleteShortcut = (catId: string, shortcutId: string) => {
    setCategories(prev => prev.map(c => {
      if (c.id === catId) {
        return { ...c, shortcuts: c.shortcuts.filter(s => s.id !== shortcutId) };
      }
      return c;
    }));
    addToast("바로가기가 삭제되었습니다.", "info");
  };

  const handleCopyPath = async (path: string) => {
    try {
      await invoke('copy_path', { path });
      addToast("경로가 클립보드에 복사되었습니다!", "success");
    } catch (error) {
      console.error(error);
      addToast("복사에 실패했습니다.", "error");
    }
  };

  const handleOpenFolder = async (path: string) => {
    try {
      await invoke('open_folder', { path });
    } catch (error) {
      console.error(error);
      addToast("폴더를 열 수 없습니다.", "error");
    }
  };

  // --- Drag & Drop ---
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Custom collision detection: use pointerWithin for categories, closestCenter for shortcuts
  const customCollisionDetection = (args: any) => {
    const activeType = args.active?.data?.current?.type;

    if (activeType === 'Category') {
      // Masonry(컬럼) 레이아웃에서는 rect 기반이 더 자연스럽게 동작함
      return rectIntersection(args);
    }

    // For shortcut dragging, use closestCenter
    return closestCenter(args);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    // Skip if dragging a category
    if (active.data.current?.type === 'Category') return;

    // Find the containers
    const activeSectionId = active.data.current?.categoryId;
    const overSectionId = over.data.current?.categoryId || over.id; // If over category itself

    if (!activeSectionId || !overSectionId || activeSectionId === overSectionId) {
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

      let newIndex;
      if (over.id === overSectionId) {
        // We are over the category container, placed at the end
        newIndex = overItems.length + 1;
      } else {
        const isBelowOverItem =
          over &&
          active.rect.current.translated &&
          active.rect.current.translated.top >
          over.rect.top + over.rect.height;

        const modifier = isBelowOverItem ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      }

      return prev.map((c) => {
        if (c.id === activeSectionId) {
          return {
            ...c,
            shortcuts: c.shortcuts.filter((item) => item.id !== active.id),
          };
        } else if (c.id === overSectionId) {
          const newShortcuts = [
            ...c.shortcuts.slice(0, newIndex),
            activeItems[activeIndex],
            ...c.shortcuts.slice(newIndex, c.shortcuts.length),
          ];
          return {
            ...c,
            shortcuts: newShortcuts,
          };
        }
        return c;
      });
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      setActiveId(null);
      return;
    }

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    // Category reordering
    if (activeType === 'Category' && overType === 'Category') {
      const activeIndex = categories.findIndex((c) => c.id === active.id);
      const overIndex = categories.findIndex((c) => c.id === over.id);

      if (activeIndex !== overIndex) {
        setCategories((prev) => arrayMove(prev, activeIndex, overIndex));
      }
    }
    // Shortcut reordering within same category
    else {
      const activeSectionId = active.data.current?.categoryId;
      const overSectionId = over.data.current?.categoryId || over.id;

      if (activeSectionId && overSectionId && activeSectionId === overSectionId) {
        // Same container reorder
        const categoryIndex = categories.findIndex((c) => c.id === activeSectionId);
        const activeItemIndex = categories[categoryIndex].shortcuts.findIndex((s) => s.id === active.id);
        const overItemIndex = categories[categoryIndex].shortcuts.findIndex((s) => s.id === over.id);

        if (activeItemIndex !== overItemIndex) {
          setCategories((prev) => {
            const updated = [...prev];
            updated[categoryIndex].shortcuts = arrayMove(updated[categoryIndex].shortcuts, activeItemIndex, overItemIndex);
            return updated;
          });
        }
      }
    }

    setActiveId(null);
  };

  // Filter categories based on search
  // Filter categories based on search
  const filteredCategories = categories.map(cat => {
    const isTitleMatch = cat.title.toLowerCase().includes(searchQuery.toLowerCase());
    // If title matches, show all shortcuts. Otherwise, filter shortcuts.
    const shortcutsToShow = isTitleMatch
      ? cat.shortcuts
      : cat.shortcuts.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.path.toLowerCase().includes(searchQuery.toLowerCase())
      );

    return { ...cat, shortcuts: shortcutsToShow };
  }).filter(cat =>
    cat.shortcuts.length > 0 ||
    cat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleCollapse = (catId: string) => {
    setCategories(prev => prev.map(c =>
      c.id === catId ? { ...c, isCollapsed: !c.isCollapsed } : c
    ));
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 p-6 sm:p-10">
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <LayoutGrid className="text-blue-500" size={32} />
              QuickFolder
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              자주 사용하는 로컬 폴더를 위젯으로 관리하세요.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-slate-500 group-focus-within:text-blue-400 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64 transition-all"
              />
            </div>
            <Button onClick={openAddCategoryModal}>
              <Plus size={18} className="mr-2" />
              카테고리 추가
            </Button>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <main
          className="max-w-7xl mx-auto"
          onDragEnterCapture={(e) => {
            // 외부(탐색기) 드래그 시 호버된 카테고리 추적
            updateHoveredCategoryFromDragEvent(e);
          }}
          onDragOverCapture={(e) => {
            if (isExternalFileDragEvent(e)) {
              // dragover를 받아야 target 추적이 안정적으로 됨
              e.preventDefault();
            }
            updateHoveredCategoryFromDragEvent(e);
          }}
          onDragLeaveCapture={(e) => {
            clearHoveredCategoryIfLeftMain(e);
          }}
        >
          <SortableContext
            items={filteredCategories.map(c => c.id)}
            strategy={rectSortingStrategy}
          >
            {/* CSS Grid 레이아웃: 각 카테고리가 독립적인 높이를 가지며, 창 크기에 따라 열 수가 동적으로 조정됨 */}
            {isMasonryVisible && (
              <div 
                ref={masonryRef}
                key={`grid-${columnCount}-${masonryKey}`}
                style={{ 
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                  gap: '1.5rem',
                  width: '100%',
                  gridAutoRows: 'min-content', // 각 행이 독립적인 높이를 가지도록
                  alignItems: 'start' // 상단 정렬
                }}
              >
              {filteredCategories.map(category => (
                <CategoryColumn
                  key={category.id}
                  category={category}
                  toggleCollapse={toggleCollapse}
                  handleAddFolder={handleAddFolder}
                  openEditCategoryModal={openEditCategoryModal}
                  deleteCategory={deleteCategory}
                  handleOpenFolder={handleOpenFolder}
                  handleCopyPath={handleCopyPath}
                  deleteShortcut={deleteShortcut}
                  openEditFolderModal={openEditFolderModal}
                  searchQuery={searchQuery}
                />
              ))}

            {/* Empty State Helper */}
            {filteredCategories.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500" style={{ columnSpan: 'all', breakInside: 'avoid' }}>
                <Search size={48} className="mb-4 opacity-50" />
                <p className="text-lg font-medium">검색 결과가 없거나 등록된 카테고리가 없습니다.</p>
                <Button onClick={openAddCategoryModal} className="mt-4" variant="secondary">
                  새 카테고리 만들기
                </Button>
              </div>
            )}
              </div>
            )}
          </SortableContext>
        </main >
        <DragOverlay>
          {activeId ? (() => {
            // Check if activeId is a category
            const activeCategory = categories.find(c => c.id === activeId);

            if (activeCategory) {
              // Dragging a category
              return (
                <div className="bg-slate-800/90 border-2 border-blue-500 rounded-2xl p-3 shadow-2xl backdrop-blur-sm min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${activeCategory.color}`} />
                    <h2 className="font-semibold text-white">{activeCategory.title}</h2>
                  </div>
                </div>
              );
            } else {
              // Dragging a shortcut
              return (
                <div className="bg-slate-700 p-2 rounded-lg shadow-xl border border-blue-500/50 flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-slate-800 text-blue-400">
                    <Folder size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">Moving...</div>
                  </div>
                </div>
              );
            }
          })() : null}
        </DragOverlay>
      </DndContext >

      {/* --- Modals --- */}

      {/* Category Modal */}
      <Modal
        isOpen={isCatModalOpen}
        onClose={() => setIsCatModalOpen(false)}
        title={editingCategory ? "카테고리 수정" : "새 카테고리 추가"}
      >
        <form onSubmit={handleSaveCategory} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">카테고리 이름</label>
            <input
              type="text"
              required
              value={catFormTitle}
              onChange={(e) => setCatFormTitle(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="예: 업무용, 개인용..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">색상 태그</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setCatFormColor(color.value)}
                  className={`w-8 h-8 rounded-full ${color.value} transition-transform ${catFormColor === color.value
                    ? 'ring-2 ring-offset-2 ring-offset-slate-800 ring-white scale-110'
                    : 'hover:scale-110 opacity-70 hover:opacity-100'
                    }`}
                  title={color.name}
                />
              ))}
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsCatModalOpen(false)}>취소</Button>
            <Button type="submit">{editingCategory ? "수정 완료" : "추가하기"}</Button>
          </div>
        </form>
      </Modal>

      {/* Folder Shortcut Modal */}
      <Modal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        title={editingShortcut ? "폴더 바로가기 수정" : "폴더 바로가기 추가"}
      >
        <form onSubmit={handleSaveFolder} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">바로가기 이름</label>
            <input
              type="text"
              required
              value={folderFormName}
              onChange={(e) => setFolderFormName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="예: 프로젝트 문서"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">폴더 경로</label>
            <div className="relative">
              <input
                type="text"
                required
                value={folderFormPath}
                onChange={(e) => setFolderFormPath(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-10 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono text-xs"
                placeholder="C:\Users\Name\Documents..."
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                <Folder size={14} />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              * 탐색기 주소창의 경로를 복사해서 붙여넣으세요.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">텍스트 색상</label>
            <div className="flex flex-wrap gap-2">
              {FOLDER_TEXT_COLORS.map((color) => (
                <button
                  key={color.textClass}
                  type="button"
                  onClick={() => setFolderFormColor(color.textClass)}
                  className={`w-8 h-8 rounded-full ${color.bgClass} transition-transform ${
                    folderFormColor === color.textClass
                      ? 'ring-2 ring-offset-2 ring-offset-slate-800 ring-white scale-110'
                      : 'hover:scale-110 opacity-70 hover:opacity-100'
                  }`}
                  title={color.name}
                />
              ))}
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsFolderModalOpen(false)}>취소</Button>
            <Button type="submit">{editingShortcut ? "수정 완료" : "추가하기"}</Button>
          </div>
        </form>
      </Modal>

      {/* Notifications */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div >
  );
}