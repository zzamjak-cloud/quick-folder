import React from 'react';
import { createPortal } from 'react-dom';
import { Plus, Settings, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { Category, FolderShortcut } from '../types';
import {
  LEGACY_TEXT_CLASS_TO_HEX,
  LEGACY_BG_CLASS_TO_HEX,
} from '../hooks/useCategoryManagement';
import { adjustColorForTheme, COLORS, normalizeHexColor } from '../hooks/useThemeManagement';
import { SortableShortcutItem } from './SortableShortcutItem';

// 드롭 인디케이터 타입
export type DropIndicator = {
  type: 'category';
  index: number;       // 이 인덱스 앞에 라인 표시
} | {
  type: 'shortcut';
  categoryId: string;  // 대상 카테고리
  index: number;       // 이 인덱스 앞에 라인 표시
};

export interface CategoryColumnProps {
  category: Category;
  categoryIndex: number;
  toggleCollapse: (id: string) => void;
  toggleCollapseAll: () => void;
  handleAddFolder: (catId: string, path?: string, name?: string) => void;
  openEditCategoryModal: (cat: Category) => void;
  updateCategory: (id: string, patch: Partial<Pick<Category, 'title' | 'color'>>) => void;
  deleteCategory: (id: string) => void;
  handleOpenFolder: (path: string) => void;
  handleOpenInNewTab: (path: string) => void;
  handleCopyPath: (path: string) => void;
  deleteShortcut: (catId: string, sId: string) => void;
  openEditFolderModal: (catId: string, shortcut: FolderShortcut) => void;
  isDark: boolean;
  dropIndicator: DropIndicator | null;
}

export function CategoryColumn({
  category,
  categoryIndex,
  toggleCollapse,
  toggleCollapseAll,
  handleAddFolder,
  updateCategory,
  deleteCategory,
  handleOpenFolder,
  handleOpenInNewTab,
  handleCopyPath,
  deleteShortcut,
  openEditFolderModal,
  isDark,
  dropIndicator,
}: CategoryColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({
    id: category.id,
    data: {
      type: 'Category',
      category,
      categoryId: category.id
    }
  });

  const isExpanded = !category.isCollapsed;

  // 설정 팝업 위치 (null이면 닫힘)
  const [menuPos, setMenuPos] = React.useState<{ x: number; y: number } | null>(null);

  // 편집용 현재 색상(hex). 레거시 클래스도 hex로 변환
  const currentColorHex = category.color?.startsWith('#')
    ? category.color
    : (LEGACY_TEXT_CLASS_TO_HEX[category.color] ?? LEGACY_BG_CLASS_TO_HEX[category.color] ?? '#60a5fa');

  const openMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPos({ x: rect.right, y: rect.bottom + 4 });
  };

  const style: React.CSSProperties = {
    opacity: isDragging ? 0.5 : 1,
    breakInside: 'avoid' as const,
    display: 'inline-block',
    width: '100%',
    marginTop: isExpanded ? '0.75rem' : '0.25rem',
  };

  // 카테고리 드롭 인디케이터: 이 카테고리 앞에 라인 표시
  const showCategoryIndicator = dropIndicator?.type === 'category' && dropIndicator.index === categoryIndex;
  const rawCategoryHex =
    category.color?.startsWith('#')
      ? category.color
      : (category.color && (LEGACY_TEXT_CLASS_TO_HEX[category.color] || LEGACY_BG_CLASS_TO_HEX[category.color])) || '';
  const categoryTitleHex = rawCategoryHex ? adjustColorForTheme(rawCategoryHex, isDark) : '';

  // 즐겨찾기 드롭 인디케이터: 이 카테고리의 어떤 인덱스 앞에 라인 표시
  const shortcutIndicatorIndex = dropIndicator?.type === 'shortcut' && dropIndicator.categoryId === category.id
    ? dropIndicator.index : -1;

  return (
    <SortableContext
      id={category.id}
      items={isExpanded ? category.shortcuts.map(s => s.id) : []}
      strategy={verticalListSortingStrategy}
    >
      {/* 카테고리 드롭 인디케이터 (세션 사이 파란색 라인) */}
      {showCategoryIndicator && (
        <div style={{ breakInside: 'avoid', display: 'inline-block', width: '100%', marginTop: '0.75rem' }}>
          <div className="h-[2px] rounded-full bg-[var(--qf-accent)] mx-1" />
        </div>
      )}
      <div
        ref={setNodeRef}
        style={style}
        data-category-id={category.id}
        className={`overflow-hidden transition-all group flex flex-col w-full ${
          isExpanded
            ? `border rounded-2xl backdrop-blur-sm bg-[var(--qf-surface)] border-[var(--qf-border)] hover:border-[var(--qf-border)]`
            : `border border-transparent rounded-xl opacity-60 hover:opacity-80`
        } ${isDragging ? 'shadow-2xl shadow-[var(--qf-accent-20)]' : ''}`}
      >
        <div
          className={`px-2.5 py-1.5 flex items-center justify-between ${
            isExpanded
              ? `border-b bg-[var(--qf-surface-2)] border-[var(--qf-border)]`
              : ``
          } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          {...attributes}
          {...listeners}
        >
          <div
            className="flex items-center gap-2 cursor-pointer select-none"
            onClick={(e) => e.altKey ? toggleCollapseAll() : toggleCollapse(category.id)}
          >
            {isExpanded ? <ChevronDown size={14} className="text-[var(--qf-muted)]" /> : <ChevronRight size={14} className="text-[var(--qf-muted)]" />}
            <h2
              className="text-sm font-medium truncate max-w-[140px]"
              style={{ color: categoryTitleHex || undefined }}
              title={category.title}
            >
              {category.title}
            </h2>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={openMenu}
              className="p-1.5 text-[var(--qf-muted)] hover:text-[var(--qf-text)] hover:bg-[var(--qf-surface-hover)] rounded-md transition-colors"
              title="설정"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="p-2 flex-1">
            {category.shortcuts.length === 0 ? (
              <div className="text-center py-3 text-[var(--qf-muted)] text-xs italic">
                등록된 폴더가 없습니다
                <br />
                <span className="text-[10px] opacity-70 mt-1 block">폴더를 이곳으로 드래그하세요</span>
              </div>
            ) : (
              <ul className="space-y-1 min-h-[50px]">
                {category.shortcuts.map((shortcut, idx) => (
                  <SortableShortcutItem
                    key={shortcut.id}
                    shortcut={shortcut}
                    categoryId={category.id}
                    handleOpenFolder={handleOpenFolder}
                    handleOpenInNewTab={handleOpenInNewTab}
                    isDark={isDark}
                    handleCopyPath={handleCopyPath}
                    deleteShortcut={deleteShortcut}
                    openEditFolderModal={openEditFolderModal}
                    showIndicatorBefore={shortcutIndicatorIndex === idx}
                  />
                ))}
                {/* 마지막 위치 인디케이터 */}
                {shortcutIndicatorIndex === category.shortcuts.length && (
                  <li className="list-none py-[1px]">
                    <div className="h-[2px] rounded-full bg-[var(--qf-accent)]" />
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>

      {menuPos && (
        <CategorySettingsPopup
          pos={menuPos}
          title={category.title}
          colorHex={currentColorHex}
          onTitleChange={(title) => updateCategory(category.id, { title })}
          onColorChange={(color) => updateCategory(category.id, { color })}
          onAddFolder={() => { handleAddFolder(category.id); setMenuPos(null); }}
          onDelete={() => { deleteCategory(category.id); setMenuPos(null); }}
          onClose={() => setMenuPos(null)}
        />
      )}
    </SortableContext>
  );
}

// 섹션 설정 인라인 팝업 (제목 변경 + 컬러 프리셋 + 폴더 추가/삭제)
function CategorySettingsPopup({
  pos,
  title,
  colorHex,
  onTitleChange,
  onColorChange,
  onAddFolder,
  onDelete,
  onClose,
}: {
  pos: { x: number; y: number };
  title: string;
  colorHex: string;
  onTitleChange: (title: string) => void;
  onColorChange: (color: string) => void;
  onAddFolder: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [adjusted, setAdjusted] = React.useState(pos);
  const [titleDraft, setTitleDraft] = React.useState(title);
  const [colorDraft, setColorDraft] = React.useState(colorHex);

  // 화면 밖으로 나가지 않도록 위치 보정
  React.useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setAdjusted({
      x: pos.x + rect.width > vw ? Math.max(8, vw - rect.width - 8) : pos.x,
      y: pos.y + rect.height > vh ? Math.max(8, vh - rect.height - 8) : pos.y,
    });
  }, [pos]);

  // 외부 클릭·ESC로 닫기
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const commitTitle = () => {
    const v = titleDraft.trim();
    if (v && v !== title) onTitleChange(v);
  };

  const applyCustomColor = () => {
    const v = normalizeHexColor(colorDraft);
    if (v) { setColorDraft(v); onColorChange(v); }
  };

  const portalRoot = document.getElementById('qf-root') ?? document.body;

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] rounded-lg shadow-2xl p-3"
      style={{
        left: adjusted.x,
        top: adjusted.y,
        width: 260,
        backgroundColor: 'var(--qf-surface-2)',
        border: '1px solid var(--qf-border)',
      }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* 제목 변경 */}
      <label className="block text-[11px] font-medium text-[var(--qf-muted)] mb-1">제목</label>
      <input
        type="text"
        value={titleDraft}
        onChange={(e) => setTitleDraft(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => { if (e.key === 'Enter') { commitTitle(); (e.target as HTMLInputElement).blur(); } }}
        className="w-full bg-[var(--qf-surface)] border border-[var(--qf-border)] rounded-md px-2 py-1.5 text-xs text-[var(--qf-text)] outline-none focus:ring-1 focus:ring-[var(--qf-accent)]"
        placeholder="카테고리 이름"
      />

      {/* 컬러 프리셋 */}
      <label className="block text-[11px] font-medium text-[var(--qf-muted)] mt-3 mb-1.5">색상</label>
      <div className="flex flex-wrap gap-1.5">
        {COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            onClick={() => { setColorDraft(color.value); onColorChange(color.value); }}
            className={`w-6 h-6 rounded-full transition-transform ${
              colorDraft.toLowerCase() === color.value.toLowerCase()
                ? 'ring-2 ring-offset-1 ring-offset-[var(--qf-surface-2)] ring-white scale-110'
                : 'hover:scale-110 opacity-70 hover:opacity-100'
            }`}
            style={{ backgroundColor: color.value }}
            title={color.name}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <input
          type="color"
          value={normalizeHexColor(colorDraft) ?? '#60a5fa'}
          onChange={(e) => { setColorDraft(e.target.value); onColorChange(e.target.value); }}
          className="h-8 w-9 rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface)] p-0.5 cursor-pointer"
          aria-label="사용자 지정 색상"
        />
        <input
          type="text"
          value={colorDraft}
          onChange={(e) => setColorDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyCustomColor(); }}
          onBlur={applyCustomColor}
          placeholder="#60a5fa"
          className="flex-1 bg-[var(--qf-surface)] border border-[var(--qf-border)] rounded-md px-2 py-1.5 text-[11px] font-mono text-[var(--qf-text)] outline-none focus:ring-1 focus:ring-[var(--qf-accent)]"
        />
      </div>

      <div className="my-2.5 border-t border-[var(--qf-border)]" />

      {/* 폴더 추가 / 삭제 */}
      <button
        type="button"
        onClick={onAddFolder}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-[var(--qf-text)] rounded-md hover:bg-[var(--qf-surface-hover)] transition-colors"
      >
        <Plus size={14} className="text-[var(--qf-muted)]" />
        폴더 추가
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-[var(--qf-surface-hover)] transition-colors"
        style={{ color: '#f87171' }}
      >
        <Trash2 size={14} />
        카테고리 삭제
      </button>
    </div>,
    portalRoot,
  );
}
