import { runCommand, runDirectCommand } from '../tauriCommandRunner.ts';

export const systemCommands = {
  copyPath(path: string) {
    return runDirectCommand<void>('copy_path', { path });
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
  writeFilesToClipboard(paths: string[]) {
    return runDirectCommand<void>('write_files_to_clipboard', { paths });
  },
  readFilesFromClipboard() {
    return runDirectCommand<string[]>('read_files_from_clipboard');
  },
  startFileDrag(item: string[], image: string, onEvent: unknown) {
    return runDirectCommand<void>('plugin:drag|start_drag', { item, image, onEvent });
  },
};
