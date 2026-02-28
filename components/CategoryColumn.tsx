import React from 'react';
import { Plus, Settings, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { Category, FolderShortcut } from '../types';
import {
  LEGACY_TEXT_CLASS_TO_HEX,
  LEGACY_BG_CLASS_TO_HEX,
} from '../hooks/useCategoryManagement';
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
  handleAddFolder: (catId: string, path?: string, name?: string) => void;
  openEditCategoryModal: (cat: Category) => void;
  deleteCategory: (id: string) => void;
  handleOpenFolder: (path: string) => void;
  handleCopyPath: (path: string) => void;
  deleteShortcut: (catId: string, sId: string) => void;
  openEditFolderModal: (catId: string, shortcut: FolderShortcut) => void;
  searchQuery: string;
  dropIndicator: DropIndicator | null;
}

export function CategoryColumn({
  category,
  categoryIndex,
  toggleCollapse,
  handleAddFolder,
  openEditCategoryModal,
  deleteCategory,
  handleOpenFolder,
  handleCopyPath,
  deleteShortcut,
  openEditFolderModal,
  searchQuery,
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

  const style: React.CSSProperties = {
    opacity: isDragging ? 0.5 : 1,
    breakInside: 'avoid' as const,
    display: 'inline-block',
    width: '100%',
    marginTop: '0.75rem',
  };

  const isExpanded = !category.isCollapsed || searchQuery.length > 0;

  // 카테고리 드롭 인디케이터: 이 카테고리 앞에 라인 표시
  const showCategoryIndicator = dropIndicator?.type === 'category' && dropIndicator.index === categoryIndex;
  const categoryTitleHex =
    category.color?.startsWith('#')
      ? category.color
      : (category.color && (LEGACY_TEXT_CLASS_TO_HEX[category.color] || LEGACY_BG_CLASS_TO_HEX[category.color])) || '';

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
        className={`border rounded-2xl overflow-hidden backdrop-blur-sm transition-colors group flex flex-col w-full bg-[var(--qf-surface)] border-[var(--qf-border)] hover:border-[var(--qf-border)] ${isDragging ? 'shadow-2xl shadow-[var(--qf-accent-20)]' : ''}`}
      >
        <div
          className={`px-2.5 py-1.5 border-b flex items-center justify-between bg-[var(--qf-surface-2)] border-[var(--qf-border)] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          {...attributes}
          {...listeners}
        >
          <div
            className="flex items-center gap-2 cursor-pointer select-none"
            onClick={() => toggleCollapse(category.id)}
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
    </SortableContext>
  );
}
