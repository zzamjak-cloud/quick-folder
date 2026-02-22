import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { invoke } from '@tauri-apps/api/core';
import { Category, FolderShortcut } from '../types';
import { normalizeHexColor } from './useThemeManagement';

const STORAGE_KEY = 'quickfolder_widget_data';

// 레거시 색상 매핑
export const LEGACY_TEXT_CLASS_TO_HEX: Record<string, string> = {
  'text-blue-400': '#60a5fa',
  'text-emerald-400': '#34d399',
  'text-purple-400': '#c084fc',
  'text-amber-400': '#fbbf24',
  'text-rose-400': '#fb7185',
  'text-slate-300': '#e5e7eb',
  'text-red-400': '#f87171',
  'text-orange-400': '#fb923c',
  'text-cyan-400': '#22d3ee',
  'text-violet-400': '#a78bfa',
  'text-[var(--qf-text)]': '',
};

export const LEGACY_BG_CLASS_TO_HEX: Record<string, string> = {
  'bg-blue-500': '#60a5fa',
  'bg-emerald-500': '#34d399',
  'bg-purple-500': '#c084fc',
  'bg-amber-500': '#fbbf24',
  'bg-rose-500': '#fb7185',
  'bg-slate-500': '#e5e7eb',
};

const DEFAULT_CATEGORIES: Category[] = [
  {
    id: '1',
    title: '작업 공간',
    color: '#60a5fa',
    createdAt: Date.now(),
    shortcuts: [
      { id: '101', name: '프로젝트 A', path: 'D:\\Projects\\ProjectA', createdAt: Date.now() },
      { id: '102', name: '디자인 리소스', path: 'D:\\Assets\\Design', createdAt: Date.now() },
    ]
  },
  {
    id: '2',
    title: '다운로드 & 문서',
    color: '#34d399',
    createdAt: Date.now(),
    shortcuts: [
      { id: '201', name: 'Downloads', path: 'C:\\Users\\User\\Downloads', createdAt: Date.now() },
      { id: '202', name: 'Documents', path: 'C:\\Users\\User\\Documents', createdAt: Date.now() },
    ]
  }
];

