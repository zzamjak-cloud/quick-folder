import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { DrawingTool, DrawingUndoAction, Stroke, StrokeType } from '../../types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface DrawingCanvasProps {
  /** 화면에 표시되는 이미지 영역 크기 (px) */
  imageRect: { width: number; height: number };
  /** 원본 이미지 실제 픽셀 크기 */
  naturalSize: { width: number; height: number };
  /** 현재 선택된 드로잉 도구 */
  tool: DrawingTool;
  /** 펜/도형 색상 */
  color: string;
  /** 선 굵기 (px, 표시 크기 기준) */
  lineWidth: number;
  /** 지우개 커서 강조색 (선택적) */
  accentColor?: string;
  /** 합성 저장에 사용할 원본 이미지 src */
  imageSrc: string;
  /** 스트로크 존재 여부가 바뀔 때 호출 */
  onHasStrokes?: (has: boolean) => void;
}

// ─── Handle (forwardRef 노출 인터페이스) ──────────────────────────────────────

export interface DrawingCanvasHandle {
  /** 모든 스트로크 삭제 */
  clearAll: () => void;
  /** 원본 이미지 위에 스트로크를 합성하여 PNG DataURL 반환 */
  compositeToDataUrl: () => Promise<string | null>;
}

// ─── 상수 ────────────────────────────────────────────────────────────────────

/** 지우개 클릭 시 히트 판정 정규화 거리 임계값 */
const ERASER_THRESHOLD = 0.02;
/** rect/ellipse 최소 크기 (정규화 단위) */
const MIN_SHAPE_SIZE = 0.005;

// ─── 헬퍼: 단일 스트로크 렌더링 ──────────────────────────────────────────────

/**
 * 캔버스 컨텍스트에 스트로크 하나를 그린다.
 * @param ctx  Canvas 2D 컨텍스트
 * @param stroke  렌더링할 스트로크 데이터
 * @param w  캔버스 픽셀 너비
 * @param h  캔버스 픽셀 높이
 * @param scaledLineWidth  실제 사용할 선 굵기 (픽셀)
 */
