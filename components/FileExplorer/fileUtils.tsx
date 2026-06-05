import React from 'react';
import { Folder, File, FileImage, FileVideo, FileText, FileCode, Archive, Cog } from 'lucide-react';
import type { ThemeVars } from './types';

// 파일명에서 확장자 추출 (소문자)
function getExt(fileName?: string): string {
  if (!fileName) return '';
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

// Unity3D .unitypackage 전용 큐브 아이콘
const UnityCubeIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* 큐브 외곽 (Unity 로고 풍 3D 큐브) */}
    <path d="M12 2.5 L21 7 L21 17 L12 21.5 L3 17 L3 7 Z" />
    <path d="M12 2.5 L12 12" />
    <path d="M12 12 L21 7" />
    <path d="M12 12 L3 7" />
    <path d="M12 12 L12 21.5" />
  </svg>
);

// 네이티브 아이콘이 안 나오는 확장자만 lucide 아이콘 폴백 매핑
// (이 확장자들은 useNativeIcon의 SKIP_NATIVE_EXTS에도 등록됨)
const EXT_ICON: Record<string, React.FC<{ size: number; className?: string }>> = {
  md: FileText,          // 마크다운 → 문서(종이) 아이콘
  json: FileText,        // JSON → 문서(종이) 아이콘
  sh: FileText,          // 셸 스크립트 → 문서(종이) 아이콘
  exe: Cog,              // 실행파일 → 톱니바퀴 아이콘
  unitypackage: UnityCubeIcon, // Unity3D 패키지 → 큐브 아이콘
};

// 확장자별 전용 색상 (네이티브 아이콘 skip 대상만)
const EXT_COLOR: Record<string, string> = {
  md: '#fbbf24',         // 마크다운 → 문서 옐로
  json: '#fbbf24',       // JSON → 문서 옐로
  sh: '#fbbf24',         // 셸 스크립트 → 문서 옐로
  exe: '#60a5fa',        // 실행파일 블루
  unitypackage: '#e5e7eb', // Unity3D 패키지 → 흰색 (다크 배경에서 큐브 라인이 잘 보이도록)
};

// 파일 타입별 아이콘 컴포넌트
export function FileTypeIcon({ fileType, size, fileName }: { fileType: string; size: number; fileName?: string }) {
  const iconProps = { size, className: 'flex-shrink-0' };
  // 확장자별 전용 아이콘 우선 적용
  const ext = getExt(fileName);
  const ExtIcon = EXT_ICON[ext];
  if (ExtIcon) return <ExtIcon {...iconProps} />;

  switch (fileType) {
    case 'directory': return <Folder {...iconProps} />;
    case 'image':     return <FileImage {...iconProps} />;
    case 'video':     return <FileVideo {...iconProps} />;
    case 'document':  return <FileText {...iconProps} />;
    case 'code':      return <FileCode {...iconProps} />;
    case 'archive':   return <Archive {...iconProps} />;
    default:          return <File {...iconProps} />;
  }
}

// 파일 타입별 아이콘 색상
export function iconColor(fileType: string, fileName?: string): string {
  // 확장자별 전용 색상 우선 적용
  const ext = getExt(fileName);
  const extColor = EXT_COLOR[ext];
  if (extColor) return extColor;

  switch (fileType) {
    case 'directory': return '#60a5fa';
    case 'image':     return '#34d399';
    case 'video':     return '#a78bfa';
    case 'document':  return '#fbbf24';
    case 'code':      return '#22d3ee';
    case 'archive':   return '#fb923c';
    default:          return '#94a3b8';
  }
}

function colorWithAlpha(color: string | undefined, alpha: number, fallback: string): string {
  const hex = color?.trim();
  if (!hex) return fallback;

  const shortHex = /^#([0-9a-f]{3})$/i.exec(hex);
  const fullHex = /^#([0-9a-f]{6})$/i.exec(hex);
  const value = fullHex?.[1] ?? shortHex?.[1]?.split('').map(ch => ch + ch).join('');
  if (!value) return fallback;

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgb(color: string | undefined): { r: number; g: number; b: number } | null {
  const hex = color?.trim();
  if (!hex) return null;

  const shortHex = /^#([0-9a-f]{3})$/i.exec(hex);
  const fullHex = /^#([0-9a-f]{6})$/i.exec(hex);
  const value = fullHex?.[1] ?? shortHex?.[1]?.split('').map(ch => ch + ch).join('');
  if (!value) return null;

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const srgb = [r, g, b].map(value => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function getFileIconShadowStyle(
  themeVars: ThemeVars | null | undefined,
  compact = false
): React.CSSProperties {
  const bg = hexToRgb(themeVars?.bg);
  if (!bg || relativeLuminance(bg) < 0.35) {
    return {};
  }

  const core = colorWithAlpha(themeVars?.text, compact ? 0.34 : 0.36, 'rgba(15, 23, 42, 0.34)');
  const soft = colorWithAlpha(themeVars?.text, 0.16, 'rgba(15, 23, 42, 0.16)');

  return {
    filter: compact
      ? `drop-shadow(0 1px 1px ${core})`
      : `drop-shadow(0 1px 1px ${core}) drop-shadow(0 4px 8px ${soft})`,
  };
}

// OS 드래그 이미지 (24x24 반투명 파란색 아이콘, PNG data URI)
// tauri-plugin-drag의 Base64Image 변형으로 역직렬화됨
// 1x1 투명 PNG 폴백 (canvas 2D context 미지원 환경)
const FALLBACK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==';
export const DRAG_IMAGE = (() => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext('2d');
    if (!ctx) return FALLBACK_PNG;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.7)';
    ctx.fillRect(0, 0, 24, 24);
    return canvas.toDataURL('image/png');
  } catch {
    return FALLBACK_PNG;
  }
})();

function getBaseName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

export function createFileDragImage(paths: string[], sourceElement?: HTMLElement | null) {
  try {
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return DRAG_IMAGE;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 16);
    ctx.fill();

    const img = sourceElement?.querySelector('img') as HTMLImageElement | null;
    if (img?.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(8, 8, 80, 80, 12);
      ctx.clip();
      ctx.drawImage(img, 8, 8, 80, 80);
      ctx.restore();
    } else {
      const label = getBaseName(paths[0] ?? '').slice(0, 1).toUpperCase() || 'F';
      ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
      ctx.beginPath();
      ctx.roundRect(12, 12, 72, 72, 14);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 48, 50);
    }

    if (paths.length > 1) {
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.roundRect(58, 62, 30, 24, 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(paths.length), 73, 74);
    }

    return canvas.toDataURL('image/png');
  } catch {
    return DRAG_IMAGE;
  }
}

// 파일 크기 포맷
export function formatSize(bytes: number, isDir: boolean): string {
  if (isDir) return '폴더';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// 파일 호버 툴팁 포맷
export function formatTooltip(entry: { name: string; path: string; is_dir: boolean; size: number; modified: number; file_type: string }, imageDims?: [number, number] | null): string {
  const parts: string[] = [entry.name];
  if (!entry.is_dir) parts.push(`크기: ${formatSize(entry.size, false)}`);
  if (entry.modified) parts.push(`수정일: ${new Date(entry.modified).toLocaleString('ko-KR')}`);
  if (imageDims) parts.push(`해상도: ${imageDims[0]} × ${imageDims[1]}`);
  const labels: Record<string, string> = {
    directory: '폴더', image: '이미지', video: '비디오',
    document: '문서', code: '코드', archive: '압축', other: '기타',
  };
  parts.push(`유형: ${labels[entry.file_type] ?? '기타'}`);
  return parts.join('\n');
}
