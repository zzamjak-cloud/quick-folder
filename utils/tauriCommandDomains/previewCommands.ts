import { runCommand, runDirectCommand } from '../tauriCommandRunner.ts';

export const previewCommands = {
  quickLook(path: string) {
    return runDirectCommand<void>('quick_look', { path });
  },
  extractHwpText(path: string) {
    return runCommand<string>('extract_hwp_text', { path });
  },
  getFileIcon(path: string, size: number) {
    return runCommand<string | null>('get_file_icon', { path, size });
  },
};
