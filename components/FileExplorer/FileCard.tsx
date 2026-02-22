import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry, ThumbnailSize } from '../../types';
import { ThemeVars } from './types';
import { FileTypeIcon, iconColor, formatSize } from './fileUtils';

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

export default function FileCard({
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
  const [renameValue, setRenameValue] = useState(entry.name);
  const [imageDims, setImageDims] = useState<[number, number] | null>(null);
  const [psdThumbnail, setPsdThumbnail] = useState<string | null>(null);
  const [showPsdPreview, setShowPsdPreview] = useState(false);
  const [psdLoading, setPsdLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // PSD 파일 여부 확인
  const isPsd = entry.name.toLowerCase().endsWith('.psd');

  // IntersectionObserver로 lazy 썸네일 로딩
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([oe]) => { if (oe.isIntersecting) setIsVisible(true); },
      { threshold: 0.1 }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  // 화면에 보일 때 이미지 썸네일 요청
  useEffect(() => {
    if (isVisible && entry.file_type === 'image' && !thumbnail) {
      invoke<string | null>('get_file_thumbnail', { path: entry.path, size: thumbnailSize })
        .then(b64 => { if (b64) setThumbnail(`data:image/png;base64,${b64}`); })
        .catch(() => {/* 썸네일 생성 실패 무시 */});
    }
  }, [isVisible, entry.file_type, entry.path, thumbnailSize]);

  // 화면에 보일 때 이미지 규격 조회 (이미지 + PSD)
  useEffect(() => {
    if (isVisible && (entry.file_type === 'image' || isPsd) && !imageDims) {
      invoke<[number, number] | null>('get_image_dimensions', { path: entry.path })
        .then(dims => { if (dims) setImageDims(dims); })
        .catch(() => {/* 규격 조회 실패 무시 */});
    }
  }, [isVisible, entry.file_type, entry.path, isPsd]);

  // PSD 미리보기 토글 핸들러
  const handlePsdToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showPsdPreview) {
      setShowPsdPreview(false);
      return;
    }
    setShowPsdPreview(true);
    if (!psdThumbnail) {
      setPsdLoading(true);
      invoke<string | null>('get_psd_thumbnail', { path: entry.path, size: thumbnailSize })
        .then(b64 => { if (b64) setPsdThumbnail(`data:image/png;base64,${b64}`); })
        .catch(() => {/* PSD 썸네일 생성 실패 무시 */})
        .finally(() => setPsdLoading(false));
    }
  };

  // 이름 변경 시 입력 초기화
  useEffect(() => {
    setRenameValue(entry.name);
  }, [entry.name]);

  // 이름 변경 모드 진입 시 포커스
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      // 확장자 제외하고 선택
      const dotIdx = entry.name.lastIndexOf('.');
      if (dotIdx > 0 && !entry.is_dir) {
        renameInputRef.current.setSelectionRange(0, dotIdx);
      } else {
        renameInputRef.current.select();
      }
    }
  }, [isRenaming]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpen(entry);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSelected) {
      onSelect(entry.path, false, false);
    }
    onContextMenu(e, [entry.path]);
  };

  // 외부 앱으로 파일 드래그 (마우스 6px 이동 시 OS 드래그 시작)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;

    const onMouseMove = async (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.sqrt(dx * dx + dy * dy) > 6) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        try {
          // tauri-plugin-drag: plugin:drag|drag_files 명령으로 OS 드래그 시작
          await invoke('plugin:drag|drag_files', { paths: dragPaths });
        } catch {
          // 드래그 실패 무시 (앱 내부 클릭인 경우)
        }
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onRenameCommit(entry.path, renameValue);
    } else if (e.key === 'Escape') {
      onRenameCommit(entry.path, entry.name); // 변경 없이 커밋
    }
  };

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
      onMouseDown={handleMouseDown}
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
        {/* 일반 이미지 썸네일 */}
        {thumbnail && !isPsd ? (
          <img
            src={thumbnail}
            alt={entry.name}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        ) : isPsd && showPsdPreview && psdThumbnail ? (
          /* PSD 미리보기 */
          <img
            src={psdThumbnail}
            alt={entry.name}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        ) : isPsd && showPsdPreview && psdLoading ? (
          /* PSD 로딩 중 */
          <div className="flex items-center justify-center w-full h-full">
            <svg className="animate-spin" style={{ width: 20, height: 20, color: themeVars?.accent ?? '#3b82f6' }} viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        ) : (
          <div style={{ color: iconColor(entry.file_type) }}>
            <FileTypeIcon
              fileType={entry.file_type}
              size={thumbnailSize >= 120 ? 40 : 28}
            />
          </div>
        )}

        {/* PSD 미리보기 토글 버튼 */}
        {isPsd && thumbnailSize >= 60 && (
          <button
            className="absolute bottom-1 right-1 text-[9px] px-1 py-0.5 rounded opacity-80 hover:opacity-100 transition-opacity"
            style={{
              backgroundColor: showPsdPreview ? (themeVars?.accent ?? '#3b82f6') : (themeVars?.surface2 ?? '#1f2937'),
              color: showPsdPreview ? '#fff' : (themeVars?.muted ?? '#94a3b8'),
              border: `1px solid ${themeVars?.border ?? '#334155'}`,
            }}
            onClick={handlePsdToggle}
            title={showPsdPreview ? 'PSD 미리보기 숨기기' : 'PSD 미리보기 표시'}
          >
            PSD
          </button>
        )}
      </div>

      {/* 파일명 */}
      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={() => onRenameCommit(entry.path, renameValue)}
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
}
