import React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { FileEntry } from '../../types';
import { ThemeVars } from './types';
import FileCard from './FileCard';

interface FileGridProps {
  entries: FileEntry[];
  selectedPaths: string[];
  renamingPath: string | null;
  thumbnailSize: 80 | 120 | 160;
  loading: boolean;
  error: string | null;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  themeVars: ThemeVars | null;
}

export default function FileGrid({
  entries,
  selectedPaths,
  renamingPath,
  thumbnailSize,
  loading,
  error,
  onSelect,
  onOpen,
  onContextMenu,
  onRenameCommit,
  themeVars,
}: FileGridProps) {
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
      >
        <div className="text-4xl opacity-30">📂</div>
        <p className="text-xs">폴더가 비어 있습니다</p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto p-3"
      style={{ backgroundColor: themeVars?.bg ?? '#0f172a' }}
    >
      <div
        className="flex flex-wrap gap-2 content-start"
      >
        {entries.map(entry => (
          <React.Fragment key={entry.path}>
            <FileCard
              entry={entry}
              isSelected={selectedPaths.includes(entry.path)}
              isRenaming={renamingPath === entry.path}
              thumbnailSize={thumbnailSize}
              onSelect={onSelect}
              onOpen={onOpen}
              onContextMenu={onContextMenu}
              onRenameCommit={onRenameCommit}
              themeVars={themeVars}
            />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
