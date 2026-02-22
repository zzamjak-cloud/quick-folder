import React, { useState, useEffect, useRef } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { Loader2, AlertCircle } from 'lucide-react';
import { FileEntry, ThumbnailSize } from '../../types';
import { ThemeVars } from './types';
import { FileTypeIcon, iconColor, formatSize } from './fileUtils';
import FileCard from './FileCard';

interface FileGridProps {
  entries: FileEntry[];
  selectedPaths: string[];
  renamingPath: string | null;
  thumbnailSize: ThumbnailSize;
  viewMode: 'grid' | 'list' | 'details';
  focusedIndex: number;
  gridRef: React.RefObject<HTMLDivElement>;
  loading: boolean;
  error: string | null;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onSelectMany: (paths: string[]) => void;
  onDeselectAll: () => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  themeVars: ThemeVars | null;
}

// --- OS 드래그 훅 ---
function useDragToOS(dragPaths: string[]) {
  const startDrag = (e: React.MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;

    const onMouseMove = async (moveEvt: MouseEvent) => {
      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;
      if (Math.sqrt(dx * dx + dy * dy) > 6) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        try {
          const onEvent = new Channel<unknown>();
          await invoke('plugin:drag|start_drag', {
            item: dragPaths,
            image: { Raw: [] },
            onEvent,
          });
        } catch {
          // 드래그 실패 무시
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

  return startDrag;
}

// --- PSD 미리보기 훅 ---
function usePsdPreview(path: string) {
  const [psdThumbnail, setPsdThumbnail] = useState<string | null>(null);
  const [showPsdPreview, setShowPsdPreview] = useState(false);
  const [psdLoading, setPsdLoading] = useState(false);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showPsdPreview) {
      setShowPsdPreview(false);
      return;
    }
    setShowPsdPreview(true);
    if (!psdThumbnail) {
      setPsdLoading(true);
      invoke<string | null>('get_psd_thumbnail', { path, size: 80 })
        .then(b64 => { if (b64) setPsdThumbnail(`data:image/png;base64,${b64}`); })
        .catch(() => {/* PSD 썸네일 생성 실패 무시 */})
        .finally(() => setPsdLoading(false));
    }
  };

  return { psdThumbnail, showPsdPreview, psdLoading, toggle };
}

// --- ListRow 컴포넌트 ---
function ListRow({ entry, isSelected, isFocused, isRenaming, dragPaths, onSelect, onOpen, onContextMenu, onRenameCommit, themeVars }: {
  entry: FileEntry;
  isSelected: boolean;
  isFocused: boolean;
  isRenaming: boolean;
  dragPaths: string[];
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  themeVars: ThemeVars | null;
}) {
  const [renameValue, setRenameValue] = useState(entry.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const isPsd = entry.name.toLowerCase().endsWith('.psd');
  const { psdThumbnail, showPsdPreview, psdLoading, toggle: handlePsdToggle } = usePsdPreview(entry.path);
  const startDrag = useDragToOS(dragPaths);

  useEffect(() => { setRenameValue(entry.name); }, [entry.name]);
  useEffect(() => {
    if (isRenaming && inputRef.current) { inputRef.current.select(); }
  }, [isRenaming]);

  const bg = isSelected
    ? (themeVars?.accent20 ?? 'rgba(59,130,246,0.2)')
    : isFocused ? (themeVars?.surfaceHover ?? '#334155') : 'transparent';

  return (
    <>
      <div
        data-file-path={entry.path}
        className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer select-none"
        style={{ backgroundColor: bg }}
        onClick={(e) => { e.stopPropagation(); onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey); }}
        onDoubleClick={() => onOpen(entry)}
        onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e, [entry.path]); }}
        onMouseDown={startDrag}
      >
        {/* 아이콘 */}
        <span style={{ color: iconColor(entry.file_type), flexShrink: 0 }}>
          <FileTypeIcon fileType={entry.file_type} size={16} />
        </span>
        {/* 이름 */}
        {isRenaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onRenameCommit(entry.path, renameValue);
              if (e.key === 'Escape') onRenameCommit(entry.path, entry.name);
            }}
            onBlur={() => onRenameCommit(entry.path, renameValue)}
            onClick={e => e.stopPropagation()}
            className="flex-1 min-w-0 text-xs px-1 rounded outline-none"
            style={{ backgroundColor: themeVars?.surface2, color: themeVars?.text, border: `1px solid ${themeVars?.accent}` }}
          />
        ) : (
          <span className="flex-1 min-w-0 text-xs truncate" style={{ color: themeVars?.text }}>
            {entry.name}
          </span>
        )}
        {/* PSD 토글 버튼 */}
        {isPsd && (
          <button
            className="text-[9px] px-1 py-0.5 rounded shrink-0 opacity-80 hover:opacity-100 transition-opacity"
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
      {/* PSD 미리보기 영역 */}
      {isPsd && showPsdPreview && (
        <div className="ml-8 mb-1 rounded overflow-hidden" style={{ maxWidth: 120 }}>
          {psdLoading ? (
            <div className="flex items-center justify-center" style={{ height: 60 }}>
              <Loader2 size={16} className="animate-spin" style={{ color: themeVars?.accent ?? '#3b82f6' }} />
            </div>
          ) : psdThumbnail ? (
            <img
              src={psdThumbnail}
              alt={entry.name}
              className="w-full h-auto object-contain"
              draggable={false}
              style={{ maxHeight: 120 }}
            />
          ) : null}
        </div>
      )}
    </>
  );
}

