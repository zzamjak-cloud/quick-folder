import React, { memo } from 'react';
import { Loader2 } from 'lucide-react';
import { ThemeVars } from './types';
import { FileTypeIcon, iconColor, formatSize } from './fileUtils';
import { ColumnPreviewData } from './hooks/useColumnView';

interface ColumnPreviewPanelProps {
  preview: ColumnPreviewData;
  themeVars: ThemeVars | null;
}

// 날짜 포맷 (한국어)
function formatDate(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 파일 종류 한국어 라벨
const typeLabels: Record<string, string> = {
  directory: '폴더',
  image: '이미지',
  video: '비디오',
  document: '문서',
  code: '코드',
  archive: '압축 파일',
  other: '기타',
};

export default memo(function ColumnPreviewPanel({ preview, themeVars }: ColumnPreviewPanelProps) {
  const { entry, thumbnail, loading } = preview;

  return (
    <div
      className="flex-shrink-0 h-full overflow-y-auto flex flex-col items-center p-4 gap-3"
      style={{
        width: 260,
        borderLeft: `1px solid ${themeVars?.border ?? '#334155'}`,
      }}
    >
      {/* 썸네일 / 큰 아이콘 */}
      <div
        className="flex items-center justify-center rounded-lg overflow-hidden"
        style={{
          width: 180,
          height: 180,
          backgroundColor: themeVars?.surface ?? '#111827',
        }}
      >
        {loading ? (
          <Loader2 size={28} className="animate-spin" style={{ color: themeVars?.accent ?? '#3b82f6' }} />
        ) : thumbnail ? (
          <img
            src={thumbnail}
            alt={entry.name}
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        ) : (
          <span style={{ color: iconColor(entry.file_type, entry.name) }}>
            <FileTypeIcon fileType={entry.file_type} size={64} fileName={entry.name} />
          </span>
        )}
      </div>

      {/* 파일명 */}
      <p
        className="text-sm font-medium text-center break-all leading-tight"
        style={{ color: themeVars?.text ?? '#e5e7eb' }}
      >
        {entry.name}
      </p>

      {/* 파일 정보 */}
      <div className="w-full flex flex-col gap-1.5 mt-1">
        <InfoRow label="종류" value={typeLabels[entry.file_type] ?? '기타'} themeVars={themeVars} />
        {!entry.is_dir && (
          <InfoRow label="크기" value={formatSize(entry.size, false)} themeVars={themeVars} />
        )}
        {entry.modified > 0 && (
          <InfoRow label="수정일" value={formatDate(entry.modified)} themeVars={themeVars} />
        )}
      </div>
    </div>
  );
});

// 정보 행 컴포넌트
function InfoRow({ label, value, themeVars }: { label: string; value: string; themeVars: ThemeVars | null }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="flex-shrink-0 w-10 text-right" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
        {label}
      </span>
      <span style={{ color: themeVars?.text ?? '#e5e7eb' }}>
        {value}
      </span>
    </div>
  );
}
