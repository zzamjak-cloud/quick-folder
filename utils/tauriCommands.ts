import { invoke } from '@tauri-apps/api/core';
import type { FileEntry } from '../types';

export interface ExtractZipResult {
  destDir: string;
  total: number;
  extracted: number;
  failed: { name: string; reason: string }[];
}

export const tauriCommands = {
  deleteItems(paths: string[], useTrash: boolean) {
    return invoke<void>('delete_items', { paths, useTrash });
  },
  deleteItemsElevated(paths: string[]) {
    return invoke<void>('delete_items_elevated', { paths });
  },
  duplicateItems(paths: string[]) {
    return invoke<string[]>('duplicate_items', { paths });
  },
  createDirectory(path: string) {
    return invoke<void>('create_directory', { path });
  },
  createTextFile(path: string) {
    return invoke<void>('create_text_file', { path });
  },
  pasteImageFromClipboard(destDir: string) {
    return invoke<string | null>('paste_image_from_clipboard', { destDir });
  },
  renameItem(oldPath: string, newPath: string) {
    return invoke<void>('rename_item', { oldPath, newPath });
  },
  listDirectory(path: string) {
    return invoke<FileEntry[]>('list_directory', { path });
  },
  moveItems(sources: string[], dest: string) {
    return invoke<void>('move_items', { sources, dest });
  },
  compressToZip(paths: string[], dest: string) {
    return invoke<void>('compress_to_zip', { paths, dest });
  },
  extractZip(zipPath: string, destDir: string) {
    return invoke<ExtractZipResult>('extract_zip', { zipPath, destDir });
  },
  exportLaigterMaps(
    input: string,
    params: unknown,
    options: { saveNormal: boolean; saveParallax: boolean; saveSpecular: boolean; saveOcclusion: boolean },
  ) {
    return invoke<string[]>('laigter_maps_export', { input, params, options });
  },
  pixelateImage(input: string, pixelSize: number, scale: number, maxColors: number) {
    return invoke<string>('pixelate_image', { input, pixelSize, scale, maxColors });
  },
  removeWhiteBgSave(
    inputs: string[],
    threshold: number,
    feather: number,
    seeds: [number, number][],
    trim: boolean,
  ) {
    return invoke<string[]>('remove_white_bg_save', { inputs, threshold, feather, seeds, trim });
  },
  checkFfmpeg() {
    return invoke<boolean>('check_ffmpeg');
  },
  compressVideo(input: string, quality: 'low' | 'medium' | 'high', onProgress: unknown) {
    return invoke<string>('compress_video', { input, quality, onProgress });
  },
  gifToMp4(path: string) {
    return invoke<string>('gif_to_mp4', { path });
  },
  checkGhostscript() {
    return invoke<boolean>('check_gs');
  },
  downloadGhostscript() {
    return invoke<void>('download_gs');
  },
  compressPdf(input: string) {
    return invoke<string>('compress_pdf', { input });
  },
  calculateFolderSize<T>(path: string) {
    return invoke<T>('calculate_folder_size', { path });
  },
  copyPath(path: string) {
    return invoke<void>('copy_path', { path });
  },
  restoreTrashItems(originalPaths: string[]) {
    return invoke<void>('restore_trash_items', { originalPaths });
  },
};
