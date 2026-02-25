import React, { useEffect, useRef } from 'react';
import {
  ExternalLink,
  Folder,
  Copy,
  CopyPlus,
  Scissors,
  Clipboard,
  Edit2,
  Trash2,
  Hash,
  Star,
  FileArchive,
  Eye,
} from 'lucide-react';
import { FileEntry, ClipboardData } from '../../types';

interface ContextMenuProps {
  x: number;
  y: number;
  paths: string[];
  clipboard: ClipboardData | null;
  entries: FileEntry[];
  onClose: () => void;
  onOpen: (path: string) => void;
  onOpenInOs: (path: string) => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: (paths: string[]) => void;
  onDuplicate: () => void;
  onRename: (path: string) => void;
  onCopyPath: (path: string) => void;
  onAddToFavorites: (path: string) => void;
  onCompressZip: (paths: string[]) => void;
  onPreviewPsd?: (path: string) => void;
}

export default function ContextMenu({
  x,
  y,
  paths,
  clipboard,
  entries,
  onClose,
  onOpen,
  onOpenInOs,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onDuplicate,
  onRename,
  onCopyPath,
  onAddToFavorites,
  onCompressZip,
  onPreviewPsd,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 화면 밖으로 나가지 않도록 위치 조정
  const [adjustedPos, setAdjustedPos] = React.useState({ x, y });

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setAdjustedPos({
      x: x + rect.width > vw ? Math.max(0, vw - rect.width - 8) : x,
      y: y + rect.height > vh ? Math.max(0, vh - rect.height - 8) : y,
    });
  }, [x, y]);

  // 외부 클릭 또는 ESC로 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const isSingle = paths.length === 1;
  const singlePath = paths[0] ?? '';
  const singleEntry = entries.find(e => e.path === singlePath);

  const item = (
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    disabled = false,
    shortcut?: string,
  ) => (
    <button
      key={label}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors text-left ${
        disabled
          ? 'opacity-30 cursor-not-allowed'
          : 'hover:bg-[var(--qf-surface-hover)] cursor-pointer'
      }`}
      style={{ color: 'var(--qf-text)' }}
      onClick={disabled ? undefined : () => { onClick(); onClose(); }}
      disabled={disabled}
    >
      <span style={{ color: 'var(--qf-muted)' }}>{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[10px] text-[var(--qf-muted)]">{shortcut}</span>}
    </button>
  );

  const divider = (key: string) => (
    <div key={key} className="my-1 border-t border-[var(--qf-border)]" />
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] rounded-lg shadow-2xl overflow-hidden min-w-[180px]"
      style={{
        left: adjustedPos.x,
        top: adjustedPos.y,
        backgroundColor: 'var(--qf-surface-2)',
        border: '1px solid var(--qf-border)',
      }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="py-1">
        {/* 열기 */}
        {isSingle && item(<ExternalLink size={13} />, '열기', () => onOpen(singlePath))}

        {/* PSD/이미지 미리보기 */}
        {isSingle && singleEntry && !singleEntry.is_dir &&
          (singleEntry.name.toLowerCase().endsWith('.psd') || singleEntry.file_type === 'image') &&
          onPreviewPsd && item(
            <Eye size={13} />,
            '미리보기',
            () => onPreviewPsd(singlePath),
          )}

        {/* 탐색기에서 열기 */}
        {isSingle && item(
          <Folder size={13} />,
          'Finder/탐색기에서 열기',
          () => onOpenInOs(singleEntry?.is_dir ? singlePath : (singlePath.split(/[/\\]/).slice(0, -1).join('/') || singlePath)),
        )}

        {divider('d1')}

        {/* 복사 / 잘라내기 / 붙여넣기 */}
        {item(<Copy size={13} />, '복사', onCopy, paths.length === 0, 'Ctrl+C')}
        {item(<Scissors size={13} />, '잘라내기', onCut, paths.length === 0, 'Ctrl+X')}
        {item(<Clipboard size={13} />, '붙여넣기', onPaste, !clipboard, 'Ctrl+V')}
        {item(<CopyPlus size={13} />, '복제', onDuplicate, paths.length === 0, 'Ctrl+D')}

        {divider('d2')}

        {/* 이름 바꾸기 */}
        {isSingle && item(<Edit2 size={13} />, '이름 바꾸기', () => onRename(singlePath), false, 'F2')}

        {/* 삭제 (휴지통) */}
        {item(
          <Trash2 size={13} style={{ color: '#f87171' }} />,
          '삭제 (휴지통)',
          () => onDelete(paths),
          paths.length === 0,
          'Del',
        )}

        {divider('d3')}

        {/* ZIP 압축 */}
        {item(
          <FileArchive size={13} />,
          'ZIP으로 압축',
          () => onCompressZip(paths),
          paths.length === 0,
        )}

        {divider('d4')}

        {/* 경로 복사 */}
        {isSingle && item(<Hash size={13} />, '경로 복사', () => onCopyPath(singlePath))}

        {/* 즐겨찾기에 추가 (폴더만) */}
        {isSingle && singleEntry?.is_dir && item(
          <Star size={13} />,
          '즐겨찾기에 추가',
          () => onAddToFavorites(singlePath),
        )}
      </div>
    </div>
  );
}