export function useCategoryManagement(addToast: (msg: string, type: 'success' | 'error' | 'info') => void) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // 카테고리 모달 상태
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catFormTitle, setCatFormTitle] = useState('');
  const [catFormColor, setCatFormColor] = useState('#60a5fa');

  // 폴더 모달 상태
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [targetCategoryId, setTargetCategoryId] = useState<string | null>(null);
  const [folderFormName, setFolderFormName] = useState('');
  const [folderFormPath, setFolderFormPath] = useState('');
  const [folderFormColor, setFolderFormColor] = useState<string>('');
  const [editingShortcut, setEditingShortcut] = useState<FolderShortcut | null>(null);

  // 데이터 로드 + 마이그레이션
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const migrateCategoryColor = (c: Record<string, unknown>) => {
          const col = c?.color;
          if (typeof col === 'string') {
            if (col.startsWith('#')) return c;
            if (col.startsWith('bg-')) return { ...c, color: LEGACY_BG_CLASS_TO_HEX[col] ?? c.color };
            if (col.startsWith('text-')) return { ...c, color: LEGACY_TEXT_CLASS_TO_HEX[col] ?? c.color };
          }
          return c;
        };

        const migrateShortcutColor = (s: Record<string, unknown>) => {
          const col = s?.color;
          if (typeof col === 'string') {
            if (col.startsWith('#')) return s;
            if (col.startsWith('text-')) {
              const mapped = LEGACY_TEXT_CLASS_TO_HEX[col];
              return { ...s, color: mapped === '' ? undefined : mapped ?? s.color };
            }
          }
          return s;
        };

        const migrated = Array.isArray(parsed)
          ? parsed.map((c: Record<string, unknown>) => {
              const mc = migrateCategoryColor(c);
              return {
                ...mc,
                shortcuts: Array.isArray(mc.shortcuts)
                  ? (mc.shortcuts as Record<string, unknown>[]).map(migrateShortcutColor)
                  : mc.shortcuts,
              };
            })
          : parsed;

        setCategories(migrated as Category[]);
      } catch (e) {
        console.error("Failed to parse saved data", e);
        setCategories(DEFAULT_CATEGORIES);
      }
    } else {
      setCategories(DEFAULT_CATEGORIES);
    }
    setIsLoaded(true);
  }, []);

  // 데이터 저장
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
    }
  }, [categories, isLoaded]);

  // --- 카테고리 관리 ---
  const openAddCategoryModal = useCallback(() => {
    setEditingCategory(null);
    setCatFormTitle('');
    setCatFormColor('#60a5fa');
    setIsCatModalOpen(true);
  }, []);

  const openEditCategoryModal = useCallback((cat: Category) => {
    setEditingCategory(cat);
    setCatFormTitle(cat.title);
    setCatFormColor(
      cat.color?.startsWith('#')
        ? cat.color
        : (LEGACY_TEXT_CLASS_TO_HEX[cat.color] ?? LEGACY_BG_CLASS_TO_HEX[cat.color] ?? '#60a5fa')
    );
    setIsCatModalOpen(true);
  }, []);

  const handleSaveCategory = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!catFormTitle.trim()) return;
    const normalizedColor = normalizeHexColor(catFormColor);
    if (!normalizedColor) {
      addToast("카테고리 색상은 #RRGGBB 형식이어야 합니다.", "error");
      return;
    }

    if (editingCategory) {
      setCategories(prev => prev.map(c =>
        c.id === editingCategory.id
          ? { ...c, title: catFormTitle, color: normalizedColor }
          : c
      ));
      addToast("카테고리가 수정되었습니다.", "success");
    } else {
      const newCat: Category = {
        id: uuidv4(),
        title: catFormTitle,
        color: normalizedColor,
        shortcuts: [],
        createdAt: Date.now()
      };
      setCategories(prev => [...prev, newCat]);
      addToast("새 카테고리가 추가되었습니다.", "success");
    }
    setIsCatModalOpen(false);
  }, [catFormTitle, catFormColor, editingCategory, addToast]);

  const deleteCategory = useCallback((id: string) => {
    if (confirm('정말로 이 카테고리를 삭제하시겠습니까? 포함된 모든 바로가기가 삭제됩니다.')) {
      setCategories(prev => prev.filter(c => c.id !== id));
      addToast("카테고리가 삭제되었습니다.", "info");
    }
  }, [addToast]);

  const toggleCollapse = useCallback((catId: string) => {
    setCategories(prev => prev.map(c =>
      c.id === catId ? { ...c, isCollapsed: !c.isCollapsed } : c
    ));
  }, []);

  // --- 폴더 관리 ---
  const openAddFolderModal = useCallback((catId: string) => {
    setTargetCategoryId(catId);
    setFolderFormName('');
    setFolderFormPath('');
    setFolderFormColor('');
    setEditingShortcut(null);
    setIsFolderModalOpen(true);
  }, []);

  const openEditFolderModal = useCallback((catId: string, shortcut: FolderShortcut) => {
    setTargetCategoryId(catId);
    setFolderFormName(shortcut.name);
    setFolderFormPath(shortcut.path);
    setFolderFormColor(
      shortcut.color?.startsWith('#')
        ? shortcut.color
        : (LEGACY_TEXT_CLASS_TO_HEX[shortcut.color ?? ''] ?? '')
    );
    setEditingShortcut(shortcut);
    setIsFolderModalOpen(true);
  }, []);

  const handleSaveFolder = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCategoryId || !folderFormName.trim() || !folderFormPath.trim()) return;
    const normalizedFolderColor = folderFormColor ? normalizeHexColor(folderFormColor) : '';
    if (folderFormColor && !normalizedFolderColor) {
      addToast("폴더 텍스트 색상은 #RRGGBB 형식이어야 합니다.", "error");
      return;
    }

    if (editingShortcut) {
      setCategories(prev => prev.map(c => {
        if (c.id === targetCategoryId) {
          return {
            ...c,
            shortcuts: c.shortcuts.map(s =>
              s.id === editingShortcut.id
                ? { ...s, name: folderFormName, path: folderFormPath.replace(/"/g, ''), color: normalizedFolderColor || undefined }
                : s
            )
          };
        }
        return c;
      }));
      addToast("바로가기가 수정되었습니다.", "success");
    } else {
      const newShortcut: FolderShortcut = {
        id: uuidv4(),
        name: folderFormName,
        path: folderFormPath.replace(/"/g, ''),
        color: normalizedFolderColor || undefined,
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
  }, [targetCategoryId, folderFormName, folderFormPath, folderFormColor, editingShortcut, addToast]);

  const handleAddFolder = useCallback(async (catId: string, path?: string, name?: string) => {
    if (path && name) {
      const newShortcut: FolderShortcut = {
        id: uuidv4(),
        name,
        path,
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
  }, [addToast]);

  const deleteShortcut = useCallback((catId: string, shortcutId: string) => {
    setCategories(prev => prev.map(c => {
      if (c.id === catId) {
        return { ...c, shortcuts: c.shortcuts.filter(s => s.id !== shortcutId) };
      }
      return c;
    }));
    addToast("바로가기가 삭제되었습니다.", "info");
  }, [addToast]);

  return {
    categories, setCategories,
    // 카테고리 모달
    isCatModalOpen, setIsCatModalOpen,
    editingCategory,
    catFormTitle, setCatFormTitle,
    catFormColor, setCatFormColor,
    openAddCategoryModal, openEditCategoryModal, handleSaveCategory,
    deleteCategory, toggleCollapse,
    // 폴더 모달
    isFolderModalOpen, setIsFolderModalOpen,
    folderFormName, setFolderFormName,
    folderFormPath, setFolderFormPath,
    folderFormColor, setFolderFormColor,
    editingShortcut,
    openAddFolderModal, openEditFolderModal, handleSaveFolder,
    handleAddFolder, deleteShortcut,
  };
}
