import React, { memo } from 'react';
import { FileEntry } from '../../types';
import { ThemeVars } from './types';
import { formatSize } from './fileUtils';

interface StatusBarProps {
  entries: FileEntry[];
  selectedPaths: string[];
  themeVars: ThemeVars | null;
}

export default memo(function StatusBar({ entries, selectedPaths, themeVars }: StatusBarProps) {
  const totalCount = entries.length;
  const selectedCount = selectedPaths.length;

  // 선택된 파일들의 총 크기 계산 (폴더 제외)
  const selectedSize = entries
    .filter(e => selectedPaths.includes(e.path) && !e.is_dir)
    .reduce((sum, e) => sum + e.size, 0);

  const folderCount = entries.filter(e => e.is_dir).length;
  const fileCount = entries.length - folderCount;

  return (
    <div
      className="flex-shrink-0 flex items-center justify-between px-3 py-1 text-[10px] border-t"
      style={{
        backgroundColor: themeVars?.surface2 ?? '#1f2937',
        borderColor: themeVars?.border ?? '#334155',
        color: themeVars?.muted ?? '#94a3b8',
      }}
    >
      {/* 좌측: 전체 항목 정보 */}
      <span>
        {fileCount > 0 && `파일 ${fileCount}개`}
        {fileCount > 0 && folderCount > 0 && ', '}
        {folderCount > 0 && `폴더 ${folderCount}개`}
        {totalCount === 0 && '항목 없음'}
      </span>

      {/* 우측: 선택 정보 */}
      {selectedCount > 0 && (
        <span>
          {selectedCount}개 선택됨
          {selectedSize > 0 && ` · ${formatSize(selectedSize, false)}`}
        </span>
      )}
    </div>
  );
});
