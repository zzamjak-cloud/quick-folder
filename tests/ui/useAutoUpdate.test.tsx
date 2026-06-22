import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type UseAutoUpdate = typeof import('../../hooks/useAutoUpdate').useAutoUpdate;

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  getVersion: vi.fn(),
  isTauri: vi.fn(),
  openSacSettings: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: mocks.check,
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: mocks.relaunch,
}));

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: mocks.getVersion,
}));

vi.mock('../../utils/isTauri', () => ({
  isTauri: mocks.isTauri,
}));

vi.mock('../../utils/isTauri.ts', () => ({
  isTauri: mocks.isTauri,
}));

vi.mock('../../utils/tauriCommands', () => ({
  tauriCommands: {
    openSacSettings: mocks.openSacSettings,
  },
}));

function mockChangelogMiss() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      text: async () => '',
    })),
  );
}

describe('useAutoUpdate', () => {
  let useAutoUpdate: UseAutoUpdate;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
    mocks.check.mockReset();
    mocks.getVersion.mockReset();
    mocks.isTauri.mockReset();
    mocks.openSacSettings.mockReset();
    mocks.relaunch.mockReset();
    mocks.isTauri.mockReturnValue(true);
    mocks.getVersion.mockResolvedValue('1.0.0');
    (window as unknown as { __TAURI_INTERNALS__?: { invoke: () => void } }).__TAURI_INTERNALS__ = {
      invoke: vi.fn(),
    };
    mockChangelogMiss();
    ({ useAutoUpdate } = await import('../../hooks/useAutoUpdate'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    localStorage.clear();
  });

  async function runAutoCheckTimer() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  test('plugin updater check 결과를 업데이트 모달 상태로 반영한다', async () => {
    mocks.check.mockResolvedValue({
      available: true,
      version: '1.1.0',
      body: 'Release body',
    });

    const { result } = renderHook(() => useAutoUpdate(vi.fn()));
    await runAutoCheckTimer();

    expect(result.current.isUpdateModalOpen).toBe(true);
    expect(result.current.updateInfo).toEqual({
      version: '1.1.0',
      body: 'Release body',
    });
    expect(mocks.check).toHaveBeenCalledTimes(1);
  });

  test('업데이트 실행은 downloadAndInstall 후 relaunch까지 호출한다', async () => {
    const addToast = vi.fn();
    const downloadAndInstall = vi.fn(async (onEvent: (event: unknown) => void) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } });
      onEvent({ event: 'Progress', data: { chunkLength: 25 } });
      onEvent({ event: 'Finished' });
    });

    mocks.check
      .mockResolvedValueOnce({
        available: true,
        version: '1.1.0',
        body: 'Release body',
      })
      .mockResolvedValueOnce({
        available: true,
        downloadAndInstall,
      });

    const { result } = renderHook(() => useAutoUpdate(addToast));
    await runAutoCheckTimer();

    expect(result.current.updateInfo?.version).toBe('1.1.0');

    await act(async () => {
      await result.current.handleUpdate();
    });

    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(result.current.downloadProgress).toBe(100);
    expect(addToast).toHaveBeenCalledWith('업데이트를 다운로드하고 있습니다...', 'info');
    expect(addToast).toHaveBeenCalledWith('업데이트가 완료되었습니다. 앱을 재시작합니다.', 'success');
    expect(mocks.relaunch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('qf_pending_update') ?? '{}')).toMatchObject({
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
    });
  });

  test('SAC 설정 열기는 Rust command wrapper 경계를 호출한다', async () => {
    const addToast = vi.fn();
    mocks.check.mockResolvedValue(null);
    mocks.openSacSettings.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAutoUpdate(addToast));

    await act(async () => {
      await result.current.openSacSettings();
    });

    expect(mocks.openSacSettings).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith(
      '설정에서 검색창에 [스마트 앱 제어]를 입력한 뒤 끄기로 변경해 주세요.',
      'info',
    );
  });
});
