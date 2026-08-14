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
    // 임의 명령은 실행 시간을 예측할 수 없음 — 일반 레인 점유 방지
    return runDirectCommand<void>('run_terminal_command', { path, command });
  },
  openSacSettings() {
    return runDirectCommand<void>('open_sac_settings');
  },
  openExternalUrl(url: string) {
    return runDirectCommand<void>('open_external_url', { url });
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
