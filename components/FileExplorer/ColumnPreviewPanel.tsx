import React, { memo, useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ThemeVars } from './types';
import { FileTypeIcon, iconColor, formatSize } from './fileUtils';
import { ColumnPreviewData } from './hooks/useColumnView';

interface ColumnPreviewPanelProps {
  preview: ColumnPreviewData;
  themeVars: ThemeVars | null;
}

// 파일 정보 영역 예상 높이 (파일명 + 정보 행 + gap + padding)
const INFO_AREA_HEIGHT = 130;

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
  const { entry, thumbnail, textContent, videoPath, loading } = preview;
  const hasContent = !!thumbnail || !!textContent || !!videoPath;

  // 컨테이너 높이 측정 → 이미지 maxHeight 동적 계산
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setContainerHeight(e.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 이미지에 사용할 최대 높이: 컨테이너 높이에서 파일 정보 영역 제외
  const imageMaxHeight = Math.max(200, containerHeight - INFO_AREA_HEIGHT);

  // 동영상 asset URL
  const videoSrc = useMemo(() => videoPath ? convertFileSrc(videoPath) : null, [videoPath]);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 동영상 선택 시 자동 포커스
  useEffect(() => {
    if (videoSrc && videoRef.current) {
      videoRef.current.focus();
    }
  }, [videoSrc]);

  // 동영상 키보드 단축키: Space 재생/정지, 좌우 화살표 시간 탐색
  const handleVideoKeyDown = useCallback((e: React.KeyboardEvent) => {
    const video = videoRef.current;
    if (!video) return;

    if (e.key === ' ') {
      e.stopPropagation();
      e.preventDefault();
      video.paused ? video.play() : video.pause();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.stopPropagation();
      e.preventDefault();
      const offset = e.shiftKey ? 10 : 5;
      video.currentTime += e.key === 'ArrowRight' ? offset : -offset;
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-shrink-0 h-full overflow-hidden flex flex-col items-center p-4 gap-3"
      style={{
        minWidth: 260,
        width: hasContent ? 'auto' : 260,
        maxWidth: '50%',
        borderLeft: `1px solid ${themeVars?.border ?? '#334155'}`,
      }}
    >
      {/* 미리보기 영역 */}
      {loading ? (
        <div
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ width: 180, height: 180, backgroundColor: themeVars?.surface ?? '#111827' }}
        >
          <Loader2 size={28} className="animate-spin" style={{ color: themeVars?.accent ?? '#3b82f6' }} />
        </div>
      ) : videoSrc ? (
        // 동영상: 인라인 비디오 플레이어 (Space 재생/정지, 좌우 화살표 탐색)
        <video
          ref={videoRef}
          src={videoSrc}
          controls
          tabIndex={0}
          onKeyDown={handleVideoKeyDown}
          style={{ maxWidth: '100%', maxHeight: imageMaxHeight, borderRadius: 8, flexShrink: 1, outline: 'none' }}
        />
      ) : thumbnail ? (
        // 이미지/PSD 썸네일 — 패널 높이에 맞춰 표시
        <img
          src={thumbnail}
          alt={entry.name}
          style={{ maxWidth: '100%', maxHeight: imageMaxHeight, objectFit: 'contain', flexShrink: 1 }}
          className="rounded-lg"
          draggable={false}
        />
      ) : textContent ? (
        // 텍스트/코드/마크다운 미리보기
        <pre
          className="w-full rounded-lg p-3 text-[11px] leading-relaxed overflow-auto whitespace-pre-wrap break-all"
          style={{
            backgroundColor: themeVars?.surface ?? '#111827',
            color: themeVars?.text ?? '#e5e7eb',
            border: `1px solid ${themeVars?.border ?? '#334155'}`,
            maxHeight: imageMaxHeight,
            flexShrink: 1,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }}
        >
          {textContent}
        </pre>
      ) : (
        // 기본: 큰 아이콘
        <div
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ width: 180, height: 180, backgroundColor: themeVars?.surface ?? '#111827' }}
        >
          <span style={{ color: iconColor(entry.file_type, entry.name) }}>
            <FileTypeIcon fileType={entry.file_type} size={64} fileName={entry.name} />
          </span>
        </div>
      )}

      {/* 파일명 */}
      <p
        className="text-sm font-medium text-center break-all leading-tight flex-shrink-0"
        style={{ color: themeVars?.text ?? '#e5e7eb' }}
      >
        {entry.name}
      </p>

      {/* 파일 정보 */}
      <div className="w-full flex flex-col gap-1.5 mt-1 flex-shrink-0">
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
