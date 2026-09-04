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
  /**
   * 프론트엔드가 마운트됐음을 백엔드에 알린다.
   * 이 신호가 제한 시간 안에 오지 않으면 백엔드가 흰 화면으로 판정하고
   * WebView2 캐시를 정리한 뒤 1회 재시작한다. 큐가 막혀도 전달돼야 하므로 direct 레인을 쓴다.
   */
  markFrontendReady() {
    return runDirectCommand<void>('mark_frontend_ready');
  },
};
