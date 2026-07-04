import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FileEntry } from '../../types';
import type { Tab } from '../../components/FileExplorer/types';
import {
  writeExplorerActiveTabId,
  writeExplorerTabs,
} from '../../utils/storage';

const mocks = vi.hoisted(() => ({
  ensureThumbnailsBatch: vi.fn(),
  fallbackCommand: vi.fn(),
  getFileIcon: vi.fn(),
  listDirectory: vi.fn(),
  readCachedListing: vi.fn(),
  writeCachedListing: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  Channel: class {
    onmessage?: (message: unknown) => void;
  },
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke: mocks.fallbackCommand,
}));

vi.mock('@tauri-apps/api/path', () => ({
  appCacheDir: vi.fn(async () => '/tmp/quick-folder-test-cache'),
}));

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn(async () => vi.fn()),
  })),
}));

vi.mock('../../utils/tauriCommands', () => {
  const commandMap = {
    ensureThumbnailsBatch: mocks.ensureThumbnailsBatch,
    getFileIcon: mocks.getFileIcon,
    getRecentFiles: vi.fn(async () => []),
    listDirectory: mocks.listDirectory,
    listSystemRoots: vi.fn(async () => []),
    readCachedListing: mocks.readCachedListing,
    writeCachedListing: mocks.writeCachedListing,
  };

  return {
    fileCommands: {},
    mediaCommands: {},
    previewCommands: {},
    systemCommands: {},
    tauriCommands: new Proxy(commandMap, {
      get(target, prop: string) {
        return prop in target ? target[prop as keyof typeof target] : mocks.fallbackCommand;
      },
    }),
  };
});

class MockIntersectionObserver {
  disconnect = vi.fn();
  observe = vi.fn();
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();
}

class MockResizeObserver {
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
}

function fileEntry(path: string, name: string): FileEntry {
  return {
    file_type: 'other',
    is_dir: false,
    modified: 1,
    name,
    path,
    size: 1,
  };
}

describe('FileExplorer initialPath 로딩', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.ensureThumbnailsBatch.mockResolvedValue([]);
    mocks.fallbackCommand.mockResolvedValue([]);
    mocks.getFileIcon.mockResolvedValue('');
    mocks.readCachedListing.mockResolvedValue([]);
    mocks.writeCachedListing.mockResolvedValue(undefined);

    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: MockIntersectionObserver,
    });
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: MockResizeObserver,
    });
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => null),
    });
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(callback, 0),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test('분할 pane 복제처럼 active tab과 initialPath가 같아도 즉시 목록을 로드한다', async () => {
    const downloadPath = '/Users/me/Downloads';
    const tab: Tab = {
      history: [downloadPath],
      historyIndex: 0,
      id: 'download-tab',
      path: downloadPath,
      title: 'Downloads',
    };
    writeExplorerTabs('pane-1', [tab]);
    writeExplorerActiveTabId('pane-1', tab.id);
    mocks.listDirectory.mockResolvedValue([
      fileEntry(`${downloadPath}/sample.txt`, 'sample.txt'),
    ]);
    const { default: FileExplorer } = await import('../../components/FileExplorer');

    render(
      <FileExplorer
        instanceId="pane-1"
        isFocused
        splitMode="horizontal"
        onSplitModeChange={vi.fn()}
        initialPath={downloadPath}
        initialPathKey={1}
        onPathChange={vi.fn()}
        onAddToFavorites={vi.fn()}
        themeVars={null}
      />,
    );

    await waitFor(() => {
      expect(mocks.listDirectory).toHaveBeenCalledWith(downloadPath);
    });
    expect(await screen.findByText('sample.txt')).toBeInTheDocument();
    expect(screen.queryByText('폴더가 비어 있습니다')).not.toBeInTheDocument();
  });
});
