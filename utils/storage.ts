import type { Tab } from '../components/FileExplorer/types';

export const storageKeys = {
  windowState: 'quickfolder_window_state',
  leftPanelWidth: 'qf_left_panel_width',
  sidebarCollapsed: 'qf_sidebar_collapsed',
  splitMode: 'qf_split_mode',
  splitRatio: 'qf_split_ratio',
  tempTrayPaths: 'qf_temp_file_tray_paths',
  tempTrayWindowRestore: 'qf_temp_file_tray_restore_window',
  explorerTabs: (instanceId = 'default') => instanceId === 'default'
    ? 'qf_explorer_tabs'
    : `qf_explorer_tabs_${instanceId}`,
  explorerActiveTab: (instanceId = 'default') => instanceId === 'default'
    ? 'qf_explorer_active_tab'
    : `qf_explorer_active_tab_${instanceId}`,
  explorerSortBy: (instanceId: string) => `qf_sort_by_${instanceId}`,
  explorerSortDir: (instanceId: string) => `qf_sort_dir_${instanceId}`,
  explorerThumbnailSize: (instanceId: string) => `qf_thumb_size_${instanceId}`,
  explorerViewMode: (instanceId: string) => `qf_view_mode_${instanceId}`,
  folderTags: 'qf_folder_tags',
  columnViewWidth: (instanceId = 'default') => `qf_colview_width_${instanceId}`,
  detailsColumns: (instanceId = 'default') => `qf_details_cols_${instanceId}`,
} as const;

function getLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readStorage(key: string): string | null {
  try {
    return getLocalStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    getLocalStorage()?.setItem(key, value);
  } catch {
    // 저장소가 비활성화되거나 가득 찬 환경에서는 설정 저장만 포기한다.
  }
}

export function removeStorage(key: string): void {
  try {
    getLocalStorage()?.removeItem(key);
  } catch {
    // ignore
  }
}

export function readJsonStorage<T>(key: string, fallback: T): T {
  const raw = readStorage(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonStorage<T>(key: string, value: T): void {
  writeStorage(key, JSON.stringify(value));
}

export function readNumberStorage(key: string, fallback: number): number {
  const raw = readStorage(key);
  if (raw == null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function writeNumberStorage(key: string, value: number): void {
  writeStorage(key, String(value));
}

export function readBooleanStorage(key: string, fallback = false): boolean {
  const raw = readStorage(key);
  return raw == null ? fallback : raw === 'true';
}

export function writeBooleanStorage(key: string, value: boolean): void {
  writeStorage(key, String(value));
}

export function readExplorerTabs(instanceId = 'default'): Tab[] {
  const parsed = readJsonStorage<unknown>(storageKeys.explorerTabs(instanceId), []);
  return Array.isArray(parsed) ? parsed as Tab[] : [];
}

export function writeExplorerTabs(instanceId: string, tabs: Tab[]): void {
  writeJsonStorage(storageKeys.explorerTabs(instanceId), tabs);
}

export function readExplorerActiveTabId(instanceId = 'default'): string {
  return readStorage(storageKeys.explorerActiveTab(instanceId)) ?? '';
}

export function writeExplorerActiveTabId(instanceId: string, activeTabId: string): void {
  writeStorage(storageKeys.explorerActiveTab(instanceId), activeTabId);
}
