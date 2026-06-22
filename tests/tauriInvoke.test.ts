import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetTauriInvokeForTest,
  __setTauriInvokeForTest,
  cancelQueuedTauriCommands,
  invokeTauriCommand,
  isTauriCommandCancelled,
  queuedInvoke,
  queuedInvokeLow,
} from '../utils/tauriInvoke.ts';
import { fileCommands, mediaCommands, previewCommands, systemCommands, tauriCommands } from '../utils/tauriCommands.ts';

type InvokeArgs = Record<string, unknown>;
type TauriInvokeMock = Parameters<typeof __setTauriInvokeForTest>[0];
type InvokeCall = {
  cmd: string;
  args: InvokeArgs;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

function createDeferredInvoke() {
  const calls: InvokeCall[] = [];
  const invoke = <T>(cmd: string, args: InvokeArgs = {}) => new Promise<T>((resolve, reject) => {
    calls.push({
      cmd,
      args,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
  });
  return { calls, invoke };
}

function createResolvedInvoke(calls: { cmd: string; args: InvokeArgs }[]) {
  return <T>(cmd: string, args: InvokeArgs = {}) => {
    calls.push({ cmd, args });
    return Promise.resolve([]) as Promise<T>;
  };
}

function nextTick() {
  return new Promise(resolve => setImmediate(resolve));
}

afterEach(() => {
  __resetTauriInvokeForTest();
});

test('저우선순위 레인은 일반 레인과 독립적으로 즉시 실행된다', async () => {
  const mock = createDeferredInvoke();
  __setTauriInvokeForTest(mock.invoke as TauriInvokeMock);

  // 일반 레인을 가득 채워도(6) 저우선 레인은 별도라 곧바로 실행된다.
  const normalOps = Array.from({ length: 6 }, (_, index) =>
    queuedInvoke<string>(`normal-${index}`, { index })
  );
  const lowOp = queuedInvokeLow<string>('low-priority', { type: 'prefetch' });

  assert.deepEqual(
    mock.calls.map(call => call.cmd),
    ['normal-0', 'normal-1', 'normal-2', 'normal-3', 'normal-4', 'normal-5', 'low-priority'],
  );
  assert.deepEqual(mock.calls[6].args, { type: 'prefetch' });

  for (const call of mock.calls) {
    call.resolve(`${call.cmd}:done`);
  }
  await Promise.allSettled([...normalOps.map(op => op.promise), lowOp.promise]);
});

test('저우선순위 레인은 자체 동시성 상한(24)을 초과하면 대기한다', async () => {
  const mock = createDeferredInvoke();
  __setTauriInvokeForTest(mock.invoke as TauriInvokeMock);

  const lowOps = Array.from({ length: 25 }, (_, index) =>
    queuedInvokeLow<string>(`low-${index}`, { index })
  );

  // 상한 24개만 즉시 실행, 25번째는 대기
  assert.equal(mock.calls.length, 24);

  mock.calls[0].resolve('low-0:done');
  await lowOps[0].promise;
  await nextTick();

  assert.equal(mock.calls.length, 25);
  assert.equal(mock.calls[24].cmd, 'low-24');

  for (const call of mock.calls) {
    call.resolve(`${call.cmd}:done`);
  }
  await Promise.allSettled(lowOps.map(op => op.promise));
});

test('대기 중인 Tauri command는 일괄 취소 시 cancelled 에러로 정리된다', async () => {
  const mock = createDeferredInvoke();
  __setTauriInvokeForTest(mock.invoke as TauriInvokeMock);

  const runningOps = Array.from({ length: 6 }, (_, index) =>
    queuedInvoke<string>(`running-${index}`)
  );
  const queued = queuedInvoke<string>('queued-command');
  assert.equal(mock.calls.length, 6);

  cancelQueuedTauriCommands();

  await assert.rejects(
    queued.promise,
    error => isTauriCommandCancelled(error),
  );

  for (const call of mock.calls) {
    call.resolve(`${call.cmd}:done`);
  }
  await Promise.allSettled(runningOps.map(op => op.promise));
});

test('direct Tauri command의 문자열 reject는 Error로 정규화된다', async () => {
  __setTauriInvokeForTest((() => Promise.reject('raw failure')) as TauriInvokeMock);

  await assert.rejects(
    invokeTauriCommand('direct-failure'),
    error => error instanceof Error && error.message === 'raw failure',
  );
});

test('tauriCommands 도메인은 Rust command 이름과 인자를 한 경계로 매핑한다', async () => {
  const calls: { cmd: string; args: InvokeArgs }[] = [];
  __setTauriInvokeForTest(createResolvedInvoke(calls) as TauriInvokeMock);

  assert.equal(tauriCommands.copyPath, systemCommands.copyPath);
  assert.equal(tauriCommands.checkDuplicateItems, fileCommands.checkDuplicateItems);
  assert.equal(tauriCommands.cropImage, mediaCommands.cropImage);
  assert.equal(tauriCommands.getFontInfo, previewCommands.getFontInfo);

  await tauriCommands.copyPath('/tmp/a.txt');
  await fileCommands.checkDuplicateItems(['/tmp/a.txt'], '/tmp');
  await fileCommands.writeCachedListing('/tmp', []);
  await fileCommands.materializeArchivePaths(['/tmp/archive.zip/file.txt']);
  await mediaCommands.cropImage('/tmp/image.png', 1, 2, 3, 4);
  await mediaCommands.laigterMapsPreview('/tmp/image.png', { bumpStrength: 1 }, 512);
  await mediaCommands.ensureThumbnailsBatch([{ path: '/tmp/image.png', fileType: 'image' }], 160);
  await mediaCommands.ensureThumbnailsBatch([{ path: '/tmp/design.psd', fileType: 'psd' }], 160);
  await previewCommands.getFontInfo('/tmp/font.ttf');
  await systemCommands.startFileDrag(['/tmp/a.txt'], 'data:image/png;base64,AA==', { send: true });

  assert.deepEqual(calls, [
    { cmd: 'copy_path', args: { path: '/tmp/a.txt' } },
    { cmd: 'check_duplicate_items', args: { sources: ['/tmp/a.txt'], dest: '/tmp' } },
    { cmd: 'write_cached_listing', args: { path: '/tmp', entries: [] } },
    { cmd: 'materialize_archive_paths', args: { paths: ['/tmp/archive.zip/file.txt'] } },
    { cmd: 'crop_image', args: { path: '/tmp/image.png', x: 1, y: 2, width: 3, height: 4 } },
    { cmd: 'laigter_maps_preview', args: { input: '/tmp/image.png', params: { bumpStrength: 1 }, maxSide: 512 } },
    { cmd: 'ensure_thumbnails_batch', args: { items: [{ path: '/tmp/image.png', fileType: 'image' }], size: 160 } },
    { cmd: 'ensure_thumbnails_batch', args: { items: [{ path: '/tmp/design.psd', fileType: 'psd' }], size: 160 } },
    { cmd: 'get_font_info', args: { path: '/tmp/font.ttf' } },
    { cmd: 'plugin:drag|start_drag', args: { item: ['/tmp/a.txt'], image: 'data:image/png;base64,AA==', onEvent: { send: true } } },
  ]);
});
