import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry, ThumbnailSize } from '../../types';
import { ThemeVars } from './types';
import { FileTypeIcon, iconColor, formatSize } from './fileUtils';
import { useDragToOS } from './hooks/useDragToOS';
import { useRenameInput } from './hooks/useRenameInput';

interface FileCardProps {
  entry: FileEntry;
  isSelected: boolean;
  isFocused: boolean;
  isRenaming: boolean;
  thumbnailSize: ThumbnailSize;
  dragPaths: string[];
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  themeVars: ThemeVars | null;
}

export default memo(function FileCard({
  entry,
  isSelected,
  isFocused,
  isRenaming,
  thumbnailSize,
  dragPaths,
  onSelect,
  onOpen,
  onContextMenu,
  onRenameCommit,
  themeVars,
}: FileCardProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [imageDims, setImageDims] = useState<[number, number] | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // PSD 파일 여부 확인
  const isPsd = entry.name.toLowerCase().endsWith('.psd');

  // 공유 훅
  const startDrag = useDragToOS(dragPaths);
  const {
    renameValue, setRenameValue, inputRef: renameInputRef,
    handleKeyDown: handleRenameKeyDown, handleBlur: handleRenameBlur,
  } = useRenameInput({
    name: entry.name,
    isDir: entry.is_dir,
    isRenaming,
    onRenameCommit,
    path: entry.path,
    selectBeforeExtension: true,
  });

  // IntersectionObserver로 lazy 썸네일 로딩
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([oe]) => { if (oe.isIntersecting) setIsVisible(true); },
      { threshold: 0.1 }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  // 화면에 보일 때 이미지/PSD 썸네일 자동 요청 (PNG처럼 자동 표시)
  useEffect(() => {
    if (!isVisible || thumbnail) return;
    if (entry.file_type === 'image') {
      invoke<string | null>('get_file_thumbnail', { path: entry.path, size: thumbnailSize })
        .then(b64 => { if (b64) setThumbnail(`data:image/png;base64,${b64}`); })
        .catch(() => {/* 썸네일 생성 실패 무시 */});
    } else if (isPsd) {
      // PSD도 일반 이미지처럼 자동 썸네일 로드
      invoke<string | null>('get_psd_thumbnail', { path: entry.path, size: thumbnailSize })
        .then(b64 => { if (b64) setThumbnail(`data:image/png;base64,${b64}`); })
        .catch(() => {/* PSD 썸네일 생성 실패 무시 */});
    }
  }, [isVisible, entry.file_type, entry.path, thumbnailSize, isPsd]);

  // 화면에 보일 때 이미지 규격 조회 (이미지 + PSD)
  useEffect(() => {
    if (isVisible && (entry.file_type === 'image' || isPsd) && !imageDims) {
      invoke<[number, number] | null>('get_image_dimensions', { path: entry.path })
        .then(dims => { if (dims) setImageDims(dims); })
        .catch(() => {/* 규격 조회 실패 무시 */});
    }
  }, [isVisible, entry.file_type, entry.path, isPsd]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey);
  }, [entry.path, onSelect]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpen(entry);
  }, [entry, onOpen]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSelected) {
      onSelect(entry.path, false, false);
    }
    onContextMenu(e, [entry.path]);
  }, [entry.path, isSelected, onSelect, onContextMenu]);

  // 카드 크기 계산
  const cardWidth = thumbnailSize + 16;
  const imgHeight = thumbnailSize;

  const bg = isSelected
    ? (themeVars?.accent20 ?? 'rgba(59,130,246,0.2)')
    : isFocused ? (themeVars?.surfaceHover ?? '#334155') : 'transparent';
  const border = isSelected
    ? (themeVars?.accent50 ?? 'rgba(59,130,246,0.5)')
    : isFocused ? (themeVars?.border ?? '#334155') : 'transparent';

  return (
    <div
      ref={cardRef}
      data-file-path={entry.path}
      className="flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer select-none transition-all"
      style={{
        width: cardWidth,
        backgroundColor: bg,
        border: `1px solid ${border}`,
        outline: 'none',
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={startDrag}
      title={entry.path}
    >
      {/* 썸네일/아이콘 영역 */}
      <div
        className="relative rounded-md overflow-hidden flex items-center justify-center flex-shrink-0"
        style={{
          width: thumbnailSize,
          height: imgHeight,
          backgroundColor: themeVars?.surface ?? '#111827',
        }}
      >
        {/* 썸네일 (일반 이미지 + PSD 모두 자동 표시) */}
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={entry.name}
            className="w-full h-full object-contain"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div style={{ color: iconColor(entry.file_type) }}>
            <FileTypeIcon
              fileType={entry.file_type}
              size={thumbnailSize >= 120 ? 40 : 28}
            />
          </div>
        )}
      </div>

      {/* 파일명 */}
      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleRenameBlur}
          onClick={e => e.stopPropagation()}
          className="w-full text-center text-xs px-1 rounded outline-none"
          style={{
            backgroundColor: themeVars?.surface2 ?? '#1f2937',
            color: themeVars?.text ?? '#e5e7eb',
            border: `1px solid ${themeVars?.accent ?? '#3b82f6'}`,
          }}
        />
      ) : (
        <div
          className="w-full text-center text-xs leading-tight line-clamp-2 break-all"
          style={{ color: themeVars?.text ?? '#e5e7eb' }}
          title={entry.name}
        >
          {entry.name}
        </div>
      )}

      {/* 크기 + 이미지 규격 */}
      <div
        className="text-[10px] leading-none text-center"
        style={{ color: themeVars?.muted ?? '#94a3b8' }}
      >
        {formatSize(entry.size, entry.is_dir)}
        {imageDims && (
          <span className="ml-1 opacity-75">{imageDims[0]}×{imageDims[1]}</span>
        )}
      </div>
    </div>
  );
});
