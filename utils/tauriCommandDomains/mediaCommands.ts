import { runCommand, runDirectCommand, runLowPriorityCommand } from '../tauriCommandRunner.ts';

export interface ImageCompressPreview {
  dataUrl?: string;
  data_url?: string;
  size: number;
}

export interface ThumbnailBatchItem {
  path: string;
  fileType: 'image' | 'video' | 'psd';
}

export interface ThumbnailBatchResult {
  path: string;
  fileType: string;
  cachedPath?: string | null;
  error?: string | null;
}

export const mediaCommands = {
  pasteImageFromClipboard(destDir: string) {
    return runCommand<string | null>('paste_image_from_clipboard', { destDir });
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
  cropImage(path: string, x: number, y: number, width: number, height: number) {
    return runCommand<string>('crop_image', { path, x, y, width, height });
  },
  saveAnnotatedImage(originalPath: string, imageData: string) {
    return runCommand<string>('save_annotated_image', { originalPath, imageData });
  },
  compressImagePreview(path: string, quality: 'low' | 'medium' | 'high') {
    return runCommand<ImageCompressPreview>('compress_image_preview', { path, quality });
  },
  compressImage(path: string, quality: 'low' | 'medium' | 'high') {
    return runCommand<string>('compress_image', { path, quality });
  },
  resizeImage(path: string, width: number, height: number) {
    return runCommand<string>('resize_image', { path, width, height });
  },
  laigterMapsPreview<T>(input: string, params: unknown, maxSide: number) {
    return runCommand<T>('laigter_maps_preview', { input, params, maxSide });
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
  ensureThumbnailsBatch(items: ThumbnailBatchItem[], size: number) {
    return runLowPriorityCommand<ThumbnailBatchResult[]>('ensure_thumbnails_batch', { items, size });
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
  openInPhotoshop(paths: string[]) {
    return runDirectCommand<void>('open_in_photoshop', { paths });
  },
  convertToIco(path: string) {
    return runCommand<void>('convert_to_ico', { path });
  },
  convertToIcns(path: string) {
    return runCommand<void>('convert_to_icns', { path });
  },
};