// --- DetailsRow 컴포넌트 ---
function DetailsRow({ entry, isSelected, isFocused, isRenaming, dragPaths, onSelect, onOpen, onContextMenu, onRenameCommit, themeVars }: {
  entry: FileEntry;
  isSelected: boolean;
  isFocused: boolean;
  isRenaming: boolean;
  dragPaths: string[];
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  themeVars: ThemeVars | null;
}) {
  const [renameValue, setRenameValue] = useState(entry.name);
  const isPsd = entry.name.toLowerCase().endsWith('.psd');
  const { psdThumbnail, showPsdPreview, psdLoading, toggle: handlePsdToggle } = usePsdPreview(entry.path);
  const startDrag = useDragToOS(dragPaths);

  useEffect(() => { setRenameValue(entry.name); }, [entry.name]);

  const typeLabels: Record<string, string> = {
    directory: '폴더', image: '이미지', video: '비디오',
    document: '문서', code: '코드', archive: '압축', other: '기타',
  };

  function fmtDate(ms: number) {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  const bg = isSelected ? themeVars?.accent20 : isFocused ? themeVars?.surfaceHover : 'transparent';

  return (
    <>
      <tr
        data-file-path={entry.path}
        style={{ backgroundColor: bg ?? undefined }}
        className="cursor-pointer hover:opacity-80"
        onClick={(e) => { e.stopPropagation(); onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey); }}
        onDoubleClick={() => onOpen(entry)}
        onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e, [entry.path]); }}
        onMouseDown={startDrag}
      >
        <td className="px-3 py-1">
          <div className="flex items-center gap-2">
            <span style={{ color: iconColor(entry.file_type), flexShrink: 0 }}>
              <FileTypeIcon fileType={entry.file_type} size={14} />
            </span>
            {isRenaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onRenameCommit(entry.path, renameValue);
                  if (e.key === 'Escape') onRenameCommit(entry.path, entry.name);
                }}
                onBlur={() => onRenameCommit(entry.path, renameValue)}
                onClick={e => e.stopPropagation()}
                className="flex-1 min-w-0 px-1 rounded outline-none"
                style={{ backgroundColor: themeVars?.surface2, color: themeVars?.text, border: `1px solid ${themeVars?.accent}` }}
              />
            ) : (
              <span className="truncate text-xs" style={{ color: themeVars?.text }}>{entry.name}</span>
            )}
            {/* PSD 토글 버튼 */}
            {isPsd && (
              <button
                className="text-[9px] px-1 py-0.5 rounded shrink-0 opacity-80 hover:opacity-100 transition-opacity"
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
        </td>
        <td className="px-3 py-1 text-right text-xs" style={{ color: themeVars?.muted }}>
          {formatSize(entry.size, entry.is_dir)}
        </td>
        <td className="px-3 py-1 text-xs" style={{ color: themeVars?.muted }}>{fmtDate(entry.modified)}</td>
        <td className="px-3 py-1 text-xs" style={{ color: themeVars?.muted }}>{typeLabels[entry.file_type] ?? '기타'}</td>
      </tr>
      {/* PSD 미리보기 확장 행 */}
      {isPsd && showPsdPreview && (
        <tr style={{ backgroundColor: themeVars?.surface ?? '#111827' }}>
          <td colSpan={4} className="px-6 py-2">
            {psdLoading ? (
              <div className="flex items-center gap-2" style={{ color: themeVars?.muted }}>
                <Loader2 size={14} className="animate-spin" style={{ color: themeVars?.accent ?? '#3b82f6' }} />
                <span className="text-xs">PSD 미리보기 로딩 중...</span>
              </div>
            ) : psdThumbnail ? (
              <img
                src={psdThumbnail}
                alt={entry.name}
                className="h-auto object-contain rounded"
                draggable={false}
                style={{ maxHeight: 120, maxWidth: 200 }}
              />
            ) : null}
          </td>
        </tr>
      )}
    </>
  );
}

