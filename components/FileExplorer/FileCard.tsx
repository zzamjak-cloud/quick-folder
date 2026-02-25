import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry, ThumbnailSize } from '../../types';
import { ThemeVars } from './types';
import { FileTypeIcon, iconColor, formatSize, formatTooltip } from './fileUtils';
import { useRenameInput } from './hooks/useRenameInput';
import { useNativeIcon } from './hooks/useNativeIcon';
import { queuedInvoke } from './hooks/invokeQueue';

interface FileCardProps {
  entry: FileEntry;
  isSelected: boolean;
  isFocused: boolean;
  isRenaming: boolean;
  isCut: boolean;
  isDropTarget: boolean;
  thumbnailSize: ThumbnailSize;
  onDragMouseDown: (e: React.MouseEvent, entryPath: string) => void;
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
  isCut,
  isDropTarget,
  thumbnailSize,
  onDragMouseDown,
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
  const lastThumbnailSizeRef = useRef<number>(0);

  // PSD 파일 여부 확인
  const isPsd = entry.name.toLowerCase().endsWith('.psd');

  // 네이티브 아이콘 (공유 캐시 훅)
  const nativeIcon = useNativeIcon(entry, thumbnailSize, isVisible);

  // 공유 훅
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

  // 화면에 보일 때 이미지/PSD 썸네일 자동 요청
  // thumbnailSize 변경 시 디바운스(300ms) 후 새 해상도로 재요청 (빠른 줌 시 과부하 방지)
  // queuedInvoke로 동시성 제한 (최대 4개) → 대량 파일 표시 시 크래시 방지
  useEffect(() => {
    if (!isVisible) return;

    const sizeChanged = lastThumbnailSizeRef.current && lastThumbnailSizeRef.current !== thumbnailSize;
    lastThumbnailSizeRef.current = thumbnailSize;

    // 크기 변경이 아닌 첫 로드는 즉시, 크기 변경은 디바운스
    const delay = sizeChanged ? 300 : 0;

    let cancelFn: (() => void) | null = null;

    const timer = setTimeout(() => {
      const requestSize = thumbnailSize;
      let cmd = '';
      if (entry.file_type === 'image') cmd = 'get_file_thumbnail';
      // PSD 썸네일은 성능 문제로 그리드에서 제외 (우클릭 미리보기로 대체)
      else if (entry.file_type === 'video') cmd = 'get_video_thumbnail';

      if (cmd) {
        const { promise, cancel } = queuedInvoke<string | null>(cmd, { path: entry.path, size: requestSize });
        cancelFn = cancel;
        promise
          .then(b64 => { if (b64) setThumbnail(`data:image/png;base64,${b64}`); })
          .catch(() => {/* 취소 또는 실패 무시 */});
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      if (cancelFn) cancelFn();
    };
  }, [isVisible, entry.file_type, entry.path, thumbnailSize, isPsd]);

  // 화면에 보일 때 이미지 규격 조회 (이미지만, PSD 제외 - 성능)
  useEffect(() => {
    if (!isVisible || entry.file_type !== 'image' || imageDims) return;

    const { promise, cancel } = queuedInvoke<[number, number] | null>(
      'get_image_dimensions', { path: entry.path }
    );
    promise
      .then(dims => { if (dims) setImageDims(dims); })
      .catch(() => {/* 취소 또는 실패 무시 */});

    return () => cancel();
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
  const border = isDropTarget
    ? (themeVars?.accent ?? '#3b82f6')
    : isSelected
      ? (themeVars?.accent50 ?? 'rgba(59,130,246,0.5)')
      : isFocused ? (themeVars?.border ?? '#334155') : 'transparent';

  return (
    <div
      ref={cardRef}
      data-file-path={entry.path}
      {...(entry.is_dir ? { 'data-folder-drop-target': entry.path } : {})}
      className="flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer select-none transition-all"
      style={{
        width: cardWidth,
        backgroundColor: bg,
        border: `1px solid ${border}`,
        outline: 'none',
        opacity: isCut ? 0.4 : 1,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={(e) => onDragMouseDown(e, entry.path)}
      title={formatTooltip(entry, imageDims)}
    >
      {/* 썸네일/아이콘 영역 */}
      <div
        className="relative rounded-md overflow-hidden flex items-center justify-center flex-shrink-0"
        style={{
          width: thumbnailSize,
          height: imgHeight,
          backgroundColor: 'transparent',
        }}
      >
        {/* 표시 우선순위: 이미지 썸네일 > 네이티브 아이콘 > lucide 아이콘 */}
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={entry.name}
            className="w-full h-full object-contain"
            loading="lazy"
            draggable={false}
          />
        ) : nativeIcon ? (
          <img
            src={nativeIcon}
            alt={entry.name}
            className="object-contain"
            style={{ width: thumbnailSize * 0.6, height: thumbnailSize * 0.6 }}
            draggable={false}
          />
        ) : (
          <div style={{ color: iconColor(entry.file_type, entry.name) }}>
            <FileTypeIcon
              fileType={entry.file_type}
              size={thumbnailSize >= 120 ? 40 : 28}
              fileName={entry.name}
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
