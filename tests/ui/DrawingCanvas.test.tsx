import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import DrawingCanvas from '../../components/FileExplorer/DrawingCanvas';

describe('DrawingCanvas', () => {
  let strokeRect: ReturnType<typeof vi.fn>;
  let getContextSpy: ReturnType<typeof vi.spyOn>;
  let rectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    strokeRect = vi.fn();
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      strokeRect,
      ellipse: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    rectSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => {
    getContextSpy.mockRestore();
    rectSpy.mockRestore();
  });

  test('사각형 드래그가 캔버스 밖 window 이벤트까지 이어져 이미지 경계에서 확정된다', () => {
    const onHasStrokes = vi.fn();
    const { container } = render(
      <DrawingCanvas
        imageRect={{ width: 100, height: 100 }}
        naturalSize={{ width: 1000, height: 1000 }}
        tool="rect"
        color="#EF4444"
        lineWidth={4}
        imageSrc="data:image/png;base64,"
        onHasStrokes={onHasStrokes}
      />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();

    fireEvent.mouseDown(canvas!, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 75, buttons: 1 });
    fireEvent.mouseUp(window, { button: 0, clientX: 140, clientY: 75 });

    expect(strokeRect).toHaveBeenLastCalledWith(10, 10, 90, 65);
    expect(onHasStrokes).toHaveBeenCalledWith(true);
  });
});
