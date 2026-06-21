import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileEntry, DuplicateFileGroup } from '../../types';
import { ThemeVars } from './types';
import { Files, Loader2, Trash2, X } from 'lucide-react';
import { formatSize } from './fileUtils';
import { FileTypeIcon } from './fileUtils';
import { thumbKey, getThumb, setThumb, getPersistentThumbUrl } from './hooks/thumbnailCache';
import { invokeTauriCommand as invoke } from '../../utils/tauriInvoke';
import ContextMenu from './ContextMenu';
import { ContextMenuSection } from './types';
import { useEscapeKey } from './hooks/useEscapeKey';

interface DuplicateFilesModalProps {
  rootPath: string;
  onClose: () => void;
  onSelect: (entry: FileEntry) => void;
  onDelete: (path: string) => Promise<void>;
  themeVars: ThemeVars | null;
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
    const cached = getThumb(thumbKey(entry.path, thumbSize, entry.modified));
    return cached ? cached : null;
  });
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
    const observer = new IntersectionObserver(
      ([oe]) => { if (oe.isIntersecting) setIsVisible(true); },
      { threshold: 0.1 }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const ft = entry.file_type;
    if (ft !== 'image' && ft !== 'video') return;

    const key = thumbKey(entry.path, thumbSize, entry.modified);
    const cached = getThumb(key);
    if (cached !== undefined) {
      setThumbnail(cached ? cached : null);
      return;
    }

    let cancelled = false;
    getPersistentThumbUrl(entry.path, ft, thumbSize, entry.modified, entry.size)
      .then(url => {
        if (cancelled) return;
        setThumb(key, url ?? '');
        setThumbnail(url);
      })
      .catch(() => {
        if (!cancelled) {
          setThumb(key, '');
          setThumbnail(null);
        }
      });

    return () => { cancelled = true; };
  }, [isVisible, entry]);

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
          <img src={thumbnail} alt={entry.name} className="max-w-full max-h-full object-contain" draggable={false} />
        ) : (
          <FileTypeIcon fileType={entry.file_type} size={32} />
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
      const res = await invoke<DuplicateFileGroup[]>('find_duplicate_files', { root: rootPath });
      if (reqId !== requestIdRef.current) return;
      setGroups(res);
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
    const confirmed = window.confirm(`"${entry.name}" 파일을 휴지통으로 이동할까요?`);
    if (!confirmed) return;
    try {
      await onDelete(entry.path);
      setGroups(prev => prev
        .map(g => ({ ...g, files: g.files.filter(f => f.path !== entry.path) }))
        .filter(g => g.files.length >= 2)
      );
    } catch (e) {
      window.alert(`삭제 실패: ${e}`);
    }
  };

  const contextMenuSections: ContextMenuSection[] = contextMenu ? [{
    id: 'duplicate-item',
    items: [{
      id: 'delete',
      icon: <Trash2 size={13} style={{ color: '#f87171' }} />,
      label: '삭제',
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
              <div className="text-sm font-medium truncate" style={{ color: textColor }}>중복 파일 찾기</div>
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
                하위 폴더를 검색하는 중...
              </div>
            ) : error ? (
              <div className="py-12 text-center text-xs" style={{ color: '#f87171' }}>
                {error}
              </div>
            ) : groups.length === 0 ? (
              <div className="py-12 text-center text-xs" style={{ color: mutedColor }}>
                중복된 파일이 없습니다
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="text-[10px]" style={{ color: mutedColor }}>
                  {groups.length}개 그룹 · 총 {totalDuplicates}개 파일
                </div>
                {groups.map((group, gi) => (
                  <div key={`${group.size}-${gi}`}>
                    <div className="text-[10px] mb-1.5" style={{ color: mutedColor }}>
                      동일 파일 {group.files.length}개 · {formatSize(group.size, false)}
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
