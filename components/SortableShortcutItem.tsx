import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Folder, Copy, Trash2, Edit2, MoreVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { FolderShortcut } from '../types';
import { useFolderIcon } from './FileExplorer/hooks/useNativeIcon';
import { LEGACY_TEXT_CLASS_TO_HEX } from '../hooks/useCategoryManagement';

export interface SortableShortcutItemProps {
  shortcut: FolderShortcut;
  categoryId: string;
  handleOpenFolder: (path: string) => void;
  handleCopyPath: (path: string) => void;
  deleteShortcut: (catId: string, sId: string) => void;
  openEditFolderModal: (catId: string, shortcut: FolderShortcut) => void;
  showIndicatorBefore?: boolean;
}

export function SortableShortcutItem({ shortcut, categoryId, handleOpenFolder, handleCopyPath, deleteShortcut, openEditFolderModal, showIndicatorBefore }: SortableShortcutItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({
    id: shortcut.id,
    data: {
      type: 'Shortcut',
      shortcut,
      categoryId
    }
  });

  const style = {
    opacity: isDragging ? 0.3 : 1,
  };

  const folderIcon = useFolderIcon(shortcut.path, 16);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  // 메뉴 열릴 때 버튼 위치 기반으로 fixed 좌표 계산
  useEffect(() => {
    if (!menuOpen || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuHeight = 120; // 대략적인 메뉴 높이
    const spaceBelow = window.innerHeight - rect.bottom;
    // 아래 공간 부족하면 위로 표시
    const top = spaceBelow < menuHeight ? rect.top - menuHeight : rect.bottom + 4;
    setMenuPos({ top, left: rect.right - 130 }); // min-w-[130px] 기준 우측 정렬
  }, [menuOpen]);

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <>
      {/* 드롭 위치 인디케이터 (파란색 라인 - 아이템 사이 빈 공간) */}
      {showIndicatorBefore && (
        <li className="list-none py-[1px]">
          <div className="h-[2px] rounded-full bg-[var(--qf-accent)]" />
        </li>
      )}
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
          {folderIcon ? (
            <img src={folderIcon} alt="" style={{ width: 16, height: 16 }} draggable={false} />
          ) : (
            <Folder size={16} />
          )}
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
        className="opacity-0 group-hover/item:opacity-100 transition-opacity"
      >
        <button
          ref={btnRef}
          onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-1.5 text-[var(--qf-muted)] hover:text-[var(--qf-text)] hover:bg-[var(--qf-surface-hover)] rounded-md"
          title="더 보기"
        >
          <MoreVertical size={13} />
        </button>
        {menuOpen && menuPos && createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] rounded-lg shadow-xl overflow-hidden min-w-[130px]"
            style={{
              top: menuPos.top,
              left: menuPos.left,
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
          </div>,
          document.getElementById('qf-root') || document.body
        )}
      </div>
    </li>
    </>
  );
}
