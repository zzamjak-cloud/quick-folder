import type { FileEntry } from '../types';
import { invokeTauriCommand } from './tauriInvoke.ts';

export interface ExtractZipResult {
  destDir: string;
  total: number;
  extracted: number;
  failed: { name: string; reason: string }[];
}

function runCommand<T>(cmd: string, args: Record<string, unknown> = {}) {
  return invokeTauriCommand<T>(cmd, args, { priority: 'normal' });
}

function runDirectCommand<T>(cmd: string, args: Record<string, unknown> = {}) {
  return invokeTauriCommand<T>(cmd, args, { priority: 'direct' });
}

function runLowPriorityCommand<T>(cmd: string, args: Record<string, unknown> = {}) {
  return invokeTauriCommand<T>(cmd, args, { priority: 'low' });
}

export const tauriCommands = {
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
  pasteImageFromClipboard(destDir: string) {
    return runCommand<string | null>('paste_image_from_clipboard', { destDir });
  },
  renameItem(oldPath: string, newPath: string) {
    return runCommand<void>('rename_item', { oldPath, newPath });
  },
  listDirectory(path: string) {
    return runCommand<FileEntry[]>('list_directory', { path });
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
  moveItems(sources: string[], dest: string) {
    return runCommand<void>('move_items', { sources, dest });
  },
  checkDuplicateItems(sources: string[], dest: string) {
    return runCommand<string[]>('check_duplicate_items', { sources, dest });
  },
  compressToZip(paths: string[], dest: string) {
    return runCommand<void>('compress_to_zip', { paths, dest });
  },
  extractZip(zipPath: string, destDir: string) {
    return runCommand<ExtractZipResult>('extract_zip', { zipPath, destDir });
  },
  exportLaigterMaps(
    input: string,
    params: unknown,
    options: { saveNormal: boolean; saveParallax: boolean; saveSpecular: boolean; saveOcclusion: boolean },
  ) {
    return runCommand<string[]>('laigter_maps_export', { input, params, options });
  },
  pixelateImage(input: string, pixelSize: number, scale: number, maxColors: number) {
    return runCommand<string>('pixelate_image', { input, pixelSize, scale, maxColors });
  },
  removeWhiteBgSave(
    inputs: string[],
    threshold: number,
    feather: number,
    seeds: [number, number][],
    trim: boolean,
  ) {
    return runCommand<string[]>('remove_white_bg_save', { inputs, threshold, feather, seeds, trim });
  },
  checkFfmpeg() {
    return runCommand<boolean>('check_ffmpeg');
  },
  compressVideo(input: string, quality: 'low' | 'medium' | 'high', onProgress: unknown) {
    return runCommand<string>('compress_video', { input, quality, onProgress });
  },
  gifToMp4(path: string) {
    return runCommand<string>('gif_to_mp4', { path });
  },
  checkGhostscript() {
    return runCommand<boolean>('check_gs');
  },
  downloadGhostscript() {
    return runCommand<void>('download_gs');
  },
  compressPdf(input: string) {
    return runCommand<string>('compress_pdf', { input });
  },
  calculateFolderSize<T>(path: string) {
    return runCommand<T>('calculate_folder_size', { path });
  },
  copyPath(path: string) {
    return runDirectCommand<void>('copy_path', { path });
  },
  restoreTrashItems(originalPaths: string[]) {
    return runCommand<void>('restore_trash_items', { originalPaths });
  },
  openFolder(path: string) {
    return runDirectCommand<void>('open_folder', { path });
  },
  openTerminal(path: string) {
    return runDirectCommand<void>('open_terminal', { path });
  },
  runTerminalCommand(path: string, command: string) {
    return runCommand<void>('run_terminal_command', { path, command });
  },
  openSacSettings() {
    return runDirectCommand<void>('open_sac_settings');
  },
  quickLook(path: string) {
    return runDirectCommand<void>('quick_look', { path });
  },
  readTextFile(path: string, maxBytes: number) {
    return runCommand<string>('read_text_file', { path, maxBytes });
  },
  writeTextFile(path: string, content: string) {
    return runCommand<void>('write_text_file', { path, content });
  },
  writeCachedListing(path: string, entries: FileEntry[]) {
    return runLowPriorityCommand<void>('write_cached_listing', { path, entries });
  },
  writeFilesToClipboard(paths: string[]) {
    return runDirectCommand<void>('write_files_to_clipboard', { paths });
  },
  readFilesFromClipboard() {
    return runDirectCommand<string[]>('read_files_from_clipboard');
  },
  extractHwpText(path: string) {
    return runCommand<string>('extract_hwp_text', { path });
  },
  openInPhotoshop(paths: string[]) {
    return runDirectCommand<void>('open_in_photoshop', { paths });
  },
  getFileIcon(path: string, size: number) {
    return runCommand<string | null>('get_file_icon', { path, size });
  },
  convertToIco(path: string) {
    return runCommand<void>('convert_to_ico', { path });
  },
  convertToIcns(path: string) {
    return runCommand<void>('convert_to_icns', { path });
  },
  getGoogleDriveFileId(path: string) {
    return runCommand<string>('get_google_drive_file_id', { path });
  },
  setGoogleDriveOffline(path: string, offline: boolean) {
    return runCommand<void>('set_google_drive_offline', { path, offline });
  },
};
