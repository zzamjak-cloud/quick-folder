import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { ArrowUpRight, GripVertical, Trash2, X } from 'lucide-react';
import { getFileName } from '../utils/pathUtils';
import { DRAG_IMAGE, FileTypeIcon, iconColor } from './FileExplorer/fileUtils';

type DragCallbackResult = {
  result: 'Dropped' | 'Cancel' | string;
  cursorPos?: unknown;
};

interface TempFileTrayProps {
  paths: string[];
  onRemove: (paths: string[], source: 'trash' | 'drag') => void;
  onClear: () => void;
  onError?: (message: string) => void;
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm']);
const ARCHIVE_EXTS = new Set(['zip', 'rar', '7z', 'tar', 'gz']);
const CODE_EXTS = new Set(['js', 'jsx', 'ts', 'tsx', 'json', 'html', 'css', 'scss', 'py', 'rs', 'go', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp', 'cs', 'sh']);
const DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md', 'rtf']);

function getExtension(path: string) {
  const name = getFileName(path);
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function getFileType(path: string) {
  const ext = getExtension(path);
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (ARCHIVE_EXTS.has(ext)) return 'archive';
  if (CODE_EXTS.has(ext)) return 'code';
  if (DOC_EXTS.has(ext)) return 'document';
  return 'other';
}

function TrayThumbnail({ path }: { path: string }) {
  const fileType = useMemo(() => getFileType(path), [path]);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    setSrc(null);
    const cmd = fileType === 'image'
      ? 'get_file_thumbnail'
      : fileType === 'video'
        ? 'get_video_thumbnail'
        : 'get_file_icon';

    let cancelled = false;
    invoke<string | null>(cmd, { path, size: 160 })
      .then((b64) => {
        if (!cancelled && b64) setSrc(`data:image/png;base64,${b64}`);
      })
      .catch(() => { if (!cancelled) setSrc(null); });

    return () => { cancelled = true; };
  }, [fileType, path]);

  if (src) {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        className="h-full w-full rounded object-cover"
      />
    );
  }

  return (
    <div
      className="flex h-full w-full items-center justify-center rounded bg-[var(--qf-surface)]"
      style={{ color: iconColor(fileType, getFileName(path)) }}
    >
      <FileTypeIcon fileType={fileType} fileName={getFileName(path)} size={34} />
    </div>
  );
}

export default function TempFileTray({ paths, onRemove, onClear, onError }: TempFileTrayProps) {
  const startDrag = useCallback((e: React.MouseEvent, dragPaths: string[]) => {
    if (e.button !== 0 || dragPaths.length === 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;
    let onMove: (ev: MouseEvent) => void;
    let onUp: () => void;

    const cleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    onMove = (ev: MouseEvent) => {
      if (started) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.sqrt(dx * dx + dy * dy) < 5) return;
      started = true;
      cleanup();

      const onEvent = new Channel<DragCallbackResult>((event) => {
        if (event.result === 'Dropped') {
          onRemove(dragPaths, 'drag');
        }
      });

      invoke('plugin:drag|start_drag', { item: dragPaths, image: DRAG_IMAGE, onEvent })
        .catch((err) => {
          console.error('트레이 OS 드래그 실패:', err);
          onError?.('파일 드래그를 시작하지 못했습니다.');
        });
    };

    onUp = () => cleanup();

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [onError, onRemove]);

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-[var(--qf-bg)]">
      <div className="h-full w-full p-2">
        <div className="flex h-full w-full flex-col rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--qf-border)] px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--qf-text)]">임시 트레이</div>
              <div className="text-[11px] text-[var(--qf-muted)]">{paths.length}개</div>
            </div>
            <button
              type="button"
              className="rounded p-1 text-[var(--qf-muted)] hover:bg-[var(--qf-surface-hover)] hover:text-[var(--qf-text)]"
              onClick={onClear}
              title="닫기"
            >
              <X size={16} />
            </button>
          </div>

          <div
            className="m-3 flex cursor-grab items-center gap-2 rounded-md border border-dashed border-[var(--qf-accent-50)] bg-[var(--qf-accent-20)] px-3 py-2 active:cursor-grabbing"
            onMouseDown={(e) => startDrag(e, paths)}
            title="전체 파일 드래그"
          >
            <GripVertical size={16} className="shrink-0 text-[var(--qf-accent)]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-[var(--qf-text)]">전체 파일</div>
              <div className="text-[11px] text-[var(--qf-muted)]">{paths.length}개</div>
            </div>
            <ArrowUpRight size={15} className="shrink-0 text-[var(--qf-muted)]" />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <div className="grid grid-cols-2 gap-2">
              {paths.map((path) => (
                <div
                  key={path}
                  className="group min-w-0 cursor-grab rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface-2)] p-1.5 active:cursor-grabbing"
                  onMouseDown={(e) => startDrag(e, [path])}
                  title={path}
                >
                  <div className="relative aspect-square overflow-hidden rounded bg-[var(--qf-bg)]">
                    <TrayThumbnail path={path} />
                    <div className="absolute left-1 top-1 rounded bg-black/45 p-0.5 text-white opacity-0 group-hover:opacity-100">
                      <GripVertical size={12} />
                    </div>
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded bg-black/55 p-1 text-white opacity-0 hover:bg-black/75 group-hover:opacity-100"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => onRemove([path], 'trash')}
                      title="제거"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="mt-1 truncate px-0.5 text-[11px] text-[var(--qf-text)]">{getFileName(path)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end border-t border-[var(--qf-border)] px-3 py-2">
            <button
              type="button"
              className="rounded border border-[var(--qf-border)] px-3 py-1.5 text-xs text-[var(--qf-muted)] hover:bg-[var(--qf-surface-hover)] hover:text-[var(--qf-text)]"
              onClick={onClear}
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
