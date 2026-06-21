import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  readBooleanStorage,
  readExplorerActiveTabId,
  readExplorerTabs,
  readJsonStorage,
  readNumberStorage,
  readStorage,
  removeStorage,
  storageKeys,
  writeBooleanStorage,
  writeExplorerActiveTabId,
  writeExplorerTabs,
  writeJsonStorage,
  writeNumberStorage,
  writeStorage,
} from '../utils/storage.ts';
import type { Tab } from '../components/FileExplorer/types.ts';

function installLocalStorage(storage: Storage | undefined) {
  if (storage) {
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
  } else {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
}

function createLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

afterEach(() => {
  installLocalStorage(undefined);
});

test('탭 저장 키는 기본 pane과 분할 pane을 기존 키 형식으로 분리한다', () => {
  assert.equal(storageKeys.explorerTabs(), 'qf_explorer_tabs');
  assert.equal(storageKeys.explorerActiveTab(), 'qf_explorer_active_tab');
  assert.equal(storageKeys.explorerTabs('pane-1'), 'qf_explorer_tabs_pane-1');
  assert.equal(storageKeys.explorerActiveTab('pane-1'), 'qf_explorer_active_tab_pane-1');
});

test('문자열/숫자/boolean/JSON 설정을 같은 helper 계층에서 읽고 쓴다', () => {
  installLocalStorage(createLocalStorage());

  writeStorage('qf_string', 'value');
  writeNumberStorage('qf_number', 42);
  writeBooleanStorage('qf_bool', true);
  writeJsonStorage('qf_json', { theme: 'dark', zoom: 90 });

  assert.equal(readStorage('qf_string'), 'value');
  assert.equal(readNumberStorage('qf_number', 0), 42);
  assert.equal(readBooleanStorage('qf_bool'), true);
  assert.deepEqual(readJsonStorage('qf_json', {}), { theme: 'dark', zoom: 90 });

  removeStorage('qf_string');
  assert.equal(readStorage('qf_string'), null);
});

test('깨진 JSON과 비활성 저장소는 fallback으로 복구된다', () => {
  const storage = createLocalStorage();
  installLocalStorage(storage);
  storage.setItem('broken', '{');
  storage.setItem('nan', 'NaN');

  assert.deepEqual(readJsonStorage('broken', { ok: true }), { ok: true });
  assert.equal(readNumberStorage('nan', 7), 7);

  installLocalStorage({
    ...createLocalStorage(),
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
    removeItem() {
      throw new Error('blocked');
    },
  });

  assert.equal(readStorage('anything'), null);
  assert.doesNotThrow(() => writeStorage('anything', 'value'));
  assert.doesNotThrow(() => removeStorage('anything'));
});

test('탭 상태 helper는 저장된 탭 배열과 활성 탭 id를 복원한다', () => {
  installLocalStorage(createLocalStorage());
  const tabs: Tab[] = [
    { id: 'tab-1', path: '/Users/me', title: 'me', history: ['/Users/me'], historyIndex: 0 },
    { id: 'tab-2', path: '/tmp', title: 'tmp', history: ['/tmp'], historyIndex: 0 },
  ];

  writeExplorerTabs('pane-1', tabs);
  writeExplorerActiveTabId('pane-1', 'tab-2');

  assert.deepEqual(readExplorerTabs('pane-1'), tabs);
  assert.equal(readExplorerActiveTabId('pane-1'), 'tab-2');
});