function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  w: number,
  h: number,
  scaledLineWidth?: number,
): void {
  const lw = scaledLineWidth ?? stroke.width;
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.type === 'pen') {
    // 펜: 저장된 경로 점들을 순서대로 연결
    if (stroke.points.length < 2) {
      // 점 하나인 경우 원으로 표시
      if (stroke.points.length === 1) {
        const px = stroke.points[0].x * w;
        const py = stroke.points[0].y * h;
        ctx.beginPath();
        ctx.arc(px, py, lw / 2, 0, Math.PI * 2);
        ctx.fillStyle = stroke.color;
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * w, stroke.points[0].y * h);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * w, stroke.points[i].y * h);
      }
      ctx.stroke();
    }
  } else if (stroke.type === 'rect') {
    // 사각형: points[0]=시작, points[1]=끝
    if (stroke.points.length === 2) {
      const x0 = stroke.points[0].x * w;
      const y0 = stroke.points[0].y * h;
      const x1 = stroke.points[1].x * w;
      const y1 = stroke.points[1].y * h;
      ctx.beginPath();
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }
  } else if (stroke.type === 'ellipse') {
    // 타원: points[0]=시작, points[1]=끝
    if (stroke.points.length === 2) {
      const x0 = stroke.points[0].x * w;
      const y0 = stroke.points[0].y * h;
      const x1 = stroke.points[1].x * w;
      const y1 = stroke.points[1].y * h;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const rx = Math.abs(x1 - x0) / 2;
      const ry = Math.abs(y1 - y0) / 2;
      if (rx > 0 && ry > 0) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

// ─── 헬퍼: 지우개 히트 판정 ───────────────────────────────────────────────────

/**
 * 클릭 지점(mx, my — 정규화)이 스트로크에 닿는지 판정한다.
 */
function isHit(stroke: Stroke, mx: number, my: number): boolean {
  const thr = ERASER_THRESHOLD;

  if (stroke.type === 'pen') {
    // 펜: 임의 점 중 하나라도 임계값 내에 있으면 히트
    return stroke.points.some(
      (p) => Math.hypot(p.x - mx, p.y - my) < thr,
    );
  }

  if (stroke.points.length < 2) return false;
  const x0 = stroke.points[0].x;
  const y0 = stroke.points[0].y;
  const x1 = stroke.points[1].x;
  const y1 = stroke.points[1].y;

  if (stroke.type === 'rect') {
    // 사각형: 4개 변에 대한 근접 판정
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);

    // 수평 변 (top/bottom): x 범위 내이고 y가 가까운지
    const nearTop = Math.abs(my - minY) < thr && mx >= minX - thr && mx <= maxX + thr;
    const nearBottom = Math.abs(my - maxY) < thr && mx >= minX - thr && mx <= maxX + thr;
    // 수직 변 (left/right): y 범위 내이고 x가 가까운지
    const nearLeft = Math.abs(mx - minX) < thr && my >= minY - thr && my <= maxY + thr;
    const nearRight = Math.abs(mx - maxX) < thr && my >= minY - thr && my <= maxY + thr;

    return nearTop || nearBottom || nearLeft || nearRight;
  }

  if (stroke.type === 'ellipse') {
    // 타원 경계 근접 판정: ((mx-cx)/rx)^2 + ((my-cy)/ry)^2 ≈ 1
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = Math.abs(x1 - x0) / 2;
    const ry = Math.abs(y1 - y0) / 2;
    if (rx < 1e-6 || ry < 1e-6) return false;
    const val = Math.pow((mx - cx) / rx, 2) + Math.pow((my - cy) / ry, 2);
    // 1에 가까울수록 경계에 가깝다. 임계값 비율로 판정
    const relThr = thr / Math.min(rx, ry);
    return Math.abs(val - 1) < relThr;
  }

  return false;
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  (
    {
      imageRect,
      naturalSize,
      tool,
      color,
      lineWidth,
      accentColor,
      imageSrc,
      onHasStrokes,
    },
    ref,
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    /** 확정된 스트로크 배열 */
    const strokesRef = useRef<Stroke[]>([]);
    /** undo 스택 */
    const undoStackRef = useRef<DrawingUndoAction[]>([]);

    /** 현재 드래그 중인 임시 스트로크 (실시간 미리보기용) */
    const [previewStroke, setPreviewStroke] = useState<Stroke | null>(null);

    /** mouseDown 시 기록한 시작점 (정규화) */
    const dragStartRef = useRef<{ x: number; y: number } | null>(null);
    /** 현재 드래그 중인지 여부 */
    const isDraggingRef = useRef(false);
    /** 펜 도구 실시간 경로 (렌더 성능을 위해 ref로 관리) */
    const penPointsRef = useRef<{ x: number; y: number }[]>([]);

    // ─── 캔버스 전체 다시 그리기 ────────────────────────────────────────────

    const redraw = useCallback((extraStroke?: Stroke) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // 확정 스트로크 전부 렌더링
      for (const s of strokesRef.current) {
        renderStroke(ctx, s, w, h);
      }

      // 실시간 미리보기 스트로크 (드래그 중)
      if (extraStroke) {
        renderStroke(ctx, extraStroke, w, h);
      }
    }, []);

    // ─── 좌표 변환: 마우스 이벤트 → 정규화 (0~1) ────────────────────────────

    const toNorm = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height,
        };
      },
      [],
    );

    // ─── 스트로크 존재 여부 알림 ─────────────────────────────────────────────

    const notifyHasStrokes = useCallback(
      (strokes: Stroke[]) => {
        onHasStrokes?.(strokes.length > 0);
      },
      [onHasStrokes],
    );

    // ─── 마우스 이벤트 핸들러 ────────────────────────────────────────────────

    const handleMouseDown = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (e.button !== 0) return; // 좌클릭만 처리
        e.preventDefault();

        const pos = toNorm(e);

        if (tool === 'eraser') {
          // 지우개: 히트된 첫 번째 스트로크 삭제
          const idx = strokesRef.current.findIndex((s) => isHit(s, pos.x, pos.y));
          if (idx !== -1) {
            const removed = strokesRef.current[idx];
            strokesRef.current = [
              ...strokesRef.current.slice(0, idx),
              ...strokesRef.current.slice(idx + 1),
            ];
            undoStackRef.current.push({ type: 'erase', stroke: removed, index: idx });
            notifyHasStrokes(strokesRef.current);
            redraw();
          }
          return;
        }

        // 펜/rect/ellipse: 드래그 시작
        isDraggingRef.current = true;
        dragStartRef.current = pos;

        if (tool === 'pen') {
          penPointsRef.current = [pos];
        }
      },
      [tool, toNorm, redraw, notifyHasStrokes],
    );

    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDraggingRef.current || !dragStartRef.current) return;
        e.preventDefault();

        const pos = toNorm(e);
        const start = dragStartRef.current;

        if (tool === 'pen') {
          // Shift: X축 또는 Y축으로 스냅
          let snapped = pos;
          if (e.shiftKey) {
            const dx = Math.abs(pos.x - start.x);
            const dy = Math.abs(pos.y - start.y);
            snapped = dx > dy
              ? { x: pos.x, y: start.y }   // X축 잠금
              : { x: start.x, y: pos.y };   // Y축 잠금
          }
          penPointsRef.current.push(snapped);

          // 실시간 미리보기
          const preview: Stroke = {
            type: 'pen',
            points: [...penPointsRef.current],
            color,
            width: lineWidth,
          };
          redraw(preview);
          setPreviewStroke(preview);
        } else if (tool === 'rect' || tool === 'ellipse') {
          // Shift: 정사각형 / 정원 강제
          let ex = pos.x;
          let ey = pos.y;
          if (e.shiftKey) {
            const adx = Math.abs(pos.x - start.x);
            const ady = Math.abs(pos.y - start.y);
            const side = Math.max(adx, ady);
            ex = start.x + Math.sign(pos.x - start.x) * side;
            ey = start.y + Math.sign(pos.y - start.y) * side;
          }

          const preview: Stroke = {
            type: tool as StrokeType,
            points: [start, { x: ex, y: ey }],
            color,
            width: lineWidth,
          };
          redraw(preview);
          setPreviewStroke(preview);
        }
      },
      [tool, color, lineWidth, toNorm, redraw],
    );

    const handleMouseUp = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDraggingRef.current || !dragStartRef.current) return;
        isDraggingRef.current = false;
        e.preventDefault();

        const pos = toNorm(e);
        const start = dragStartRef.current;
        dragStartRef.current = null;
        setPreviewStroke(null);

        let finalStroke: Stroke | null = null;

        if (tool === 'pen') {
          // Shift 스냅 적용한 마지막 점 추가
          let snapped = pos;
          if (e.shiftKey && penPointsRef.current.length > 0) {
            const s0 = penPointsRef.current[0];
            const dx = Math.abs(pos.x - s0.x);
            const dy = Math.abs(pos.y - s0.y);
            snapped = dx > dy ? { x: pos.x, y: s0.y } : { x: s0.x, y: pos.y };
          }
          penPointsRef.current.push(snapped);

          if (penPointsRef.current.length >= 1) {
            finalStroke = {
              type: 'pen',
              points: [...penPointsRef.current],
              color,
              width: lineWidth,
            };
          }
          penPointsRef.current = [];
        } else if (tool === 'rect' || tool === 'ellipse') {
          let ex = pos.x;
          let ey = pos.y;
          if (e.shiftKey) {
            const adx = Math.abs(pos.x - start.x);
            const ady = Math.abs(pos.y - start.y);
            const side = Math.max(adx, ady);
            ex = start.x + Math.sign(pos.x - start.x) * side;
            ey = start.y + Math.sign(pos.y - start.y) * side;
          }

          // 최소 크기 검사
          const adx = Math.abs(ex - start.x);
          const ady = Math.abs(ey - start.y);
          if (adx > MIN_SHAPE_SIZE || ady > MIN_SHAPE_SIZE) {
            finalStroke = {
              type: tool as StrokeType,
              points: [start, { x: ex, y: ey }],
              color,
              width: lineWidth,
            };
          }
        }

        if (finalStroke) {
          strokesRef.current = [...strokesRef.current, finalStroke];
          undoStackRef.current.push({ type: 'add', stroke: finalStroke });
          notifyHasStrokes(strokesRef.current);
        }

        redraw();
      },
      [tool, color, lineWidth, toNorm, redraw, notifyHasStrokes],
    );

    /** 캔버스 밖으로 마우스가 나갈 때 드래그 취소 */
    const handleMouseLeave = useCallback(() => {
      if (isDraggingRef.current && tool === 'pen') {
        // 펜은 나가면 스트로크 확정
        if (penPointsRef.current.length >= 1) {
          const finalStroke: Stroke = {
            type: 'pen',
            points: [...penPointsRef.current],
            color,
            width: lineWidth,
          };
          strokesRef.current = [...strokesRef.current, finalStroke];
          undoStackRef.current.push({ type: 'add', stroke: finalStroke });
          notifyHasStrokes(strokesRef.current);
        }
        penPointsRef.current = [];
        isDraggingRef.current = false;
        dragStartRef.current = null;
        setPreviewStroke(null);
        redraw();
      }
    }, [tool, color, lineWidth, redraw, notifyHasStrokes]);

    // ─── Ctrl+Z 단축키 (캡처 단계, 글로벌 단축키 차단) ─────────────────────

    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          const last = undoStackRef.current.pop();
          if (!last) return;

          e.stopImmediatePropagation();
          e.preventDefault();

          if (last.type === 'add') {
            // 마지막으로 추가한 스트로크 제거
            strokesRef.current = strokesRef.current.slice(0, -1);
          } else if (last.type === 'erase') {
            // 삭제된 스트로크를 원래 위치에 복원
            const arr = [...strokesRef.current];
            arr.splice(last.index, 0, last.stroke);
            strokesRef.current = arr;
          }

          notifyHasStrokes(strokesRef.current);
          redraw();
        }
      };

      // 캡처 단계로 등록하여 TipTap 등 다른 핸들러보다 먼저 처리
      window.addEventListener('keydown', onKeyDown, true);
      return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [redraw, notifyHasStrokes]);

    // ─── 캔버스 크기 동기화 ──────────────────────────────────────────────────

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = imageRect.width;
      canvas.height = imageRect.height;
      redraw();
    }, [imageRect.width, imageRect.height, redraw]);

    // ─── 커서 스타일 결정 ────────────────────────────────────────────────────

    const cursorStyle = (): string => {
      if (tool === 'eraser') return 'cell';
      if (tool === 'pen') return 'crosshair';
      return 'crosshair';
    };

    // ─── forwardRef 핸들 구현 ────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      clearAll() {
        strokesRef.current = [];
        undoStackRef.current = [];
        penPointsRef.current = [];
        isDraggingRef.current = false;
        dragStartRef.current = null;
        setPreviewStroke(null);
        notifyHasStrokes([]);
        redraw();
      },

      async compositeToDataUrl(): Promise<string | null> {
        // 오프스크린 캔버스를 원본 이미지 크기로 생성
        const offscreen = document.createElement('canvas');
        offscreen.width = naturalSize.width;
        offscreen.height = naturalSize.height;
        const ctx = offscreen.getContext('2d');
        if (!ctx) return null;

        // 원본 이미지 그리기
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            ctx.drawImage(img, 0, 0, naturalSize.width, naturalSize.height);
            resolve();
          };
          img.onerror = () => reject(new Error('이미지 로드 실패'));
          img.src = imageSrc;
        }).catch(() => {
          // 이미지 로드 실패 시 빈 캔버스로 계속 진행
        });

        // 스트로크를 원본 크기에 맞게 스케일링하여 렌더링
        const scaleRatio = naturalSize.width / imageRect.width;
        for (const s of strokesRef.current) {
          renderStroke(
            ctx,
            s,
            naturalSize.width,
            naturalSize.height,
            s.width * scaleRatio,
          );
        }

        return offscreen.toDataURL('image/png');
      },
    }));

    // ─── 렌더 ─────────────────────────────────────────────────────────────────

    return (
      <canvas
        ref={canvasRef}
        width={imageRect.width}
        height={imageRect.height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: imageRect.width,
          height: imageRect.height,
          cursor: cursorStyle(),
          // 지우개 도구일 때 외곽선 힌트 표시
          outline: tool === 'eraser' && accentColor
            ? `2px dashed ${accentColor}`
            : undefined,
          touchAction: 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
    );
  },
);

DrawingCanvas.displayName = 'DrawingCanvas';

export default DrawingCanvas;
