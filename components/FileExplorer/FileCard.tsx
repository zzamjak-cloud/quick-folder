import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FileEntry, ThumbnailSize } from '../../types';
import { ThemeVars } from './types';
import { Play, RefreshCw } from 'lucide-react';
import { FileTypeIcon, iconColor, formatSize, formatTooltip, getFileIconShadowStyle } from './fileUtils';
import { useRenameInput } from './hooks/useRenameInput';
import { useNativeIcon } from './hooks/useNativeIcon';
import { queuedInvoke } from './hooks/invokeQueue';
import { thumbKey, getThumb, setThumb, deleteThumb, getPersistentThumbUrl } from './hooks/thumbnailCache';
import FuzzyHighlightedName from './FuzzyHighlightedName';

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
  onOpenInNewTab?: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  onHoverFolder?: (path: string) => void; // 폴더 hover 시 프리페치 트리거
  themeVars: ThemeVars | null;
  hideText?: boolean;
  tag?: string; // 폴더 태그 (프로젝트명)
  isPending?: boolean; // 복사/이동 진행 중 (비활성 + 스피너 표시)
  isDimmed?: boolean;
  cvEnabled?: boolean; // content-visibility 최적화 (대용량 폴더)
  fuzzyHighlightIndices?: number[];
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
  onOpenInNewTab,
  onContextMenu,
  onRenameCommit,
  onHoverFolder,
  themeVars,
  hideText = false,
  tag,
  isPending = false,
  isDimmed = false,
  cvEnabled = false,
  fuzzyHighlightIndices,
}: FileCardProps) {
  // 초기값을 전역 캐시에서 동기 조회 → 재방문 시 깜빡임 없이 즉시 표시
  const [thumbnail, setThumbnail] = useState<string | null>(() => {
    const cached = getThumb(thumbKey(entry.path, thumbnailSize, entry.modified));
    return cached ? cached : null;
  });
  const [thumbnailReloadSeq, setThumbnailReloadSeq] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [imageDims, setImageDims] = useState<[number, number] | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastThumbnailSizeRef = useRef<number>(0);
  const failedThumbnailUrlsRef = useRef<Set<string>>(new Set());

  // PSD 파일 여부 확인
  const isPsd = entry.name.toLowerCase().endsWith('.psd');
  const isThumbnailImage = entry.file_type === 'image' && /\.(jpe?g|png|gif|webp|bmp|ico|icns)$/i.test(entry.name);

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

  // 화면에 보일 때 이미지/동영상 썸네일 자동 요청
  // - 전역 캐시 우선 조회 → 재방문 시 IPC 없이 즉시 표시
  // - 미조회 시 캐시 PNG '경로'만 받아 convertFileSrc로 asset 프로토콜 직접 로드
  //   (base64-over-IPC 제거: 메인스레드 부담·33% 용량팽창 없음, WebView 자체 캐시 활용)
  // - thumbnailSize 변경 시 300ms 디바운스 (빠른 줌 과부하 방지)
  useEffect(() => {
    if (!isVisible || isPending) return;
    const ft = entry.file_type;
    // PSD는 성능상 그리드 제외 (우클릭 미리보기로 대체)
    if (ft !== 'image' && ft !== 'video') return;

    const key = thumbKey(entry.path, thumbnailSize, entry.modified);
    const cached = getThumb(key);
    if (cached !== undefined) {
      // '' = 썸네일 없음 확정 → 아이콘 폴백
      setThumbnail(cached ? cached : null);
      return;
    }

    let cancelled = false;
    getPersistentThumbUrl(entry.path, ft, thumbnailSize, entry.modified, entry.size)
      .then(url => {
        if (cancelled || !url || failedThumbnailUrlsRef.current.has(url)) return;
        if (getThumb(key) === undefined) setThumbnail(prev => prev ?? url);
      })
      .catch(() => {});

    const sizeChanged = lastThumbnailSizeRef.current && lastThumbnailSizeRef.current !== thumbnailSize;
    lastThumbnailSizeRef.current = thumbnailSize;
    const delay = sizeChanged ? 300 : 0;

    let cancelFn: (() => void) | null = null;
    const timer = setTimeout(() => {
      const cmd = ft === 'image' ? 'get_file_thumbnail_path' : 'get_video_thumbnail_path';
      const { promise, cancel } = queuedInvoke<string | null>(cmd, { path: entry.path, size: thumbnailSize });
      cancelFn = cancel;
      promise
        .then(p => {
          const url = p ? convertFileSrc(p) : '';
          setThumb(key, url); // '' 도 캐시 → 불필요한 재요청 방지
          setThumbnail(url ? url : null);
        })
        .catch(() => {/* 취소 또는 실패 무시 (실패는 캐시하지 않음) */});
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (cancelFn) cancelFn();
    };
  }, [isVisible, isPending, entry.file_type, entry.path, entry.modified, entry.size, thumbnailSize, thumbnailReloadSeq]);

  const handleThumbnailLoad = useCallback(() => {
    if (!thumbnail) return;
    failedThumbnailUrlsRef.current.delete(thumbnail);
    setThumb(thumbKey(entry.path, thumbnailSize, entry.modified), thumbnail);
  }, [thumbnail, entry.path, entry.modified, thumbnailSize]);

  const handleThumbnailError = useCallback(() => {
    if (thumbnail) failedThumbnailUrlsRef.current.add(thumbnail);
    deleteThumb(thumbKey(entry.path, thumbnailSize, entry.modified));
    setThumbnail(null);
    setThumbnailReloadSeq(n => n + 1);
  }, [thumbnail, entry.path, entry.modified, thumbnailSize]);

  // 화면에 보일 때 이미지 규격 조회 (이미지만, PSD 제외 - 성능)
  useEffect(() => {
    if (!isVisible || isPending || entry.file_type !== 'image' || imageDims) return;

    const { promise, cancel } = queuedInvoke<[number, number] | null>(
      'get_image_dimensions', { path: entry.path }
    );
    promise
      .then(dims => { if (dims) setImageDims(dims); })
      .catch(() => {/* 취소 또는 실패 무시 */});

    return () => cancel();
  }, [isVisible, isPending, entry.file_type, entry.path, isPsd]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPending) return; // 복사 진행 중 클릭 무시
    onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey);
  }, [entry.path, onSelect, isPending]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPending) return; // 복사 진행 중 더블클릭 무시
    // Ctrl+더블클릭 → 폴더를 새 탭으로 열기
    if ((e.ctrlKey || e.metaKey) && (entry.is_dir || entry.file_type === 'archive') && onOpenInNewTab) {
      onOpenInNewTab(entry);
    } else {
      onOpen(entry);
    }
  }, [entry, onOpen, onOpenInNewTab, isPending]);

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
  // content-visibility용 추정 높이 (썸네일 + 파일명/크기 텍스트 영역)
  const estCardHeight = thumbnailSize + (hideText ? 12 : 48);
  const iconShadowStyle = getFileIconShadowStyle(themeVars);

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
        opacity: isPending ? 0.5 : isDimmed ? 0.35 : isCut ? 0.4 : 1,
        pointerEvents: isPending ? 'none' : undefined,
        // 대용량 폴더: 화면 밖 카드의 렌더링(레이아웃/페인트) 스킵 — DOM에는 유지되어
        // 박스드래그 선택(querySelectorAll)·IntersectionObserver 정상 동작
        ...(cvEnabled ? { contentVisibility: 'auto', containIntrinsicSize: `${cardWidth}px ${estCardHeight}px` } as React.CSSProperties : {}),
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={entry.is_dir && onHoverFolder ? () => onHoverFolder(entry.path) : undefined}
      onMouseDown={(e) => {
        e.stopPropagation();
        // 이름 변경 중에는 드래그 시작 금지 (의도치 않은 폴더 이동 방지)
        if (isRenaming) return;
        onDragMouseDown(e, entry.path);
      }}
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
        {/* 표시 우선순위: 이미지 썸네일 > 이미지 대기 표시 > 네이티브 아이콘 > lucide 아이콘 */}
        {thumbnail ? (
          <>
            <img
              src={thumbnail}
              alt={entry.name}
              className="w-full h-full object-contain"
              loading="lazy"
              draggable={false}
              onLoad={handleThumbnailLoad}
              onError={handleThumbnailError}
            />
            {/* 동영상 플레이 아이콘 오버레이 */}
            {entry.file_type === 'video' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div style={{
                  width: Math.max(20, thumbnailSize * 0.25), height: Math.max(20, thumbnailSize * 0.25),
                  borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Play size={Math.max(10, thumbnailSize * 0.14)} fill="#fff" color="#fff" />
                </div>
              </div>
            )}
          </>
        ) : isThumbnailImage ? (
          <div
            className="flex items-center justify-center"
            aria-label="썸네일 로딩 중"
            style={{
              width: Math.max(28, thumbnailSize * 0.68),
              height: Math.max(28, thumbnailSize * 0.68),
              border: `1.5px dashed ${themeVars?.border ?? '#94a3b8'}`,
              borderRadius: Math.max(6, thumbnailSize * 0.08),
              backgroundColor: themeVars?.surface ?? 'rgba(148, 163, 184, 0.08)',
              color: themeVars?.muted ?? '#94a3b8',
            }}
          >
            <RefreshCw
              className="animate-spin"
              size={Math.max(14, thumbnailSize * 0.18)}
              strokeWidth={1.8}
            />
          </div>
        ) : nativeIcon ? (
          <img
            src={nativeIcon}
            alt={entry.name}
            className="object-contain"
            style={{ width: thumbnailSize * 0.6, height: thumbnailSize * 0.6, ...iconShadowStyle }}
            draggable={false}
          />
        ) : (
          <div style={{ color: iconColor(entry.file_type, entry.name), ...iconShadowStyle }}>
            <FileTypeIcon
              fileType={entry.file_type}
              size={thumbnailSize * 0.6}
              fileName={entry.name}
            />
          </div>
        )}
        {/* 폴더 태그 뱃지 */}
        {/* 복사/이동 진행 중 서클 스피너 오버레이 */}
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 'inherit' }}>
            <svg
              className="animate-spin"
              style={{ width: Math.max(20, thumbnailSize * 0.3), height: Math.max(20, thumbnailSize * 0.3) }}
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        )}
        {tag && entry.is_dir && (
          <div
            className="absolute top-0.5 right-0.5 px-1 py-px rounded text-[8px] font-bold leading-tight truncate"
            style={{
              backgroundColor: themeVars?.accent ?? '#3b82f6',
              color: '#fff',
              maxWidth: thumbnailSize * 0.8,
            }}
          >
            {tag}
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
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className="w-full text-center text-xs px-1 rounded outline-none"
          style={{
            backgroundColor: themeVars?.surface2 ?? '#1f2937',
            color: themeVars?.text ?? '#e5e7eb',
            border: `1px solid ${themeVars?.accent ?? '#3b82f6'}`,
          }}
        />
      ) : !hideText ? (
        fuzzyHighlightIndices?.length ? (
          <FuzzyHighlightedName
            name={entry.name}
            indices={fuzzyHighlightIndices}
            themeVars={themeVars}
            className="w-full text-center text-xs leading-tight line-clamp-2 break-all"
            style={{ color: themeVars?.text ?? '#e5e7eb' }}
          />
        ) : (
          <div
            className="w-full text-center text-xs leading-tight line-clamp-2 break-all"
            style={{ color: themeVars?.text ?? '#e5e7eb' }}
            title={entry.name}
          >
            {entry.name}
          </div>
        )
      ) : null}

      {/* 크기 + 이미지 규격 */}
      {!hideText && (
        <div
          className="text-[10px] leading-none text-center"
          style={{ color: themeVars?.muted ?? '#94a3b8' }}
        >
          {formatSize(entry.size, entry.is_dir)}
          {imageDims && (
            <span className="ml-1 opacity-75">{imageDims[0]}×{imageDims[1]}</span>
          )}
        </div>
      )}
    </div>
  );
});
