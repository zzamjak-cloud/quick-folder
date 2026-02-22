import React from 'react';
import { Folder, File, FileImage, FileVideo, FileText, FileCode, Archive } from 'lucide-react';

// 파일 타입별 아이콘 컴포넌트
export function FileTypeIcon({ fileType, size }: { fileType: string; size: number }) {
  const iconProps = { size, className: 'flex-shrink-0' };
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
export function iconColor(fileType: string): string {
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
export const DRAG_IMAGE = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 24;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(59, 130, 246, 0.7)';
  ctx.fillRect(0, 0, 24, 24);
  return canvas.toDataURL('image/png');
})();

// 파일 크기 포맷
export function formatSize(bytes: number, isDir: boolean): string {
  if (isDir) return '폴더';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
