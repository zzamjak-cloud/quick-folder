import React, { useState, useEffect, useRef, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FileEntry, DuplicateFileGroup } from '../../types';
import { ThemeVars } from './types';
import { Files, Loader2, Trash2, X } from 'lucide-react';
import { formatSize } from './fileUtils';
import { FileTypeIcon } from './fileUtils';
import { thumbKey, getThumb, setThumb, deleteThumb, getPersistentThumbUrl } from './hooks/thumbnailCache';
import { invokeTauriCommand as invoke, queuedInvokeLow } from '../../utils/tauriInvoke';
import ContextMenu from './ContextMenu';
import { ContextMenuSection } from './types';
import { useEscapeKey } from './hooks/useEscapeKey';
import type { TranslationKey } from '../../utils/i18n';
import { mediaCommands } from '../../utils/tauriCommands';

interface DuplicateFilesModalProps {
  rootPath: string;
  onClose: () => void;
  onSelect: (entry: FileEntry) => void;
  onDelete: (path: string) => Promise<void>;
  themeVars: ThemeVars | null;
  t: (key: TranslationKey) => string;
}

function formatMessage(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function isFileEntry(value: unknown): value is FileEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<FileEntry>;
  return (
    typeof entry.name === 'string'
    && typeof entry.path === 'string'
    && typeof entry.is_dir === 'boolean'
    && typeof entry.size === 'number'
    && typeof entry.modified === 'number'
    && typeof entry.file_type === 'string'
  );
}

function normalizeDuplicateGroups(value: unknown): DuplicateFileGroup[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(group => {
      if (!group || typeof group !== 'object') return null;
      const source = group as Partial<DuplicateFileGroup>;
      const files = Array.isArray(source.files) ? source.files.filter(isFileEntry) : [];
      if (typeof source.size !== 'number' || files.length < 2) return null;
      return { size: source.size, files };
    })
    .filter((group): group is DuplicateFileGroup => group !== null);
}

function getThumbnailKind(entry: FileEntry): 'image' | 'video' | 'psd' | null {
  const name = entry.name.toLowerCase();
  if (/\.(psd|psb)$/.test(name)) return 'psd';
  if (entry.file_type === 'image' || /\.(jpe?g|png|gif|webp|bmp|ico|icns|tiff?)$/.test(name)) {
    return 'image';
  }
  if (entry.file_type === 'video' || /\.(mp4|mov|avi|mkv|webm)$/.test(name)) return 'video';
  return null;
}

