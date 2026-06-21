import type { CSSProperties, RefObject } from 'react';
import type { FileEntry } from '../../types';
import type { ThemeVars } from './types';
import { formatSize } from './fileUtils';

type ImageDimension = { width: number; height: number };
type CompressQuality = 'low' | 'medium' | 'high';

interface ImageCompressPanelProps {
  themeVars: ThemeVars | null;
  panelStyle: CSSProperties;
  buttonStyle: CSSProperties;
  originalScrollRef: RefObject<HTMLDivElement | null>;
  compressedScrollRef: RefObject<HTMLDivElement | null>;
  previewImageData: string;
  previewEntry?: FileEntry | null;
  imageDims: ImageDimension | null;
  compressQuality: CompressQuality;
  onCompressQualityChange: (quality: CompressQuality) => void;
  compressPreviewLoading: boolean;
  compressedPreviewData: string | null;
  compressedPreviewSize: number | null;
  onSyncPreviewScroll: (from: 'original' | 'compressed') => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}

interface ImageResizePanelProps {
  themeVars: ThemeVars | null;
  panelStyle: CSSProperties;
  buttonStyle: CSSProperties;
  previewImageData: string;
  imageDims: ImageDimension | null;
  resizeWidth: string;
  resizeHeight: string;
  keepRatio: boolean;
  onResizeWidthChange: (value: string) => void;
  onResizeHeightChange: (value: string) => void;
  onKeepRatioChange: (value: boolean) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}

const compressOptions: { value: CompressQuality; label: string }[] = [
  { value: 'low', label: '고품질' },
  { value: 'medium', label: '균형' },
  { value: 'high', label: '고압축' },
];

function getCompareImageStyle(imageDims: ImageDimension | null): CSSProperties {
  return imageDims
    ? { width: imageDims.width, height: 'auto', maxWidth: 'none', maxHeight: 'none' }
    : { maxWidth: 'none', maxHeight: 'none' };
}

function getResizedPreviewStyle(
  imageDims: ImageDimension | null,
  resizeWidth: string,
  resizeHeight: string
): CSSProperties {
  return {
    width: `${Math.max(1, Number(resizeWidth) || imageDims?.width || 1)}px`,
    height: `${Math.max(1, Number(resizeHeight) || imageDims?.height || 1)}px`,
    maxWidth: 'none',
    maxHeight: 'none',
    objectFit: 'fill',
  };
}

function getCompressedDelta(previewEntry: FileEntry | null | undefined, compressedPreviewSize: number | null): number | null {
  const originalSize = previewEntry?.size ?? null;
  return originalSize && compressedPreviewSize != null
    ? Math.round(((compressedPreviewSize - originalSize) / originalSize) * 100)
    : null;
}

