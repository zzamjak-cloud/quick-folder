import { runCommand, runDirectCommand } from '../tauriCommandRunner.ts';

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
