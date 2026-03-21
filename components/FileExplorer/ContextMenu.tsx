import React, { memo, useEffect, useRef, useState } from 'react';
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
  Film,
  ChevronRight,
  Grid3x3,
  LayoutGrid,
  Ungroup,
  Tag,
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
  onCompressVideo?: (path: string, quality: 'low' | 'medium' | 'high') => void;
  onPreviewPsd?: (path: string) => void;
  onBulkRename?: (paths: string[]) => void;
  onPixelate?: (path: string) => void;
  onSpritePack?: (paths: string[]) => void;
  onSheetUnpack?: (path: string) => void;
  onAddTag?: (path: string) => void;
  onRemoveTag?: (path: string) => void;
  folderTags?: Record<string, string>; // 태그 존재 여부 확인용
}

export default memo(function ContextMenu({
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
  onCompressVideo,
  onPreviewPsd,
  onBulkRename,
  onPixelate,
  onSpritePack,
  onSheetUnpack,
  onAddTag,
  onRemoveTag,
  folderTags,
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

  const mod = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl';
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
      className="fixed z-[9999] rounded-lg shadow-2xl min-w-[180px]"
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
          (/\.(psd|psb)$/i.test(singleEntry.name) || singleEntry.file_type === 'image') &&
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
        {item(<Copy size={13} />, '복사', onCopy, paths.length === 0, `${mod}+C`)}
        {item(<Scissors size={13} />, '잘라내기', onCut, paths.length === 0, `${mod}+X`)}
        {item(<Clipboard size={13} />, '붙여넣기', onPaste, false, `${mod}+V`)}
        {item(<CopyPlus size={13} />, '복제', onDuplicate, paths.length === 0, `${mod}+D`)}

        {divider('d2')}

        {/* 이름 바꾸기 */}
        {isSingle && item(<Edit2 size={13} />, '이름 바꾸기', () => onRename(singlePath), false, 'F2')}

        {/* 이름 모두 바꾸기 (복수 선택 시) */}
        {!isSingle && paths.length > 1 && onBulkRename && item(
          <Edit2 size={13} />,
          '이름 모두 바꾸기',
          () => onBulkRename(paths),
        )}

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

        {/* 동영상 압축 (서브메뉴) */}
        {isSingle && singleEntry && singleEntry.file_type === 'video' &&
          onCompressVideo && (
            <VideoCompressSubmenu
              onSelect={(quality) => { onCompressVideo(singlePath, quality); onClose(); }}
            />
          )}

        {/* 픽셀화 (PNG/JPG) */}
        {isSingle && singleEntry && /\.(png|jpe?g)$/i.test(singleEntry.name) &&
          onPixelate && item(
            <Grid3x3 size={13} />,
            '픽셀화',
            () => onPixelate(singlePath),
          )}

        {/* 스프라이트 시트 패킹 — 폴더 단일 선택 */}
        {isSingle && singleEntry?.is_dir && onSpritePack &&
          item(<LayoutGrid size={13} />, '시트 패킹', () => onSpritePack([singlePath]))}

        {/* 스프라이트 시트 패킹 — 다중 이미지 선택 */}
        {!isSingle && paths.length > 1 && onSpritePack && (() => {
          const allImages = paths.every(p => /\.(png|jpe?g|gif|webp|bmp)$/i.test(p));
          return allImages ? item(<LayoutGrid size={13} />, '시트 패킹', () => onSpritePack(paths)) : null;
        })()}

        {/* 스프라이트 시트 언패킹 — PNG 단일 선택 */}
        {isSingle && singleEntry && /\.(png)$/i.test(singleEntry.name) && !singleEntry.is_dir &&
          onSheetUnpack && item(<Ungroup size={13} />, '시트 언패킹', () => onSheetUnpack(singlePath))}

        {divider('d4')}

        {/* 경로 복사 */}
        {isSingle && item(<Hash size={13} />, '경로 복사', () => onCopyPath(singlePath))}

        {/* 즐겨찾기에 추가 (폴더만) */}
        {isSingle && singleEntry?.is_dir && item(
          <Star size={13} />,
          '즐겨찾기에 추가',
          () => onAddToFavorites(singlePath),
        )}

        {/* 폴더 태그 추가/해제 */}
        {isSingle && singleEntry?.is_dir && onAddTag && onRemoveTag && (() => {
          const hasTag = folderTags && folderTags[singlePath];
          return hasTag
            ? item(<Tag size={13} />, '태그 해제', () => onRemoveTag(singlePath))
            : item(<Tag size={13} />, '태그 추가', () => onAddTag(singlePath));
        })()}
      </div>
    </div>
  );
});

// 동영상 압축 품질 서브메뉴
function VideoCompressSubmenu({ onSelect }: { onSelect: (quality: 'low' | 'medium' | 'high') => void }) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleEnter = () => { clearTimeout(timerRef.current); setOpen(true); };
  const handleLeave = () => { timerRef.current = setTimeout(() => setOpen(false), 150); };

  const qualities: { key: 'low' | 'medium' | 'high'; label: string }[] = [
    { key: 'low', label: '보통 화질' },
    { key: 'medium', label: '좋은 화질' },
    { key: 'high', label: '최고 화질' },
  ];

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors text-left hover:bg-[var(--qf-surface-hover)] cursor-pointer"
        style={{ color: 'var(--qf-text)' }}
      >
        <span style={{ color: 'var(--qf-muted)' }}><Film size={13} /></span>
        <span className="flex-1">동영상 압축</span>
        <ChevronRight size={11} style={{ color: 'var(--qf-muted)' }} />
      </button>
      {open && (
        <div
          className="absolute left-full top-0 rounded-lg shadow-2xl overflow-hidden min-w-[120px] z-[10000]"
          style={{
            backgroundColor: 'var(--qf-surface-2)',
            border: '1px solid var(--qf-border)',
          }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <div className="py-1">
            {qualities.map(q => (
              <button
                key={q.key}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left hover:bg-[var(--qf-surface-hover)] cursor-pointer"
                style={{ color: 'var(--qf-text)' }}
                onClick={() => onSelect(q.key)}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