/** 중복 탐색 결과 썸네일 카드 */
function DuplicateThumb({
  entry,
  rootPath,
  themeVars,
  onSelect,
  onContextMenu,
}: {
  entry: FileEntry;
  rootPath: string;
  themeVars: ThemeVars | null;
  onSelect: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
}) {
  const thumbSize = 80;
  const [thumbnail, setThumbnail] = useState<string | null>(() => {
    const cached = getThumb(thumbKey(entry.path, thumbSize, entry.modified, entry.size, entry.identity));
    return cached ? cached : null;
  });
  const [thumbnailReloadSeq, setThumbnailReloadSeq] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const getRelativePath = (fullPath: string) => {
    if (fullPath.startsWith(rootPath)) {
      const rel = fullPath.slice(rootPath.length);
      return rel.startsWith('/') || rel.startsWith('\\') ? rel.slice(1) : rel;
    }
    return fullPath;
  };

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([oe]) => { if (oe.isIntersecting) setIsVisible(true); },
      { threshold: 0.1 }
    );
    const fallbackTimer = window.setTimeout(() => setIsVisible(true), 150);
    if (cardRef.current) observer.observe(cardRef.current);
    return () => {
      window.clearTimeout(fallbackTimer);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const thumbKind = getThumbnailKind(entry);
    if (!thumbKind) return;

    const key = thumbKey(entry.path, thumbSize, entry.modified, entry.size, entry.identity);

    // SVG: Rust 디코더 미지원 → 원본을 asset URL로 직접 표시
    if (/\.svg$/i.test(entry.name)) {
      const svgUrl = convertFileSrc(entry.path);
      setThumb(key, svgUrl);
      setThumbnail(svgUrl);
      return;
    }

    const cached = getThumb(key);
    if (cached) {
      setThumbnail(cached);
      return;
    }
    if (cached === '') deleteThumb(key);

    const thumbSourcePath = entry.path;
    const thumbCommand = thumbKind === 'image'
      ? 'get_file_thumbnail_path'
      : thumbKind === 'psd'
        ? 'get_psd_thumbnail_path'
        : 'get_video_thumbnail_path';

    let cancelled = false;
    const cancelThumbs: (() => void)[] = [];

    const requestThumbnailPath = () => {
      const { promise, cancel } = queuedInvokeLow<string | null>(thumbCommand, {
        path: thumbSourcePath,
        size: thumbSize,
      });
      cancelThumbs.push(cancel);
      return promise;
    };

    if (thumbKind !== 'psd') {
      getPersistentThumbUrl(entry.path, thumbKind, thumbSize, entry.modified, entry.size, entry.identity)
        .then(url => {
          if (cancelled || !url) return;
          const latestCached = getThumb(key);
          if (latestCached === undefined || latestCached === '') setThumbnail(prev => prev ?? url);
        })
        .catch(() => {});
    }

    requestThumbnailPath()
      .then(url => {
        if (cancelled) return;
        if (url) return url;
        return mediaCommands.invalidateThumbnailCache([thumbSourcePath])
          .catch(() => {})
          .then(() => {
            if (cancelled) return null;
            deleteThumb(key);
            return requestThumbnailPath().catch(() => null);
          });
      })
      .then(url => {
        if (cancelled || url === undefined) return;
        const assetUrl = url ? convertFileSrc(url) : '';
        if (assetUrl) setThumb(key, assetUrl);
        setThumbnail(assetUrl ? assetUrl : null);
      })
      .catch(() => {
        if (!cancelled) setThumbnail(null);
      });

    return () => {
      cancelled = true;
      cancelThumbs.forEach(cancel => cancel());
    };
  }, [isVisible, entry, thumbnailReloadSeq]);

  const handleThumbnailError = useCallback(() => {
    deleteThumb(thumbKey(entry.path, thumbSize, entry.modified, entry.size, entry.identity));
    setThumbnail(null);
    setThumbnailReloadSeq(seq => seq + 1);
  }, [entry.path, entry.modified, entry.size, entry.identity]);

  const relPath = getRelativePath(entry.path);
  const dirPart = relPath.includes('/') || relPath.includes('\\')
    ? relPath.replace(/[/\\][^/\\]*$/, '')
    : '';
  const textColor = themeVars?.text ?? '#f8fafc';
  const mutedColor = themeVars?.muted ?? '#94a3b8';
  const borderColor = themeVars?.border ?? '#334155';
  const surfaceHover = themeVars?.surfaceHover ?? '#334155';

  return (
    <div
      ref={cardRef}
      className="flex-shrink-0 w-[120px] rounded-md cursor-pointer transition-colors"
      style={{ border: `1px solid ${borderColor}` }}
      onClick={() => onSelect(entry)}
      onContextMenu={e => onContextMenu(e, entry)}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = surfaceHover; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
    >
      <div
        className="flex items-center justify-center overflow-hidden rounded-t-md"
        style={{ width: 120, height: 80, backgroundColor: themeVars?.surface ?? '#1e293b' }}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={entry.name}
            className="max-w-full max-h-full object-contain"
            draggable={false}
            onError={handleThumbnailError}
          />
        ) : (
          <FileTypeIcon fileType={entry.file_type} size={32} fileName={entry.name} />
        )}
      </div>
      <div className="px-1.5 py-1">
        <div className="text-[10px] truncate" style={{ color: textColor }} title={entry.name}>{entry.name}</div>
        {dirPart && (
          <div className="text-[9px] truncate" style={{ color: mutedColor }} title={dirPart}>{dirPart}</div>
        )}
      </div>
    </div>
  );
}

