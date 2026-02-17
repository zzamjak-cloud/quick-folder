import React, { useState, useEffect } from 'react';
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
import { UpdateModal } from './components/UpdateModal';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow, LogicalSize, LogicalPosition, availableMonitors } from '@tauri-apps/api/window';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

// --- Types & Constants ---
const STORAGE_KEY = 'quickfolder_widget_data';
const SETTINGS_KEY = 'quickfolder_widget_settings';
const WINDOW_STATE_KEY = 'quickfolder_window_state';

type Theme = {
  id: string;
  name: string;
  bg: string; // #RRGGBB
  accent: string; // #RRGGBB
};

type ThemeVars = {
  bg: string;
  surface: string;
  surface2: string;
  surfaceHover: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentHover: string;
  accent20: string;
  accent50: string;
};

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
      className="group/item flex items-center justify-between p-2 rounded-lg transition-colors border border-transparent bg-[var(--qf-surface)] hover:bg-[var(--qf-surface-hover)] hover:border-[var(--qf-border)]"
      {...attributes}
      {...listeners}
    >
      <div
        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
        onClick={() => handleOpenFolder(shortcut.path)}
        title={`${shortcut.path} (클릭하여 열기)`}
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
          {/* Path hidden as per user feedback */}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity pl-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            openEditFolderModal(categoryId, shortcut);
          }}
          className="p-1.5 text-[var(--qf-muted)] hover:text-[var(--qf-accent)] hover:bg-[var(--qf-surface-hover)] rounded-md"
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
          className="p-1.5 text-[var(--qf-muted)] hover:text-emerald-400 hover:bg-[var(--qf-surface-hover)] rounded-md"
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
          className="p-1.5 text-[var(--qf-muted)] hover:text-red-400 hover:bg-[var(--qf-surface-hover)] rounded-md"
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

type TextColorPreset = { name: string; value: string }; // value: #RRGGBB

// 카테고리/폴더 텍스트 컬러 프리셋 (20개, 흰색 포함)
const TEXT_COLOR_PRESETS: TextColorPreset[] = [
  { name: '화이트', value: '#ffffff' },
  { name: '라이트 그레이', value: '#e5e7eb' },
  { name: '그레이', value: '#94a3b8' },
  { name: '블랙', value: '#0b0f19' },
  { name: '레드', value: '#f87171' },
  { name: '오렌지', value: '#fb923c' },
  { name: '앰버', value: '#fbbf24' },
  { name: '라임', value: '#a3e635' },
  { name: '그린', value: '#4ade80' },
  { name: '에메랄드', value: '#34d399' },
  { name: '틸', value: '#2dd4bf' },
  { name: '시안', value: '#22d3ee' },
  { name: '스카이', value: '#38bdf8' },
  { name: '블루', value: '#60a5fa' },
  { name: '인디고', value: '#818cf8' },
  { name: '바이올렛', value: '#a78bfa' },
  { name: '퍼플', value: '#c084fc' },
  { name: '핑크', value: '#fb7185' },
  { name: '로즈', value: '#f43f5e' },
  { name: '브라운', value: '#d97706' },
];

// 카테고리 색상 옵션(기존 코드 호환을 위해 이름 유지)
const COLORS = TEXT_COLOR_PRESETS;

// 폴더 텍스트 색상 옵션 (기본 + 프리셋 20)
const FOLDER_TEXT_COLORS: { name: string; value: string }[] = [
  { name: '기본(테마)', value: '' },
  ...TEXT_COLOR_PRESETS,
];

const LEGACY_TEXT_CLASS_TO_HEX: Record<string, string> = {
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
  'text-[var(--qf-text)]': '', // 기본값
};

const LEGACY_BG_CLASS_TO_HEX: Record<string, string> = {
  'bg-blue-500': '#60a5fa',
  'bg-emerald-500': '#34d399',
  'bg-purple-500': '#c084fc',
  'bg-amber-500': '#fbbf24',
  'bg-rose-500': '#fb7185',
  'bg-slate-500': '#e5e7eb',
};

