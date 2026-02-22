export interface FolderShortcut {
  id: string;
  name: string;
  path: string;
  color?: string; // 텍스트 색상 (Tailwind 클래스 또는 hex 코드)
  createdAt: number;
}

export interface Category {
  id: string;
  title: string;
  color: string; // Hex code or tailwind class reference
  shortcuts: FolderShortcut[];
  createdAt: number;
  isCollapsed?: boolean;
}

// 파일 탐색기 관련 타입
export type FileType = 'image' | 'video' | 'document' | 'code' | 'archive' | 'other' | 'directory';

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;       // 바이트 단위 (폴더는 0)
  modified: number;   // unix timestamp (ms)
  file_type: FileType;
}

export interface ClipboardData {
  paths: string[];
  action: 'copy' | 'cut';
}

export type ThumbnailSize = 40 | 60 | 80 | 100 | 120 | 160 | 200 | 240;

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}