// --- DetailsTable 컴포넌트 ---
function DetailsTable({ entries, selectedPaths, focusedIndex, renamingPath, onSelect, onOpen, onContextMenu, onRenameCommit, themeVars }: {
  entries: FileEntry[];
  selectedPaths: string[];
  focusedIndex: number;
  renamingPath: string | null;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  themeVars: ThemeVars | null;
}) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr style={{ backgroundColor: themeVars?.surface2, color: themeVars?.muted }}>
          <th className="text-left px-3 py-1.5 font-medium">이름</th>
          <th className="text-right px-3 py-1.5 font-medium w-20">크기</th>
          <th className="text-left px-3 py-1.5 font-medium w-28">날짜</th>
          <th className="text-left px-3 py-1.5 font-medium w-16">형식</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, idx) => (
          <React.Fragment key={entry.path}>
            <DetailsRow
              entry={entry}
              isSelected={selectedPaths.includes(entry.path)}
              isFocused={focusedIndex === idx}
              isRenaming={renamingPath === entry.path}
              dragPaths={
                selectedPaths.includes(entry.path) && selectedPaths.length > 1
                  ? selectedPaths
                  : [entry.path]
              }
              onSelect={onSelect}
              onOpen={onOpen}
              onContextMenu={onContextMenu}
              onRenameCommit={onRenameCommit}
              themeVars={themeVars}
            />
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}

