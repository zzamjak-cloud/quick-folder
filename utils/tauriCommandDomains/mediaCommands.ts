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
    // 노멀맵 일괄 내보내기 — 오래 걸릴 수 있어 일반 레인 점유 방지
    return runDirectCommand<string[]>('laigter_maps_export', { input, params, options });
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
    // 다중 이미지 일괄 처리로 오래 걸릴 수 있음 — 일반 레인 점유 방지
    return runDirectCommand<string[]>('remove_white_bg_save', { inputs, threshold, feather, seeds, trim });
  },
  checkFfmpeg() {
    return runCommand<boolean>('check_ffmpeg');
  },
  // ffmpeg 다운로드/인코딩: 분 단위 작업 — UI 조작용 일반 레인(6슬롯)을 점유하면
  // 이후 rename/list 등 모든 파일 조작이 대기하는 먹통이 되므로 direct로 분리
  downloadFfmpeg() {
    return runDirectCommand<void>('download_ffmpeg');
  },
  compressVideo(input: string, quality: 'low' | 'medium' | 'high', scalePercent: number, onProgress: unknown) {
    return runDirectCommand<string>('compress_video', { input, quality, scalePercent, onProgress });
  },
  videoToGif(input: string, onProgress: unknown) {
    return runDirectCommand<string>('video_to_gif', {
      input,
      startSec: 0,
      endSec: 31_536_000,
      cropX: null,
      cropY: null,
      cropW: null,
      cropH: null,
      scaleWidth: null,
      speed: null,
      onProgress,
    });
  },
  gifToMp4(path: string) {
    return runDirectCommand<string>('gif_to_mp4', { path });
  },
  ensureThumbnailsBatch(items: ThumbnailBatchItem[], size: number) {
    return runLowPriorityCommand<ThumbnailBatchResult[]>('ensure_thumbnails_batch', { items, size });
  },
  invalidateThumbnailCache(paths: string[]) {
    // 폴링이 호출하는 유지보수 작업 — 일반 레인 점유 방지
    return runDirectCommand<void>('invalidate_thumbnail_cache', { paths });
  },
  compressPdf(input: string) {
    return runDirectCommand<string>('compress_pdf', { input });
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