// 배경 컬러 프리셋
const THEME_PRESETS: Theme[] = [
  { id: 'navy', name: '기본(네이비)', bg: '#0f172a', accent: '#3b82f6' },
  { id: 'graphite', name: '그라파이트', bg: '#0b0f19', accent: '#22c55e' },
  { id: 'slate', name: '슬레이트', bg: '#111827', accent: '#a855f7' },
  { id: 'purple', name: '다크 퍼플', bg: '#120a2a', accent: '#ec4899' },
  { id: 'forest', name: '다크 그린', bg: '#081c15', accent: '#10b981' },
  { id: 'brown', name: '다크 브라운', bg: '#1b120a', accent: '#f59e0b' },
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

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    breakInside: 'avoid' as const, // masonry 레이아웃에서 카테고리가 컬럼 사이에서 잘리지 않도록
    display: 'inline-block', // CSS columns 상단 정렬 문제 해결
    width: '100%',
    marginTop: '1.5rem', // 상단 마진 사용 (컨테이너의 음수 마진과 조합)
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
        {/* Category Header */}
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

        {/* Shortcuts List */}
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
  // --- State ---
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [columnCount, setColumnCount] = useState(1);
  const [masonryKey, setMasonryKey] = useState(0);
  const [isMasonryVisible, setIsMasonryVisible] = useState(true);
  const masonryRef = React.useRef<HTMLDivElement>(null);
  const hoveredCategoryIdRef = React.useRef<string | null>(null);

  // Settings
  const [isBgModalOpen, setIsBgModalOpen] = useState(false);
  const [themeId, setThemeId] = useState<Theme['id']>(THEME_PRESETS[0].id);
  const [customBg, setCustomBg] = useState('#0f172a');
  const [customAccent, setCustomAccent] = useState('#3b82f6');
  const [bgInputValue, setBgInputValue] = useState('#0f172a');
  const [accentInputValue, setAccentInputValue] = useState('#3b82f6');
  const [themeVars, setThemeVars] = useState<ThemeVars | null>(null);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100); // 50, 60, ... 150

  // Modals
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catFormTitle, setCatFormTitle] = useState('');
  const [catFormColor, setCatFormColor] = useState('#60a5fa');

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [targetCategoryId, setTargetCategoryId] = useState<string | null>(null);
  const [folderFormName, setFolderFormName] = useState('');
  const [folderFormPath, setFolderFormPath] = useState('');
  const [folderFormColor, setFolderFormColor] = useState<string>(''); // '' = 기본(테마)
  const [editingShortcut, setEditingShortcut] = useState<FolderShortcut | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Update
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; body: string } | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [currentAppVersion, setCurrentAppVersion] = useState('');

  // 앱 버전 가져오기
  useEffect(() => {
    getVersion().then(v => setCurrentAppVersion(v)).catch(() => setCurrentAppVersion('Unknown'));
  }, []);

  // --- Effects ---

  // 자동 업데이트 체크
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update?.available) {
          // 업데이트 정보 설정 및 모달 열기
          setUpdateInfo({
            version: update.version || 'Unknown',
            body: update.body || '새로운 버전이 출시되었습니다.',
          });
          setIsUpdateModalOpen(true);
        }
      } catch (error) {
        console.error('업데이트 확인 실패:', error);
      }
    };

    // 앱 시작 5초 후 업데이트 체크
    const timer = setTimeout(checkForUpdates, 5000);
    return () => clearTimeout(timer);
  }, []);

  // 업데이트 실행
  const handleUpdate = async () => {
    if (!updateInfo) return;

    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      const update = await check();
      if (update?.available) {
        addToast('업데이트를 다운로드하고 있습니다...', 'info');

        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              console.log('다운로드 시작:', event.data.contentLength);
              setDownloadProgress(0);
              break;
            case 'Progress':
              const { chunkLength } = event.data;
              console.log(`다운로드 중: ${chunkLength} bytes`);
              // 간단한 진행률 계산 (실제로는 total을 알아야 정확함)
              setDownloadProgress((prev) => Math.min(prev + 10, 90));
              break;
            case 'Finished':
              console.log('다운로드 완료');
              setDownloadProgress(100);
              break;
          }
        });

        addToast('업데이트가 완료되었습니다. 앱을 재시작합니다.', 'success');
        await relaunch();
      }
    } catch (error) {
      console.error('업데이트 실패:', error);
      addToast('업데이트에 실패했습니다.', 'error');
      setIsDownloading(false);
      setIsUpdateModalOpen(false);
    }
  };

  useEffect(() => {
    // Settings load (테마/줌 등)
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        const savedThemeId = typeof parsed?.themeId === 'string' ? parsed.themeId : THEME_PRESETS[0].id;
        const bg = typeof parsed?.customBg === 'string' ? parsed.customBg : '#0f172a';
        const accent = typeof parsed?.customAccent === 'string' ? parsed.customAccent : '#3b82f6';
        const z = typeof parsed?.zoomPercent === 'number' ? parsed.zoomPercent : 100;
        setThemeId(savedThemeId);
        setCustomBg(bg);
        setCustomAccent(accent);
        setBgInputValue(bg);
        setAccentInputValue(accent);
        setZoomPercent(Math.min(150, Math.max(50, Math.round(z / 10) * 10)));
      } catch (e) {
        console.error("Failed to parse saved settings", e);
      }
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const migrateCategoryColor = (c: any) => {
          const col: unknown = c?.color;
          if (typeof col === 'string') {
            if (col.startsWith('#')) return c;
            if (col.startsWith('bg-')) return { ...c, color: LEGACY_BG_CLASS_TO_HEX[col] ?? c.color };
            if (col.startsWith('text-')) return { ...c, color: LEGACY_TEXT_CLASS_TO_HEX[col] ?? c.color };
          }
          return c;
        };

        const migrateShortcutColor = (s: any) => {
          const col: unknown = s?.color;
          if (typeof col === 'string') {
            if (col.startsWith('#')) return s;
            if (col.startsWith('text-')) {
              const mapped = LEGACY_TEXT_CLASS_TO_HEX[col];
              // 기본값(테마)은 빈 문자열/undefined로 정규화
              return { ...s, color: mapped === '' ? undefined : mapped ?? s.color };
            }
          }
          return s;
        };

        const migrated = Array.isArray(parsed)
          ? parsed.map((c: any) => {
              const mc = migrateCategoryColor(c);
              return {
                ...mc,
                shortcuts: Array.isArray(mc.shortcuts) ? mc.shortcuts.map(migrateShortcutColor) : mc.shortcuts,
              };
            })
          : parsed;

        setCategories(migrated);
      } catch (e) {
        console.error("Failed to parse saved data", e);
        setCategories(DEFAULT_CATEGORIES);
      }
    } else {
      setCategories(DEFAULT_CATEGORIES);
    }
    setIsLoaded(true);
  }, []);

  // 창 크기/위치 저장 및 복원
  useEffect(() => {
    let unlistenResize: (() => void) | undefined;
    let unlistenMove: (() => void) | undefined;
    let saveTimeout: ReturnType<typeof setTimeout> | undefined;
    let isMounted = true;

    const saveWindowState = async () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        if (!isMounted) return;
        try {
          const appWindow = getCurrentWindow();
          const size = await appWindow.innerSize();
          const position = await appWindow.outerPosition();
          const scaleFactor = await appWindow.scaleFactor();

          // 논리적 크기로 변환하여 저장 (DPI 스케일링 고려)
          const state = {
            width: Math.round(size.width / scaleFactor),
            height: Math.round(size.height / scaleFactor),
            x: Math.round(position.x / scaleFactor),
            y: Math.round(position.y / scaleFactor),
          };
          localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify(state));
        } catch (e) {
          console.error('Failed to save window state', e);
        }
      }, 500);
    };

    const isPositionOnScreen = async (x: number, y: number, width: number, height: number): Promise<boolean> => {
      try {
        const monitors = await availableMonitors();
        if (monitors.length === 0) return true; // 모니터 정보 없으면 허용

        // 창의 일부라도 어떤 모니터에 보이는지 확인
        const windowRight = x + width;
        const windowBottom = y + height;

        for (const monitor of monitors) {
          const monitorX = monitor.position.x;
          const monitorY = monitor.position.y;
          const monitorRight = monitorX + monitor.size.width;
          const monitorBottom = monitorY + monitor.size.height;

          // 창이 이 모니터와 겹치는지 확인 (최소 100px는 보여야 함)
          const overlapX = Math.min(windowRight, monitorRight) - Math.max(x, monitorX);
          const overlapY = Math.min(windowBottom, monitorBottom) - Math.max(y, monitorY);

          if (overlapX >= 100 && overlapY >= 50) {
            return true;
          }
        }
        return false;
      } catch (e) {
        console.error('Failed to check monitor bounds', e);
        return true; // 에러 시 허용
      }
    };

    const setupWindowState = async () => {
      const appWindow = getCurrentWindow();

      // 앱 창이 완전히 준비될 때까지 대기
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!isMounted) return;

      // 저장된 창 상태 복원
      const savedState = localStorage.getItem(WINDOW_STATE_KEY);
      if (savedState) {
        try {
          const { width, height, x, y } = JSON.parse(savedState);

          // 유효한 크기인지 확인 (최소 크기)
          const validWidth = width && width >= 400 ? width : 800;
          const validHeight = height && height >= 300 ? height : 600;

          // 크기 먼저 설정
          await appWindow.setSize(new LogicalSize(validWidth, validHeight));

          // 위치가 유효한지 확인 (듀얼 모니터 대응)
          if (typeof x === 'number' && typeof y === 'number') {
            const isOnScreen = await isPositionOnScreen(x, y, validWidth, validHeight);
            if (isOnScreen) {
              await appWindow.setPosition(new LogicalPosition(x, y));
            } else {
              // 화면 밖이면 중앙으로 이동
              await appWindow.center();
            }
          }
        } catch (e) {
          console.error('Failed to restore window state', e);
        }
      }

      // 창 크기/위치 변경 시 저장 (디바운스 적용)
      unlistenResize = await appWindow.onResized(saveWindowState);
      unlistenMove = await appWindow.onMoved(saveWindowState);
    };

    setupWindowState();

    return () => {
      isMounted = false;
      if (unlistenResize) unlistenResize();
      if (unlistenMove) unlistenMove();
      if (saveTimeout) clearTimeout(saveTimeout);
    };
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
    }
  }, [categories, isLoaded]);

  useEffect(() => {
    // settings persist
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        themeId,
        customBg,
        customAccent,
        zoomPercent,
      })
    );
  }, [themeId, customBg, customAccent, zoomPercent]);

  const normalizeHexColor = (value: string) => {
    const v = value.trim();
    if (/^#([0-9a-fA-F]{6})$/.test(v)) return v.toLowerCase();
    return null;
  };

  const hexToRgb = (hex: string) => {
    const normalized = normalizeHexColor(hex);
    if (!normalized) return null;
    const h = normalized.slice(1);
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
  };

  const rgbToHex = (r: number, g: number, b: number) => {
    const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
    const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const mix = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) => {
    const lerp = (x: number, y: number) => x + (y - x) * t;
    return {
      r: lerp(a.r, b.r),
      g: lerp(a.g, b.g),
      b: lerp(a.b, b.b),
    };
  };

  const relativeLuminance = (rgb: { r: number; g: number; b: number }) => {
    const srgb = [rgb.r, rgb.g, rgb.b].map(v => v / 255);
    const lin = srgb.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };

  const computeThemeVars = (bgHex: string, accentHex: string): ThemeVars | null => {
    const bgRgb = hexToRgb(bgHex);
    const accentRgb = hexToRgb(accentHex);
    if (!bgRgb || !accentRgb) return null;

    // 기본은 다크 테마를 가정하되, bg가 밝으면 텍스트를 다크로 전환
    const isDark = relativeLuminance(bgRgb) < 0.35;
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    const toward = isDark ? white : black;

    const mSurface = mix(bgRgb, toward, isDark ? 0.06 : 0.10);
    const mSurface2 = mix(bgRgb, toward, isDark ? 0.10 : 0.16);
    const mSurfaceHover = mix(bgRgb, toward, isDark ? 0.14 : 0.20);
    const mBorder = mix(bgRgb, toward, isDark ? 0.18 : 0.25);

    const surface = rgbToHex(mSurface.r, mSurface.g, mSurface.b);
    const surface2 = rgbToHex(mSurface2.r, mSurface2.g, mSurface2.b);
    const surfaceHover = rgbToHex(mSurfaceHover.r, mSurfaceHover.g, mSurfaceHover.b);
    const border = rgbToHex(mBorder.r, mBorder.g, mBorder.b);

    const text = isDark ? '#e5e7eb' : '#0f172a';
    const muted = isDark ? '#94a3b8' : '#475569';

    const accent20 = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.20)`;
    const accent50 = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.50)`;
    const accentHoverRgb = mix(accentRgb, isDark ? white : black, isDark ? 0.10 : 0.12);
    const accentHover = rgbToHex(accentHoverRgb.r, accentHoverRgb.g, accentHoverRgb.b);

    return {
      bg: bgHex,
      surface,
      surface2,
      surfaceHover,
      border,
      text,
      muted,
      accent: accentHex,
      accentHover,
      accent20,
      accent50,
    };
  };

  useEffect(() => {
    const preset = THEME_PRESETS.find(t => t.id === themeId) ?? THEME_PRESETS[0];
    const bg = themeId === 'custom' ? customBg : preset.bg;
    const accent = themeId === 'custom' ? customAccent : preset.accent;
    const vars = computeThemeVars(bg, accent);
    setThemeVars(vars);
  }, [themeId, customBg, customAccent]);

  const zoomScale = zoomPercent / 100;

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
    setCatFormColor('#60a5fa');
    setIsCatModalOpen(true);
  };

  const openEditCategoryModal = (cat: Category) => {
    setEditingCategory(cat);
    setCatFormTitle(cat.title);
    setCatFormColor(
      cat.color?.startsWith('#')
        ? cat.color
        : (LEGACY_TEXT_CLASS_TO_HEX[cat.color] ?? LEGACY_BG_CLASS_TO_HEX[cat.color] ?? '#60a5fa')
    );
    setIsCatModalOpen(true);
  };

  const handleSaveCategory = (e: React.FormEvent) => {
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
    setFolderFormColor('');
    setEditingShortcut(null);
    setIsFolderModalOpen(true);
  };

  const openEditFolderModal = (catId: string, shortcut: FolderShortcut) => {
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
  };

  const handleSaveFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCategoryId || !folderFormName.trim() || !folderFormPath.trim()) return;
    const normalizedFolderColor = folderFormColor ? normalizeHexColor(folderFormColor) : '';
    if (folderFormColor && !normalizedFolderColor) {
      addToast("폴더 텍스트 색상은 #RRGGBB 형식이어야 합니다.", "error");
      return;
    }

    if (editingShortcut) {
      // 수정 모드
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
      // 추가 모드
      const newShortcut: FolderShortcut = {
        id: uuidv4(),
        name: folderFormName,
        path: folderFormPath.replace(/"/g, ''), // Clean up common copy-paste artifacts
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

  const applyCustomTheme = (bgValue: string, accentValue: string) => {
    const bg = normalizeHexColor(bgValue);
    const accent = normalizeHexColor(accentValue);
    if (!bg || !accent) {
      addToast("색상 값은 #RRGGBB 형식이어야 합니다.", "error");
      return;
    }
    setThemeId('custom');
    setCustomBg(bg);
    setCustomAccent(accent);
    setBgInputValue(bg);
    setAccentInputValue(accent);
    addToast("테마가 적용되었습니다.", "success");
  };

  return (
    <div
      className="min-h-screen p-6 sm:p-10 text-[var(--qf-text)]"
      style={{
        backgroundColor: themeVars?.bg ?? '#0f172a',
        // CSS 변수로 전체 톤을 일관되게 적용
        ['--qf-bg' as any]: themeVars?.bg ?? '#0f172a',
        ['--qf-surface' as any]: themeVars?.surface ?? '#111827',
        ['--qf-surface-2' as any]: themeVars?.surface2 ?? '#1f2937',
        ['--qf-surface-hover' as any]: themeVars?.surfaceHover ?? '#334155',
        ['--qf-border' as any]: themeVars?.border ?? '#334155',
        ['--qf-text' as any]: themeVars?.text ?? '#e5e7eb',
        ['--qf-muted' as any]: themeVars?.muted ?? '#94a3b8',
        ['--qf-accent' as any]: themeVars?.accent ?? '#3b82f6',
        ['--qf-accent-hover' as any]: themeVars?.accentHover ?? '#60a5fa',
        ['--qf-accent-20' as any]: themeVars?.accent20 ?? 'rgba(59,130,246,0.20)',
        ['--qf-accent-50' as any]: themeVars?.accent50 ?? 'rgba(59,130,246,0.50)',
      }}
    >
      {/* Toolbar: [검색][돋보기(줌)][팔레트][+] */}
      <div className="max-w-7xl mx-auto mb-6 flex items-center gap-2">
        <input
          type="text"
          placeholder="검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-[var(--qf-surface)] border border-[var(--qf-border)] text-[var(--qf-text)] rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--qf-accent)] w-full max-w-[520px] transition-all placeholder:text-[var(--qf-muted)]"
        />

        <button
          type="button"
          onClick={() => setIsZoomModalOpen(true)}
          className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors"
          title="확대/축소"
          aria-label="확대/축소"
        >
          <ZoomIn size={18} />
        </button>

        <button
          type="button"
          onClick={() => setIsBgModalOpen(true)}
          className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors"
          title="테마 설정"
          aria-label="테마 설정"
        >
          <Palette size={18} />
        </button>

        <button
          type="button"
          onClick={openAddCategoryModal}
          className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors"
          title="카테고리 추가"
          aria-label="카테고리 추가"
        >
          <Plus size={18} />
        </button>
      </div>

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
          {/* Zoom wrapper (전체 표시 크기 조절) */}
          <div
            style={{
              transform: `scale(${zoomScale})`,
              transformOrigin: 'top left',
              width: `${100 / zoomScale}%`,
            }}
          >
          <SortableContext
            items={filteredCategories.map(c => c.id)}
            strategy={rectSortingStrategy}
          >
            {/* CSS Columns 기반 Masonry 레이아웃: 카테고리가 컬럼 순서대로 쌓여 공간 낭비 최소화 */}
            {isMasonryVisible && (
              <div
                ref={masonryRef}
                key={`masonry-${columnCount}-${masonryKey}`}
                style={{
                  columnCount: columnCount,
                  columnGap: '1.5rem',
                  width: '100%',
                  marginTop: '-1.5rem', // 첫 번째 행의 상단 마진 상쇄
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
              <div className="flex flex-col items-center justify-center py-20 text-[var(--qf-muted)]" style={{ breakInside: 'avoid' }}>
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
          </div>
        </main >
        <DragOverlay>
          {activeId ? (() => {
            // Check if activeId is a category
            const activeCategory = categories.find(c => c.id === activeId);

            if (activeCategory) {
              // Dragging a category
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
              // Dragging a shortcut
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
      </DndContext >

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
                    setThemeId(t.id);
                    setBgInputValue(t.bg);
                    setAccentInputValue(t.accent);
                  }}
                  className={`flex items-center gap-2 p-2 rounded-lg border transition-colors bg-[var(--qf-surface)] hover:bg-[var(--qf-surface-hover)] border-[var(--qf-border)] ${themeId === t.id ? 'ring-2 ring-[var(--qf-accent)]' : ''}`}
                  title={`${t.bg} / ${t.accent}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-5 h-5 rounded-md border border-white/10"
                      style={{ backgroundColor: t.bg }}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-white/10"
                      style={{ backgroundColor: t.accent }}
                    />
                  </span>
                  <span className="text-xs text-[var(--qf-text)] truncate">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-[var(--qf-muted)] mb-2">커스텀 (배경 + 강조색)</div>
            <div className="flex items-center gap-3 mb-3">
              <input
                type="color"
                value={normalizeHexColor(bgInputValue) ?? customBg}
                onChange={(e) => {
                  setBgInputValue(e.target.value);
                }}
                className="h-10 w-12 rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface-2)] p-1"
                aria-label="배경색 선택"
              />
              <input
                type="text"
                value={bgInputValue}
                onChange={(e) => setBgInputValue(e.target.value)}
                placeholder="#0f172a"
                className="flex-1 bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={normalizeHexColor(accentInputValue) ?? customAccent}
                onChange={(e) => {
                  setAccentInputValue(e.target.value);
                }}
                className="h-10 w-12 rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface-2)] p-1"
                aria-label="강조색 선택"
              />
              <input
                type="text"
                value={accentInputValue}
                onChange={(e) => setAccentInputValue(e.target.value)}
                placeholder="#3b82f6"
                className="flex-1 bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs"
              />
              <Button type="button" variant="secondary" onClick={() => applyCustomTheme(bgInputValue, accentInputValue)}>
                적용
              </Button>
            </div>
            <div className="text-[11px] text-[var(--qf-muted)] mt-2">
              * `#RRGGBB` 형식만 지원합니다.
            </div>
          </div>

          <div className="pt-2 flex justify-between items-center">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setThemeId(THEME_PRESETS[0].id);
                setBgInputValue(THEME_PRESETS[0].bg);
                setAccentInputValue(THEME_PRESETS[0].accent);
              }}
            >
              기본값으로
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsBgModalOpen(false)}>
                닫기
              </Button>
            </div>
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
            <div className="text-sm font-semibold text-[var(--qf-text)]">{zoomPercent}%</div>
          </div>

          <input
            type="range"
            min={50}
            max={150}
            step={10}
            value={zoomPercent}
            onChange={(e) => setZoomPercent(Number(e.target.value))}
            className="w-full"
            aria-label="확대/축소 슬라이더"
          />

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setZoomPercent((p) => Math.max(50, p - 10))}
            >
              －
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setZoomPercent(100)}
            >
              100%로
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setZoomPercent((p) => Math.min(150, p + 10))}
            >
              ＋
            </Button>
          </div>
        </div>
      </Modal>

      {/* Category Modal */}
      <Modal
        isOpen={isCatModalOpen}
        onClose={() => setIsCatModalOpen(false)}
        title={editingCategory ? "카테고리 수정" : "새 카테고리 추가"}
      >
        <form onSubmit={handleSaveCategory} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--qf-muted)] mb-1">카테고리 이름</label>
            <input
              type="text"
              required
              value={catFormTitle}
              onChange={(e) => setCatFormTitle(e.target.value)}
              className="w-full bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none"
              placeholder="예: 업무용, 개인용..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--qf-muted)] mb-2">색상 태그</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setCatFormColor(color.value)}
                  className={`w-8 h-8 rounded-full transition-transform ${catFormColor === color.value
                    ? 'ring-2 ring-offset-2 ring-offset-[var(--qf-surface)] ring-white scale-110'
                    : 'hover:scale-110 opacity-70 hover:opacity-100'
                    }`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                />
              ))}
            </div>
            {/* Custom color */}
            <div className="mt-3 flex items-center gap-3">
              <input
                type="color"
                value={normalizeHexColor(catFormColor) ?? '#60a5fa'}
                onChange={(e) => setCatFormColor(e.target.value)}
                className="h-10 w-12 rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface-2)] p-1"
                aria-label="카테고리 텍스트 커스텀 컬러 선택"
              />
              <input
                type="text"
                value={catFormColor}
                onChange={(e) => setCatFormColor(e.target.value)}
                placeholder="#60a5fa"
                className="flex-1 bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const v = normalizeHexColor(catFormColor);
                  if (v) setCatFormColor(v);
                  else addToast("색상 값은 #RRGGBB 형식이어야 합니다.", "error");
                }}
              >
                적용
              </Button>
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
            <label className="block text-sm font-medium text-[var(--qf-muted)] mb-1">바로가기 이름</label>
            <input
              type="text"
              required
              value={folderFormName}
              onChange={(e) => setFolderFormName(e.target.value)}
              className="w-full bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none"
              placeholder="예: 프로젝트 문서"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--qf-muted)] mb-1">폴더 경로</label>
            <div className="relative">
              <input
                type="text"
                required
                value={folderFormPath}
                onChange={(e) => setFolderFormPath(e.target.value)}
                className="w-full bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg pl-3 pr-10 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs"
                placeholder="C:\Users\Name\Documents..."
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-[var(--qf-muted)]">
                <Folder size={14} />
              </div>
            </div>
            <p className="text-xs text-[var(--qf-muted)] mt-1">
              * 탐색기 주소창의 경로를 복사해서 붙여넣으세요.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--qf-muted)] mb-2">텍스트 색상</label>
            <div className="flex flex-wrap gap-2">
              {FOLDER_TEXT_COLORS.map((color) => (
                <button
                  key={color.value || color.name}
                  type="button"
                  onClick={() => setFolderFormColor(color.value)}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    folderFormColor === color.value
                      ? 'ring-2 ring-offset-2 ring-offset-[var(--qf-surface)] ring-white scale-110'
                      : 'hover:scale-110 opacity-70 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: color.value || (themeVars?.text ?? '#e5e7eb'),
                    border: color.value ? undefined : '1px solid rgba(255,255,255,0.18)',
                  }}
                  title={color.name}
                />
              ))}
            </div>
            {/* Custom color */}
            <div className="mt-3 flex items-center gap-3">
              <input
                type="color"
                value={normalizeHexColor(folderFormColor) ?? '#ffffff'}
                onChange={(e) => setFolderFormColor(e.target.value)}
                className="h-10 w-12 rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface-2)] p-1"
                aria-label="폴더 텍스트 커스텀 컬러 선택"
              />
              <input
                type="text"
                value={folderFormColor}
                onChange={(e) => setFolderFormColor(e.target.value)}
                placeholder="#ffffff"
                className="flex-1 bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!folderFormColor) return; // 기본(테마)
                  const v = normalizeHexColor(folderFormColor);
                  if (v) setFolderFormColor(v);
                  else addToast("색상 값은 #RRGGBB 형식이어야 합니다.", "error");
                }}
              >
                적용
              </Button>
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsFolderModalOpen(false)}>취소</Button>
            <Button type="submit">{editingShortcut ? "수정 완료" : "추가하기"}</Button>
          </div>
        </form>
      </Modal>

      {/* Update Modal */}
      {updateInfo && (
        <UpdateModal
          isOpen={isUpdateModalOpen}
          onClose={() => setIsUpdateModalOpen(false)}
          onUpdate={handleUpdate}
          version={updateInfo.version}
          currentVersion={currentAppVersion}
          releaseNotes={updateInfo.body}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
        />
      )}

      {/* Notifications */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div >
  );
}