// --- 메인 FileGrid 컴포넌트 ---
export default function FileGrid({
  entries,
  selectedPaths,
  renamingPath,
  thumbnailSize,
  viewMode,
  focusedIndex,
  gridRef,
  loading,
  error,
  onSelect,
  onSelectMany,
  onDeselectAll,
  onOpen,
  onContextMenu,
  onRenameCommit,
  themeVars,
}: FileGridProps) {
  // 박스 선택 상태 (뷰포트 좌표)
  const [boxStart, setBoxStart] = useState<{ x: number; y: number } | null>(null);
  const [boxCurrent, setBoxCurrent] = useState<{ x: number; y: number } | null>(null);
  const boxStartRef = useRef<{ x: number; y: number } | null>(null);

  // 박스 선택 시작 (빈 영역 mousedown)
  const handleContainerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // 파일 요소 위에서 클릭하면 박스 선택 시작 안함
    if ((e.target as HTMLElement).closest('[data-file-path]')) return;

    const start = { x: e.clientX, y: e.clientY };
    boxStartRef.current = start;
    setBoxStart(start);
    setBoxCurrent(start);

    const onMouseMove = (moveEvt: MouseEvent) => {
      setBoxCurrent({ x: moveEvt.clientX, y: moveEvt.clientY });
    };

    const onMouseUp = (upEvt: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const s = boxStartRef.current;
      if (!s) { setBoxStart(null); setBoxCurrent(null); return; }

      const boxLeft = Math.min(s.x, upEvt.clientX);
      const boxTop = Math.min(s.y, upEvt.clientY);
      const boxRight = Math.max(s.x, upEvt.clientX);
      const boxBottom = Math.max(s.y, upEvt.clientY);
      const w = boxRight - boxLeft;
      const h = boxBottom - boxTop;

      if (w > 5 || h > 5) {
        // 교차하는 파일 요소 모두 선택
        const container = gridRef.current;
        const fileEls = container
          ? container.querySelectorAll('[data-file-path]')
          : document.querySelectorAll('[data-file-path]');

        const intersecting: string[] = [];
        fileEls.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (!(rect.right < boxLeft || rect.left > boxRight || rect.bottom < boxTop || rect.top > boxBottom)) {
            const fp = (el as HTMLElement).dataset.filePath;
            if (fp) intersecting.push(fp);
          }
        });
        onSelectMany(intersecting);
      } else {
        // 작은 드래그는 클릭으로 간주 → 선택 해제
        onDeselectAll();
      }

      boxStartRef.current = null;
      setBoxStart(null);
      setBoxCurrent(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // 컨테이너 클릭 시 선택 해제 (파일 요소가 아닌 경우)
  const handleContainerClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-file-path]')) return;
    onDeselectAll();
  };

  // 박스 선택 오버레이
  const renderBoxOverlay = () => {
    if (!boxStart || !boxCurrent) return null;
    const left = Math.min(boxStart.x, boxCurrent.x);
    const top = Math.min(boxStart.y, boxCurrent.y);
    const width = Math.abs(boxCurrent.x - boxStart.x);
    const height = Math.abs(boxCurrent.y - boxStart.y);
    return (
      <div
        style={{
          position: 'fixed',
          left,
          top,
          width,
          height,
          border: `1px solid ${themeVars?.accent ?? '#3b82f6'}`,
          backgroundColor: themeVars?.accent20 ?? 'rgba(59,130,246,0.15)',
          pointerEvents: 'none',
          zIndex: 9999,
        }}
      />
    );
  };

  // 로딩 상태
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2
          size={28}
          className="animate-spin"
          style={{ color: themeVars?.accent ?? '#3b82f6' }}
        />
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <AlertCircle size={28} style={{ color: '#f87171' }} />
        <p className="text-xs text-center max-w-xs" style={{ color: '#f87171' }}>
          {error}
        </p>
      </div>
    );
  }

  // 빈 폴더 상태
  if (entries.length === 0) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-2 select-none"
        style={{ color: themeVars?.muted ?? '#94a3b8' }}
        onClick={handleContainerClick}
        onMouseDown={handleContainerMouseDown}
      >
        <div className="text-4xl opacity-30">📂</div>
        <p className="text-xs">폴더가 비어 있습니다</p>
        {renderBoxOverlay()}
      </div>
    );
  }

  return (
    <>
      {renderBoxOverlay()}
      <div
        ref={gridRef}
        className="flex-1 overflow-y-auto p-3"
        style={{ backgroundColor: themeVars?.bg ?? '#0f172a' }}
        onMouseDown={handleContainerMouseDown}
        onClick={handleContainerClick}
      >
        {/* 그리드 뷰 */}
        {viewMode === 'grid' && (
          <div className="flex flex-wrap gap-2 content-start">
            {entries.map((entry, idx) => (
              <React.Fragment key={entry.path}>
                <FileCard
                  entry={entry}
                  isSelected={selectedPaths.includes(entry.path)}
                  isFocused={focusedIndex === idx}
                  isRenaming={renamingPath === entry.path}
                  thumbnailSize={thumbnailSize}
                  dragPaths={
                    selectedPaths.includes(entry.path) && selectedPaths.length > 1
                      ? selectedPaths
                      : [entry.path]
                  }
                  onSelect={onSelect}
                  onOpen={onOpen}
                  onContextMenu={onContextMenu}
                  onRenameCommit={onRenameCommit}
                  themeVars={themeVars}
                />
              </React.Fragment>
            ))}
          </div>
        )}

        {/* 리스트 뷰 */}
        {viewMode === 'list' && (
          <div className="flex flex-col gap-0.5">
            {entries.map((entry, idx) => (
              <React.Fragment key={entry.path}>
                <ListRow
                  entry={entry}
                  isSelected={selectedPaths.includes(entry.path)}
                  isFocused={focusedIndex === idx}
                  isRenaming={renamingPath === entry.path}
                  dragPaths={
                    selectedPaths.includes(entry.path) && selectedPaths.length > 1
                      ? selectedPaths
                      : [entry.path]
                  }
                  onSelect={onSelect}
                  onOpen={onOpen}
                  onContextMenu={onContextMenu}
                  onRenameCommit={onRenameCommit}
                  themeVars={themeVars}
                />
              </React.Fragment>
            ))}
          </div>
        )}

        {/* 세부사항 뷰 */}
        {viewMode === 'details' && (
          <DetailsTable
            entries={entries}
            selectedPaths={selectedPaths}
            focusedIndex={focusedIndex}
            renamingPath={renamingPath}
            onSelect={onSelect}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
            onRenameCommit={onRenameCommit}
            themeVars={themeVars}
          />
        )}
      </div>
    </>
  );
}
