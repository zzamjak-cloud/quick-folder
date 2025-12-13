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
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { v4 as uuidv4 } from 'uuid';
import { Category, FolderShortcut, ToastMessage } from './types';
import { Button } from './components/ui/Button';
import { Modal } from './components/ui/Modal';
import { ToastContainer } from './components/ToastContainer';

// --- Types & Constants ---
const STORAGE_KEY = 'quickfolder_widget_data';

// --- Sortable Item Component ---
interface SortableShortcutItemProps {
  shortcut: FolderShortcut;
  categoryId: string;
  handleOpenFolder: (path: string) => void;
  handleCopyPath: (path: string) => void;
  deleteShortcut: (catId: string, sId: string) => void;
  key?: React.Key;
}

function SortableShortcutItem({ shortcut, categoryId, handleOpenFolder, handleCopyPath, deleteShortcut }: SortableShortcutItemProps) {
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
          <div className="text-sm font-medium text-slate-200 group-hover/item:text-white truncate">
            {shortcut.name}
          </div>
          {/* Path hidden as per user feedback */}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity pl-2">
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
  { name: 'Rose', value: 'bg-rose-500' },
  { name: 'Slate', value: 'bg-slate-500' },
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
  searchQuery
}: CategoryColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: category.id,
    data: {
      type: 'Container',
      categoryId: category.id
    }
  });

  const isExpanded = !category.isCollapsed || searchQuery.length > 0;

  const handleNativeDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if files are being dropped
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];

      let path: string | undefined;

      if (window.electron) {
        try {
          path = window.electron.getPathForFile(file);
        } catch (err) {
          console.error("Failed to get path for file:", err);
        }
      } else {
        // Fallback or dev mode (mostly won't work for real OS drop without Electron)
        // @ts-ignore
        path = file.path;
      }

      if (path) {
        // It's likely a folder or file.
        // For now, we assume it's a folder or we add it anyway.
        handleAddFolder(category.id, path, file.name);
      }
    }
  };

  const handleNativeDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
  };

  return (
    <SortableContext
      id={category.id}
      items={category.shortcuts.map(s => s.id)}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        className={`bg-slate-800/50 border rounded-2xl overflow-hidden backdrop-blur-sm transition-colors group flex flex-col break-inside-avoid mb-6 ${isOver ? 'border-blue-500/50 bg-slate-800/80' : 'border-slate-700/50 hover:border-slate-600'}`}
        onDragOver={handleNativeDragOver}
        onDrop={handleNativeDrop}
      >
        {/* Category Header */}
        <div className="p-3 border-b border-slate-700/50 flex items-center justify-between bg-slate-800/80">
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

  // Modals
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catFormTitle, setCatFormTitle] = useState('');
  const [catFormColor, setCatFormColor] = useState(COLORS[0].value);

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [targetCategoryId, setTargetCategoryId] = useState<string | null>(null);
  const [folderFormName, setFolderFormName] = useState('');
  const [folderFormPath, setFolderFormPath] = useState('');

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
    setIsFolderModalOpen(true);
  };

  const handleSaveFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCategoryId || !folderFormName.trim() || !folderFormPath.trim()) return;

    const newShortcut: FolderShortcut = {
      id: uuidv4(),
      name: folderFormName,
      path: folderFormPath.replace(/"/g, ''), // Clean up common copy-paste artifacts
      createdAt: Date.now()
    };

    setCategories(prev => prev.map(c => {
      if (c.id === targetCategoryId) {
        return { ...c, shortcuts: [...c.shortcuts, newShortcut] };
      }
      return c;
    }));

    addToast("바로가기가 추가되었습니다.", "success");
    setIsFolderModalOpen(false);
  };

  const handleAddFolder = async (catId: string, path?: string, name?: string) => {
    if (path && name) {
      // Direct add (e.g., from Drop)
      const newShortcut: FolderShortcut = {
        id: uuidv4(),
        name: name,
        path: path,
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

    if (window.electron) {
      try {
        const result = await window.electron.selectFolder();
        if (!result.canceled && result.path && result.name) {
          const newShortcut: FolderShortcut = {
            id: uuidv4(),
            name: result.name,
            path: result.path,
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
    } else {
      // Fallback for web: open manual modal
      setTargetCategoryId(catId);
      setFolderFormName('');
      setFolderFormPath('');
      setIsFolderModalOpen(true);
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
    if (window.electron) {
      const { success, error } = await window.electron.copyPath(path);
      if (success) {
        addToast("경로가 클립보드에 복사되었습니다!", "success");
      } else {
        console.error(error);
        addToast("복사에 실패했습니다.", "error");
      }
    } else {
      // Fallback for browser mode (dev without electron)
      navigator.clipboard.writeText(path).then(() => {
        addToast("경로가 클립보드에 복사되었습니다!", "success");
      }).catch(() => {
        addToast("복사에 실패했습니다.", "error");
      });
    }
  };

  const handleOpenFolder = async (path: string) => {
    if (window.electron) {
      const { success, error } = await window.electron.openFolder(path);
      if (!success) {
        console.error(error);
        addToast("폴더를 열 수 없습니다.", "error");
      }
    } else {
      addToast("브라우저에서는 폴더를 열 수 없습니다.", "info");
      console.log("Open folder:", path);
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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

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
    const activeSectionId = active.data.current?.categoryId;
    const overSectionId = over?.data.current?.categoryId || over?.id;

    if (activeSectionId && overSectionId && activeSectionId === overSectionId) {
      // Same container reorder
      const categoryIndex = categories.findIndex((c) => c.id === activeSectionId);
      const activeItemIndex = categories[categoryIndex].shortcuts.findIndex((s) => s.id === active.id);
      const overItemIndex = categories[categoryIndex].shortcuts.findIndex((s) => s.id === over?.id);

      if (activeItemIndex !== overItemIndex) {
        setCategories((prev) => {
          const updated = [...prev];
          updated[categoryIndex].shortcuts = arrayMove(updated[categoryIndex].shortcuts, activeItemIndex, overItemIndex);
          return updated;
        });
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
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <main className="max-w-7xl mx-auto">
          <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6">
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
                searchQuery={searchQuery}
              />
            ))}

            {/* Empty State Helper */}
            {filteredCategories.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-500">
                <Search size={48} className="mb-4 opacity-50" />
                <p className="text-lg font-medium">검색 결과가 없거나 등록된 카테고리가 없습니다.</p>
                <Button onClick={openAddCategoryModal} className="mt-4" variant="secondary">
                  새 카테고리 만들기
                </Button>
              </div>
            )}
          </div>
        </main >
        <DragOverlay>
          {activeId ? (
            <div className="bg-slate-700 p-2 rounded-lg shadow-xl border border-blue-500/50 flex items-center gap-3">
              <div className="p-1.5 rounded-md bg-slate-800 text-blue-400">
                <Folder size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">Moving...</div>
              </div>
            </div>
          ) : null}
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
        title="폴더 바로가기 추가"
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
          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsFolderModalOpen(false)}>취소</Button>
            <Button type="submit">추가하기</Button>
          </div>
        </form>
      </Modal>

      {/* Notifications */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div >
  );
}