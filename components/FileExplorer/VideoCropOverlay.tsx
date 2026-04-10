import React, { useRef, useState, useCallback, useEffect } from 'react';

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface VideoCropOverlayProps {
  /** 비디오 요소의 표시 크기 */
  videoRect: { width: number; height: number; left: number; top: number };
  /** 원본 비디오의 실제 픽셀 크기 */
  naturalSize: { width: number; height: number };
  /** 테마 색상 */
  accentColor?: string;
  /** 크롭 영역 변경 시 콜백 (원본 픽셀 좌표, null이면 크롭 없음) */
  onCropChange?: (crop: { x: number; y: number; w: number; h: number } | null) => void;
}

type DragMode = 'none' | 'create' | 'move' | 'nw' | 'ne' | 'sw' | 'se';

const HANDLE_SIZE = 8;
const MIN_CROP_SIZE = 10;

export default function VideoCropOverlay({
  videoRect,
  naturalSize,
  accentColor = '#4ade80',
  onCropChange,
}: VideoCropOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    origCrop: CropRect | null;
  }>({ mode: 'none', startX: 0, startY: 0, origCrop: null });

  // --- Canvas 렌더링 ---
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = videoRect;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    if (!crop) return;

    // 바깥 영역 어둡게
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, width, height);
    // 선택 영역 비우기
    ctx.clearRect(crop.x, crop.y, crop.w, crop.h);

    // 테두리
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);

    // 모서리 핸들
    ctx.fillStyle = accentColor;
    const handles = [
      { x: crop.x, y: crop.y },
      { x: crop.x + crop.w, y: crop.y },
      { x: crop.x, y: crop.y + crop.h },
      { x: crop.x + crop.w, y: crop.y + crop.h },
    ];
    for (const h of handles) {
      ctx.fillRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    }

    // 픽셀 크기 라벨
    const scaleX = naturalSize.width / videoRect.width;
    const scaleY = naturalSize.height / videoRect.height;
    const realW = Math.round(crop.w * scaleX);
    const realH = Math.round(crop.h * scaleY);
    const label = `${realW} × ${realH} px`;

    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    const textMetrics = ctx.measureText(label);
    const labelW = textMetrics.width + 12;
    const labelH = 20;
    const labelX = crop.x + (crop.w - labelW) / 2;
    const labelY = crop.y + crop.h + 4;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, labelW, labelH, 4);
    ctx.fill();

    ctx.fillStyle = accentColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, crop.x + crop.w / 2, labelY + labelH / 2);
  }, [crop, videoRect, naturalSize, accentColor]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  // ESC로 선택 영역 초기화
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && crop) {
        e.preventDefault();
        e.stopPropagation();
        setCrop(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [crop]);

  // 크롭 상태 변경 시 부모에 알림 (원본 픽셀 좌표로 변환)
  useEffect(() => {
    if (crop && crop.w >= MIN_CROP_SIZE && crop.h >= MIN_CROP_SIZE) {
      const scaleX = naturalSize.width / videoRect.width;
      const scaleY = naturalSize.height / videoRect.height;
      onCropChange?.({
        x: Math.round(crop.x * scaleX),
        y: Math.round(crop.y * scaleY),
        w: Math.round(crop.w * scaleX),
        h: Math.round(crop.h * scaleY),
      });
    } else {
      onCropChange?.( null);
    }
  }, [crop, naturalSize, videoRect, onCropChange]);

  // --- 드래그 모드 판별 ---
  const getDragMode = useCallback((mx: number, my: number): DragMode => {
    if (!crop) return 'create';

    const corners: { mode: DragMode; x: number; y: number }[] = [
      { mode: 'nw', x: crop.x, y: crop.y },
      { mode: 'ne', x: crop.x + crop.w, y: crop.y },
      { mode: 'sw', x: crop.x, y: crop.y + crop.h },
      { mode: 'se', x: crop.x + crop.w, y: crop.y + crop.h },
    ];

    for (const c of corners) {
      if (Math.abs(mx - c.x) <= 10 && Math.abs(my - c.y) <= 10) {
        return c.mode;
      }
    }

    if (mx >= crop.x && mx <= crop.x + crop.w && my >= crop.y && my <= crop.y + crop.h) {
      return 'move';
    }

    return 'create';
  }, [crop]);

  // --- 커서 스타일 ---
  const getCursor = useCallback((mx: number, my: number): string => {
    const mode = getDragMode(mx, my);
    switch (mode) {
      case 'nw': case 'se': return 'nwse-resize';
      case 'ne': case 'sw': return 'nesw-resize';
      case 'move': return 'move';
      default: return 'crosshair';
    }
  }, [getDragMode]);

  // --- 마우스 이벤트 ---
  const getLocalPos = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = getLocalPos(e);
    const mode = getDragMode(pos.x, pos.y);
    dragRef.current = {
      mode,
      startX: pos.x,
      startY: pos.y,
      origCrop: crop ? { ...crop } : null,
    };
  }, [getLocalPos, getDragMode, crop]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pos = getLocalPos(e);
    const { mode, startX, startY, origCrop } = dragRef.current;
    const { width: cw, height: ch } = videoRect;

    if (mode === 'none') {
      canvas.style.cursor = getCursor(pos.x, pos.y);
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (mode === 'create') {
      let x = Math.min(startX, pos.x);
      let y = Math.min(startY, pos.y);
      let w = Math.abs(pos.x - startX);
      let h = Math.abs(pos.y - startY);

      if (e.shiftKey) {
        const size = Math.max(w, h);
        w = size;
        h = size;
        if (pos.x < startX) x = startX - size;
        if (pos.y < startY) y = startY - size;
      }

      x = clamp(x, 0, cw);
      y = clamp(y, 0, ch);
      w = Math.min(w, cw - x);
      h = Math.min(h, ch - y);

      setCrop({ x, y, w, h });
    } else if (mode === 'move' && origCrop) {
      const dx = pos.x - startX;
      const dy = pos.y - startY;
      const x = clamp(origCrop.x + dx, 0, cw - origCrop.w);
      const y = clamp(origCrop.y + dy, 0, ch - origCrop.h);
      setCrop({ x, y, w: origCrop.w, h: origCrop.h });
    } else if (origCrop) {
      let { x, y, w, h } = origCrop;
      const dx = pos.x - startX;
      const dy = pos.y - startY;

      if (mode === 'se') {
        w = clamp(origCrop.w + dx, MIN_CROP_SIZE, cw - x);
        h = clamp(origCrop.h + dy, MIN_CROP_SIZE, ch - y);
      } else if (mode === 'sw') {
        const newX = clamp(origCrop.x + dx, 0, origCrop.x + origCrop.w - MIN_CROP_SIZE);
        w = origCrop.w + (origCrop.x - newX);
        h = clamp(origCrop.h + dy, MIN_CROP_SIZE, ch - y);
        x = newX;
      } else if (mode === 'ne') {
        w = clamp(origCrop.w + dx, MIN_CROP_SIZE, cw - x);
        const newY = clamp(origCrop.y + dy, 0, origCrop.y + origCrop.h - MIN_CROP_SIZE);
        h = origCrop.h + (origCrop.y - newY);
        y = newY;
      } else if (mode === 'nw') {
        const newX = clamp(origCrop.x + dx, 0, origCrop.x + origCrop.w - MIN_CROP_SIZE);
        const newY = clamp(origCrop.y + dy, 0, origCrop.y + origCrop.h - MIN_CROP_SIZE);
        w = origCrop.w + (origCrop.x - newX);
        h = origCrop.h + (origCrop.y - newY);
        x = newX;
        y = newY;
      }

      if (e.shiftKey) {
        const size = Math.min(w, h);
        w = size;
        h = size;
      }

      setCrop({ x, y, w, h });
    }
  }, [getLocalPos, getCursor, videoRect]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { mode } = dragRef.current;
    if (mode === 'create' && crop && crop.w < MIN_CROP_SIZE && crop.h < MIN_CROP_SIZE) {
      setCrop(null);
    }
    dragRef.current = { mode: 'none', startX: 0, startY: 0, origCrop: null };
  }, [crop]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: videoRect.width,
        height: videoRect.height,
        cursor: 'crosshair',
        pointerEvents: 'auto',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}
