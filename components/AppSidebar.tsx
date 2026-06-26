import React from 'react';
import {
  Clock,
  Download,
  Folder,
  HardDrive,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import type { Category, FolderShortcut } from '../types';
import { RECENT_PATH, SYSTEM_ROOT_PATH } from './FileExplorer/constants';
import { Button } from './ui/Button';
import { CategoryColumn, type DropIndicator } from './CategoryColumn';
import type { TranslationKey } from '../utils/i18n';
import { adjustColorForTheme } from '../hooks/useThemeManagement';
import {
  LEGACY_BG_CLASS_TO_HEX,
  LEGACY_TEXT_CLASS_TO_HEX,
} from '../hooks/useCategoryManagement';

export interface CollapsedSessionBadge {
  category: Category;
  label: string;
  color?: string;
}

interface AppSidebarProps {
  sidebarCollapsed: boolean;
  leftPanelWidth: number;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  t: (key: TranslationKey) => string;
  onOpenSettingsMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenRecent: () => void;
  onOpenSystemRoot: () => void;
  onOpenDesktop: () => void;
  onOpenDownloads: () => void;
  isMac: boolean;
  desktopPath: string | null;
  downloadPath: string | null;
  collapsedSessionBadges: CollapsedSessionBadge[];
  setCollapsedSessionMenu: React.Dispatch<React.SetStateAction<{ categoryId: string; x: number; y: number } | null>>;
  sensors: React.ComponentProps<typeof DndContext>['sensors'];
  customCollisionDetection: CollisionDetection;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  updateHoveredCategoryFromDragEvent: (event: React.DragEvent) => void;
  clearHoveredCategoryIfLeftMain: (event: React.DragEvent) => void;
  zoomScale: number;
  categories: Category[];
  activeId: string | null;
  dropIndicator: DropIndicator | null;
  isDark: boolean;
  openAddCategoryModal: () => void;
  toggleCollapse: (categoryId: string) => void;
  toggleCollapseAll: () => void;
  handleAddFolder: (categoryId: string, path?: string, name?: string) => void;
  openEditCategoryModal: (category: Category) => void;
  updateCategory: (categoryId: string, patch: Partial<Pick<Category, 'title' | 'color'>>) => void;
  deleteCategory: (categoryId: string) => void;
  handleOpenFolder: (path: string) => void;
  handleOpenInNewTab: (path: string) => void;
  handleCopyPath: (path: string) => void;
  deleteShortcut: (categoryId: string, shortcutId: string) => void;
  openEditFolderModal: (categoryId: string, shortcut: FolderShortcut) => void;
}

export function AppSidebar({
  sidebarCollapsed,
  leftPanelWidth,
  setSidebarCollapsed,
  t,
  onOpenSettingsMenu,
  onOpenRecent,
  onOpenSystemRoot,
  onOpenDesktop,
  onOpenDownloads,
  isMac,
  desktopPath,
  downloadPath,
  collapsedSessionBadges,
  setCollapsedSessionMenu,
  sensors,
  customCollisionDetection,
  onDragStart,
  onDragOver,
  onDragEnd,
  updateHoveredCategoryFromDragEvent,
  clearHoveredCategoryIfLeftMain,
  zoomScale,
  categories,
  activeId,
  dropIndicator,
  isDark,
  openAddCategoryModal,
  toggleCollapse,
  toggleCollapseAll,
  handleAddFolder,
  openEditCategoryModal,
  updateCategory,
  deleteCategory,
  handleOpenFolder,
  handleOpenInNewTab,
  handleCopyPath,
  deleteShortcut,
  openEditFolderModal,
}: AppSidebarProps) {
  const systemRootLabel = isMac ? t('app.nav.systemRoot.mac') : t('app.nav.systemRoot.windows');

  // Ctrl(Cmd)+클릭이면 새 탭에서 열고, 아니면 기존 동작 수행
  const openPinned = (
    event: React.MouseEvent,
    path: string | null,
    normalOpen: () => void,
  ) => {
    if ((event.metaKey || event.ctrlKey) && path) {
      handleOpenInNewTab(path);
    } else {
      normalOpen();
    }
  };

  return (
    <div
      style={{ width: sidebarCollapsed ? 32 : leftPanelWidth }}
      className="qf-sidebar flex-shrink-0 flex flex-col overflow-hidden transition-[width] duration-200"
    >
      <div className="flex-shrink-0 border-b border-[var(--qf-border)]">
        {sidebarCollapsed ? (
          <div className="flex items-center justify-center" style={{ height: 36 }}>
            <button
              onClick={() => setSidebarCollapsed(prev => !prev)}
              className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)]"
              title={t('sidebar.expand')}
            >
              <PanelLeftOpen size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center px-3 gap-1.5" style={{ height: 36 }}>
            <button
              onClick={() => setSidebarCollapsed(prev => !prev)}
              className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)]"
              title={t('sidebar.collapse')}
            >
              <PanelLeftClose size={14} />
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onOpenSettingsMenu}
              className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)] flex-shrink-0"
              title={t('settings.title')}
              aria-label={t('settings.title')}
            >
              <Settings size={14} />
            </button>
            <button
              type="button"
              onClick={openAddCategoryModal}
              className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)] flex-shrink-0"
              title={t('sidebar.addSection')}
            >
              <Plus size={14} />
            </button>
          </div>
        )}
      </div>

      {sidebarCollapsed ? (
        <div className="flex-1 overflow-y-auto px-1 py-2">
          <div className="flex flex-col items-center gap-1">
            <CollapsedShortcutButton
              icon={<Clock size={15} />}
              label={t('app.nav.recent')}
              onClick={(e) => openPinned(e, RECENT_PATH, onOpenRecent)}
            />
            <CollapsedShortcutButton
              icon={<HardDrive size={15} />}
              label={systemRootLabel}
              onClick={(e) => openPinned(e, SYSTEM_ROOT_PATH, onOpenSystemRoot)}
            />
            <CollapsedShortcutButton
              icon={<Monitor size={15} />}
              label={t('app.nav.desktop')}
              onClick={(e) => openPinned(e, desktopPath, onOpenDesktop)}
              disabled={!desktopPath}
            />
            <CollapsedShortcutButton
              icon={<Download size={15} />}
              label={t('app.nav.downloads')}
              onClick={(e) => openPinned(e, downloadPath, onOpenDownloads)}
              disabled={!downloadPath}
            />
          </div>

          {collapsedSessionBadges.length > 0 && (
            <>
              <div className="mx-auto my-2 h-px w-5 bg-[var(--qf-border)]" />
              <div className="flex flex-col items-center gap-1">
                {collapsedSessionBadges.map(({ category, label, color }) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setCollapsedSessionMenu({ categoryId: category.id, x: rect.right + 6, y: rect.top });
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors hover:bg-[var(--qf-surface-hover)] focus:outline-none focus:ring-1 focus:ring-[var(--qf-accent)]"
                    style={{
                      borderColor: color ?? 'var(--qf-border)',
                      color: color ?? 'var(--qf-text)',
                      backgroundColor: 'var(--qf-surface)',
                    }}
                    title={category.title}
                    aria-label={category.title}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="shrink-0 px-4 pt-4 pb-1">
            <ExpandedShortcutRow
              icon={<Clock size={14} />}
              label={t('app.nav.recent')}
              onClick={(e) => openPinned(e, RECENT_PATH, onOpenRecent)}
            />
            <ExpandedShortcutRow
              icon={<HardDrive size={14} />}
              label={systemRootLabel}
              onClick={(e) => openPinned(e, SYSTEM_ROOT_PATH, onOpenSystemRoot)}
            />
            <ExpandedShortcutRow
              icon={<Monitor size={14} />}
              label={t('app.nav.desktop')}
              onClick={(e) => openPinned(e, desktopPath, onOpenDesktop)}
            />
            <ExpandedShortcutRow
              icon={<Download size={14} />}
              label={t('app.nav.downloads')}
              onClick={(e) => openPinned(e, downloadPath, onOpenDownloads)}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4">
            <DndContext
              sensors={sensors}
              collisionDetection={customCollisionDetection}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
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
                    transform: `scale(${zoomScale})`,
                    transformOrigin: 'top left',
                    width: `${100 / zoomScale}%`,
                  }}
                >
                  <SortableContext items={categories.map(c => c.id)} strategy={rectSortingStrategy}>
                    <div
                      style={{
                        columnCount: 1,
                        columnGap: '0.75rem',
                        width: '100%',
                        marginTop: '-0.75rem',
                      }}
                    >
                      {categories.map((category, idx) => (
                        <CategoryColumn
                          key={category.id}
                          category={category}
                          categoryIndex={idx}
                          toggleCollapse={toggleCollapse}
                          toggleCollapseAll={toggleCollapseAll}
                          handleAddFolder={handleAddFolder}
                          openEditCategoryModal={openEditCategoryModal}
                          updateCategory={updateCategory}
                          deleteCategory={deleteCategory}
                          handleOpenFolder={handleOpenFolder}
                          handleOpenInNewTab={handleOpenInNewTab}
                          handleCopyPath={handleCopyPath}
                          deleteShortcut={deleteShortcut}
                          openEditFolderModal={openEditFolderModal}
                          isDark={isDark}
                          dropIndicator={dropIndicator}
                        />
                      ))}

                      {categories.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-[var(--qf-muted)]" style={{ breakInside: 'avoid' }}>
                          <Folder size={48} className="mb-4 opacity-50" />
                          <p className="text-lg font-medium">{t('app.category.empty.title')}</p>
                          <Button onClick={openAddCategoryModal} className="mt-4" variant="secondary">
                            {t('app.category.empty.create')}
                          </Button>
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </div>
              </main>
              <DragOverlay>
                {activeId ? (
                  <SidebarDragOverlay
                    activeId={activeId}
                    categories={categories}
                    isDark={isDark}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </>
      )}
    </div>
  );
}

function CollapsedShortcutButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: (event: React.MouseEvent) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--qf-accent)] transition-colors hover:bg-[var(--qf-surface-hover)] focus:outline-none focus:ring-1 focus:ring-[var(--qf-accent)] disabled:cursor-not-allowed disabled:opacity-35"
      title={label}
      aria-label={label}
      disabled={disabled}
    >
      {icon}
    </button>
  );
}

function ExpandedShortcutRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: (event: React.MouseEvent) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer select-none hover:bg-[var(--qf-surface-hover)] transition-colors"
      onClick={onClick}
    >
      <span className="text-[var(--qf-accent)]">{icon}</span>
      <span className="text-xs font-semibold text-[var(--qf-text)]">{label}</span>
    </div>
  );
}

function SidebarDragOverlay({
  activeId,
  categories,
  isDark,
}: {
  activeId: string;
  categories: Category[];
  isDark: boolean;
}) {
  const activeCategory = categories.find(c => c.id === activeId);
  if (activeCategory) {
    return (
      <div className="bg-[var(--qf-surface-2)] border-2 border-[var(--qf-accent)] rounded-2xl p-3 shadow-2xl backdrop-blur-sm min-w-[200px]">
        <div className="flex items-center gap-2">
          <h2
            className="font-semibold"
            style={{ color: getCategoryOverlayColor(activeCategory, isDark) }}
          >
            {activeCategory.title}
          </h2>
        </div>
      </div>
    );
  }

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

function getCategoryOverlayColor(category: Category, isDark: boolean) {
  const raw = category.color?.startsWith('#')
    ? category.color
    : (category.color &&
        (LEGACY_TEXT_CLASS_TO_HEX[category.color] ||
          LEGACY_BG_CLASS_TO_HEX[category.color])) ||
      undefined;
  return raw ? adjustColorForTheme(raw, isDark) : undefined;
}
