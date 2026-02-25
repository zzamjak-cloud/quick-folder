import React from 'react';
import { Folder, File, FileImage, FileVideo, FileText, FileCode, Archive } from 'lucide-react';

// PSD 확장자 판별 헬퍼
function isPsd(fileName?: string): boolean {
  return !!fileName && fileName.toLowerCase().endsWith('.psd');
}

// 파일 타입별 아이콘 컴포넌트
export function FileTypeIcon({ fileType, size, fileName }: { fileType: string; size: number; fileName?: string }) {
  const iconProps = { size, className: 'flex-shrink-0' };
  // PSD 파일은 file_type이 'other'이므로 파일명으로 별도 분기
  if (fileType === 'other' && isPsd(fileName)) {
    return <FileImage {...iconProps} />;
  }
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
  // PSD 파일 전용 색상 (Adobe 브랜딩 퍼플)
  if (fileType === 'other' && isPsd(fileName)) return '#a855f7';
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
