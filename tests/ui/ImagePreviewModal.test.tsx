import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { ImagePreviewModal } from '../../components/FileExplorer/ImagePreviewModal';
import type { PreviewState } from '../../components/FileExplorer/hooks/usePreview';

vi.mock('../../utils/tauriCommands', () => ({
  tauriCommands: {
    cropImage: vi.fn(),
    saveAnnotatedImage: vi.fn(),
    compressImagePreview: vi.fn(),
    compressImage: vi.fn(),
    resizeImage: vi.fn(),
  },
}));

function createPreview(overrides: Partial<PreviewState> = {}): PreviewState {
  return {
    videoPlayerPath: null,
    setVideoPlayerPath: vi.fn(),
    previewImagePath: '/tmp/photo.png',
    previewImageData: 'data:image/png;base64,AAAA',
    previewLoading: false,
    previewImageEditRequest: 0,
    handlePreviewImage: vi.fn(),
    closeImagePreview: vi.fn(),
    previewTextPath: null,
    previewTextContent: null,
    handlePreviewText: vi.fn(),
    closeTextPreview: vi.fn(),
    previewJsonPath: null,
    previewJsonData: null,
    previewJsonEditRequest: 0,
    handlePreviewJson: vi.fn(),
    closeJsonPreview: vi.fn(),
    previewMdPath: null,
    previewMdContent: null,
    previewMdError: null,
    previewMdLoading: false,
    handlePreviewMd: vi.fn(),
    closeMdPreview: vi.fn(),
    codePreviewPath: null,
    setCodePreviewPath: vi.fn(),
    codePreviewEditRequest: 0,
    handleCodePreview: vi.fn(),
    modelPreviewPath: null,
    setModelPreviewPath: vi.fn(),
    hwpPreviewPath: null,
    setHwpPreviewPath: vi.fn(),
    closeAllPreviews: vi.fn(),
    isAnyPreviewOpen: true,
    ...overrides,
  };
}

describe('ImagePreviewModal', () => {
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
  let rectSpy: ReturnType<typeof vi.spyOn>;
  let imageLayout = {
    containerLeft: 20,
    containerTop: 10,
    imageLeft: 100,
    imageTop: 70,
    imageWidth: 200,
    imageHeight: 100,
  };

  beforeAll(() => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => ({
        save: vi.fn(),
        restore: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        measureText: vi.fn(() => ({ width: 48 })),
        fillText: vi.fn(),
        ellipse: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        arc: vi.fn(),
      })),
    });
  });

  afterAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: originalGetContext,
    });
  });

  beforeEach(() => {
    imageLayout = {
      containerLeft: 20,
      containerTop: 10,
      imageLeft: 100,
      imageTop: 70,
      imageWidth: 200,
      imageHeight: 100,
    };

    rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function getRect() {
      if (this instanceof HTMLImageElement) {
        return {
          x: imageLayout.imageLeft,
          y: imageLayout.imageTop,
          left: imageLayout.imageLeft,
          top: imageLayout.imageTop,
          right: imageLayout.imageLeft + imageLayout.imageWidth,
          bottom: imageLayout.imageTop + imageLayout.imageHeight,
          width: imageLayout.imageWidth,
          height: imageLayout.imageHeight,
          toJSON: () => ({}),
        } as DOMRect;
      }

      if (this instanceof HTMLElement && this.classList.contains('p-4')) {
        return {
          x: imageLayout.containerLeft,
          y: imageLayout.containerTop,
          left: imageLayout.containerLeft,
          top: imageLayout.containerTop,
          right: imageLayout.containerLeft + 500,
          bottom: imageLayout.containerTop + 320,
          width: 500,
          height: 320,
          toJSON: () => ({}),
        } as DOMRect;
      }

      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
  });

  afterEach(() => {
    cleanup();
    rectSpy.mockRestore();
  });

  test('편집 모드 진입 후 바뀐 이미지 위치로 drawing overlay를 다시 맞춘다', async () => {
    const { container, getAllByRole } = render(
      <ImagePreviewModal
        preview={createPreview()}
        themeVars={null}
      />,
    );

    const img = container.querySelector('img') as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 1000 });
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 500 });
    fireEvent.load(img);

    expect((container.querySelector('canvas')?.parentElement as HTMLElement).style.left).toBe('80px');
    expect((container.querySelector('canvas')?.parentElement as HTMLElement).style.top).toBe('60px');

    imageLayout = {
      containerLeft: 40,
      containerTop: 20,
      imageLeft: 170,
      imageTop: 95,
      imageWidth: 200,
      imageHeight: 100,
    };

    fireEvent.click(getAllByRole('button')[0]);

    await waitFor(() => {
      const overlay = container.querySelector('canvas')?.parentElement as HTMLElement;
      expect(overlay.style.left).toBe('130px');
      expect(overlay.style.top).toBe('75px');
    });
  });
});