export function ImageCompressPanel({
  themeVars,
  panelStyle,
  buttonStyle,
  originalScrollRef,
  compressedScrollRef,
  previewImageData,
  previewEntry,
  imageDims,
  compressQuality,
  onCompressQualityChange,
  compressPreviewLoading,
  compressedPreviewData,
  compressedPreviewSize,
  onSyncPreviewScroll,
  onCancel,
  onSave,
  saving,
}: ImageCompressPanelProps) {
  const compareImageStyle = getCompareImageStyle(imageDims);
  const compressedDelta = getCompressedDelta(previewEntry, compressedPreviewSize);
  const originalSizeLabel = previewEntry ? formatSize(previewEntry.size, false) : '-';
  const compressedSizeLabel = compressPreviewLoading
    ? '계산 중...'
    : compressedPreviewSize != null
      ? formatSize(compressedPreviewSize, false)
      : '-';

  return (
    <div className="grid h-full min-h-0 w-full gap-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 300px' }}>
      <div className="flex min-h-0 min-w-0 flex-col rounded-lg p-3" style={panelStyle}>
        <div className="mb-2 flex items-center justify-between text-xs" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
          <span>원본</span>
          <span>{originalSizeLabel}</span>
        </div>
        <div
          ref={originalScrollRef}
          className="flex-1 overflow-auto rounded"
          style={{ background: '#05070a' }}
          onScroll={() => onSyncPreviewScroll('original')}
        >
          <img src={previewImageData} alt="원본" draggable={false} style={compareImageStyle} />
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-col rounded-lg p-3" style={panelStyle}>
        <div className="mb-2 flex items-center justify-between text-xs" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
          <span>압축 이미지</span>
          <span>{compressedSizeLabel}</span>
        </div>
        <div
          ref={compressedScrollRef}
          className="flex-1 overflow-auto rounded"
          style={{ background: '#05070a' }}
          onScroll={() => onSyncPreviewScroll('compressed')}
        >
          <img src={compressedPreviewData ?? previewImageData} alt="압축 이미지" draggable={false} style={compareImageStyle} />
        </div>
      </div>
      <div className="flex min-h-0 flex-col rounded-lg p-4" style={panelStyle}>
        <div className="mb-3 text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>압축 단계</div>
        <div className="grid grid-cols-3 gap-2">
          {compressOptions.map((option) => (
            <button
              key={option.value}
              className="rounded px-2 py-2 text-xs"
              onClick={() => onCompressQualityChange(option.value)}
              style={{
                border: `1px solid ${option.value === compressQuality ? (themeVars?.accent ?? '#4ade80') : (themeVars?.border ?? '#444')}`,
                background: option.value === compressQuality ? `${themeVars?.accent ?? '#4ade80'}22` : 'transparent',
                color: themeVars?.text ?? '#e5e7eb',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-2 text-xs" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
          <div className="flex justify-between"><span>원본 용량</span><span>{originalSizeLabel}</span></div>
          <div className="flex justify-between"><span>예상 용량</span><span>{compressedSizeLabel}</span></div>
          <div className="flex justify-between"><span>변화</span><span>{compressedDelta == null ? '-' : `${compressedDelta > 0 ? '+' : ''}${compressedDelta}%`}</span></div>
        </div>
        <div className="mt-auto flex gap-2">
          <button className="flex-1 rounded px-3 py-2 text-sm" style={buttonStyle} onClick={onCancel}>취소</button>
          <button className="flex-1 rounded px-3 py-2 text-sm font-semibold" style={{ background: themeVars?.accent ?? '#4ade80', color: '#000' }} onClick={onSave} disabled={saving}>저장</button>
        </div>
      </div>
    </div>
  );
}

export function ImageResizePanel({
  themeVars,
  panelStyle,
  buttonStyle,
  previewImageData,
  imageDims,
  resizeWidth,
  resizeHeight,
  keepRatio,
  onResizeWidthChange,
  onResizeHeightChange,
  onKeepRatioChange,
  onCancel,
  onSave,
  saving,
}: ImageResizePanelProps) {
  const compareImageStyle = getCompareImageStyle(imageDims);
  const resizedPreviewStyle = getResizedPreviewStyle(imageDims, resizeWidth, resizeHeight);

  return (
    <div className="grid h-full min-h-0 w-full gap-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 300px' }}>
      <div className="flex min-h-0 min-w-0 flex-col rounded-lg p-3" style={panelStyle}>
        <div className="mb-2 flex items-center justify-between text-xs" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
          <span>원본</span>
          <span>{imageDims ? `${imageDims.width} x ${imageDims.height}px` : '-'}</span>
        </div>
        <div className="flex-1 overflow-auto rounded" style={{ background: '#05070a' }}>
          <img src={previewImageData} alt="원본" draggable={false} style={compareImageStyle} />
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-col rounded-lg p-3" style={panelStyle}>
        <div className="mb-2 flex items-center justify-between text-xs" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
          <span>크기조정</span>
          <span>{resizeWidth || '-'} x {resizeHeight || '-'}px</span>
        </div>
        <div className="flex-1 overflow-auto rounded" style={{ background: '#05070a' }}>
          <img src={previewImageData} alt="크기조정" draggable={false} style={resizedPreviewStyle} />
        </div>
      </div>
      <div className="flex min-h-0 flex-col rounded-lg p-4" style={panelStyle}>
        <div className="mb-3 text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>크기조정</div>
        <div className="flex items-center gap-2">
          <input
            value={resizeWidth}
            onChange={(e) => {
              const next = e.target.value.replace(/[^\d]/g, '');
              onResizeWidthChange(next);
              if (keepRatio && imageDims && next) {
                const width = Number(next);
                if (width > 0) onResizeHeightChange(String(Math.max(1, Math.round((width * imageDims.height) / imageDims.width))));
              }
            }}
            className="w-24 rounded px-2 py-2 text-sm"
            style={buttonStyle}
          />
          <span style={{ color: themeVars?.muted ?? '#94a3b8' }}>x</span>
          <input
            value={resizeHeight}
            onChange={(e) => {
              const next = e.target.value.replace(/[^\d]/g, '');
              onResizeHeightChange(next);
              if (keepRatio && imageDims && next) {
                const height = Number(next);
                if (height > 0) onResizeWidthChange(String(Math.max(1, Math.round((height * imageDims.width) / imageDims.height))));
              }
            }}
            className="w-24 rounded px-2 py-2 text-sm"
            style={buttonStyle}
          />
        </div>
        <label className="mt-4 flex items-center gap-2 text-xs" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
          <input type="checkbox" checked={keepRatio} onChange={(e) => onKeepRatioChange(e.target.checked)} />
          비율 유지
        </label>
        <div className="mt-auto flex gap-2">
          <button className="flex-1 rounded px-3 py-2 text-sm" style={buttonStyle} onClick={onCancel}>취소</button>
          <button className="flex-1 rounded px-3 py-2 text-sm font-semibold" style={{ background: themeVars?.accent ?? '#4ade80', color: '#000' }} onClick={onSave} disabled={saving}>저장</button>
        </div>
      </div>
    </div>
  );
}