export default function DuplicateFilesModal({
  rootPath,
  onClose,
  onSelect,
  onDelete,
  themeVars,
  t,
}: DuplicateFilesModalProps) {
  const [groups, setGroups] = useState<DuplicateFileGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FileEntry } | null>(null);
  const requestIdRef = useRef(0);

  const scanDuplicates = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<unknown>('find_duplicate_files', { root: rootPath });
      if (reqId !== requestIdRef.current) return;
      setGroups(normalizeDuplicateGroups(res));
    } catch (e) {
      if (reqId !== requestIdRef.current) return;
      setError(String(e));
      setGroups([]);
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  }, [rootPath]);

  useEscapeKey(onClose);

  useEffect(() => {
    scanDuplicates();
    return () => { requestIdRef.current++; };
  }, [scanDuplicates]);

  const handleSelect = (entry: FileEntry) => {
    onSelect(entry);
    onClose();
  };

  const handleDeleteFromMenu = async (entry: FileEntry) => {
    setContextMenu(null);
    const confirmed = window.confirm(formatMessage(t('duplicateFinder.confirmDelete'), { name: entry.name }));
    if (!confirmed) return;
    try {
      await onDelete(entry.path);
      setGroups(prev => prev
        .map(g => ({ ...g, files: g.files.filter(f => f.path !== entry.path) }))
        .filter(g => g.files.length >= 2)
      );
    } catch (e) {
      window.alert(formatMessage(t('duplicateFinder.deleteFailed'), { message: String(e) }));
    }
  };

  const contextMenuSections: ContextMenuSection[] = contextMenu ? [{
    id: 'duplicate-item',
    items: [{
      id: 'delete',
      icon: <Trash2 size={13} style={{ color: '#f87171' }} />,
      label: t('duplicateFinder.delete'),
      onClick: () => { if (contextMenu) void handleDeleteFromMenu(contextMenu.entry); },
    }],
  }] : [];

  const bgColor = themeVars?.surface ?? '#1e293b';
  const borderColor = themeVars?.border ?? '#334155';
  const textColor = themeVars?.text ?? '#f8fafc';
  const mutedColor = themeVars?.muted ?? '#94a3b8';

  const totalDuplicates = groups.reduce((sum, g) => sum + g.files.length, 0);

  return (
    <>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      >
        <div
          className="w-[720px] rounded-lg shadow-2xl overflow-hidden flex flex-col"
          style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}`, maxHeight: '75vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${borderColor}` }}>
            <Files size={16} style={{ color: mutedColor, flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: textColor }}>{t('duplicateFinder.title')}</div>
              <div className="text-[10px] truncate" style={{ color: mutedColor }} title={rootPath}>{rootPath}</div>
            </div>
            {loading && <Loader2 size={16} className="animate-spin" style={{ color: mutedColor }} />}
            <button className="p-1 hover:opacity-70" style={{ color: mutedColor }} onClick={onClose}>
              <X size={16} />
            </button>
          </div>

          {/* 본문 */}
          <div className="overflow-y-auto flex-1 px-4 py-3" style={{ maxHeight: 'calc(75vh - 88px)' }}>
            {loading ? (
              <div className="py-12 text-center text-xs" style={{ color: mutedColor }}>
                {t('duplicateFinder.loading')}
              </div>
            ) : error ? (
              <div className="py-12 text-center text-xs" style={{ color: '#f87171' }}>
                {error}
              </div>
            ) : groups.length === 0 ? (
              <div className="py-12 text-center text-xs" style={{ color: mutedColor }}>
                {t('duplicateFinder.empty')}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="text-[10px]" style={{ color: mutedColor }}>
                  {formatMessage(t('duplicateFinder.summary'), { groups: groups.length, files: totalDuplicates })}
                </div>
                {groups.map((group, gi) => (
                  <div key={`${group.size}-${gi}`}>
                    <div className="text-[10px] mb-1.5" style={{ color: mutedColor }}>
                      {formatMessage(t('duplicateFinder.groupLabel'), {
                        count: group.files.length,
                        size: formatSize(group.size, false),
                      })}
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {group.files.map(file => (
                        <DuplicateThumb
                          key={file.path}
                          entry={file}
                          rootPath={rootPath}
                          themeVars={themeVars}
                          onSelect={handleSelect}
                          onContextMenu={(e, entry) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({ x: e.clientX, y: e.clientY, entry });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 하단 힌트 */}
          <div
            className="px-4 py-2 text-[10px] flex items-center gap-3"
            style={{ borderTop: `1px solid ${borderColor}`, color: mutedColor }}
          >
            <span>클릭: 해당 위치로 이동</span>
            <span>우클릭: 삭제</span>
            <span>Escape 닫기</span>
          </div>
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sections={contextMenuSections}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
