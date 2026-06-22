import type { FileEntry } from '../../types';
import { runCommand, runDirectCommand, runLowPriorityCommand } from '../tauriCommandRunner.ts';

export interface ExtractZipResult {
  destDir: string;
  total: number;
  extracted: number;
  failed: { name: string; reason: string }[];
}

export const fileCommands = {
  deleteItems(paths: string[], useTrash: boolean) {
    return runCommand<void>('delete_items', { paths, useTrash });
  },
  deleteItemsElevated(paths: string[]) {
    return runCommand<void>('delete_items_elevated', { paths });
  },
  duplicateItems(paths: string[]) {
    return runCommand<string[]>('duplicate_items', { paths });
  },
  createDirectory(path: string) {
    return runCommand<void>('create_directory', { path });
  },
  createTextFile(path: string) {
    return runCommand<void>('create_text_file', { path });
  },
  renameItem(oldPath: string, newPath: string) {
    return runCommand<void>('rename_item', { oldPath, newPath });
  },
  listDirectory(path: string) {
    return runCommand<FileEntry[]>('list_directory', { path });
  },
  isDirectory(path: string) {
    return runCommand<boolean>('is_directory', { path });
  },
  listSystemRoots() {
    return runDirectCommand<FileEntry[]>('list_system_roots');
  },
  getRecentFiles(roots: string[], days: number) {
    return runCommand<FileEntry[]>('get_recent_files', { roots, days });
  },
  readCachedListing(path: string) {
    return runDirectCommand<FileEntry[] | null>('read_cached_listing', { path });
  },
  writeCachedListing(path: string, entries: FileEntry[]) {
    return runLowPriorityCommand<void>('write_cached_listing', { path, entries });
  },
  moveItems(sources: string[], dest: string) {
    return runCommand<void>('move_items', { sources, dest });
  },
  checkDuplicateItems(sources: string[], dest: string) {
    return runCommand<string[]>('check_duplicate_items', { sources, dest });
  },
  materializeArchivePaths(paths: string[]) {
    return runCommand<string[]>('materialize_archive_paths', { paths });
  },
  compressToZip(paths: string[], dest: string) {
    return runCommand<void>('compress_to_zip', { paths, dest });
  },
  extractZip(zipPath: string, destDir: string) {
    return runCommand<ExtractZipResult>('extract_zip', { zipPath, destDir });
  },
  calculateFolderSize<T>(path: string) {
    return runCommand<T>('calculate_folder_size', { path });
  },
  restoreTrashItems(originalPaths: string[]) {
    return runCommand<void>('restore_trash_items', { originalPaths });
  },
  readTextFile(path: string, maxBytes: number) {
    return runCommand<string>('read_text_file', { path, maxBytes });
  },
  writeTextFile(path: string, content: string) {
    return runCommand<void>('write_text_file', { path, content });
  },
  getGoogleDriveFileId(path: string) {
    return runCommand<string>('get_google_drive_file_id', { path });
  },
  setGoogleDriveOffline(path: string, offline: boolean) {
    return runCommand<void>('set_google_drive_offline', { path, offline });
  },
};
