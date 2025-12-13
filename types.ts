export interface FolderShortcut {
  id: string;
  name: string;
  path: string;
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

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}
