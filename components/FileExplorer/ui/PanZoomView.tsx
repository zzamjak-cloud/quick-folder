import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** 확대 배율 하한·상한 — 휠을 계속 굴려도 이 범위를 벗어나지 않는다 */
const MIN_SCALE = 0.05;
const MAX_SCALE = 64;
/** 휠 한 칸당 배율 변화 */
const WHEEL_STEP = 1.15;

/** 뷰 상태 — null 이면 컨테이너 크기에 맞춰 자동 계산한다 */
interface View {
  scale: number;
  tx: number;
  ty: number;
}

export interface PanZoomHandle {
  /** 이미지 전체가 보이도록 맞춘다 */
  fit: () => void;
  /** 화면 중심을 유지한 채 지정 배율로 맞춘다 */
  zoomTo: (scale: number) => void;
}

interface PanZoomViewProps {
  /** 표시할 이미지 소스 (data URL 등) */
  src: string;
  /** 배율 1에서 차지할 너비(px). 이미지 파일의 픽셀 수가 아니라 **보여줄 논리 크기**다 */
  width: number;
  height: number;
  /** 'fit' = 컨테이너에 맞춰 시작, 'actual' = 100%로 시작 */
  initialFit: 'fit' | 'actual';
  /** 휠 확대 허용 여부 */
  zoomable?: boolean;
  alt: string;
  /** 현재 배율이 바뀔 때 알림 (배율 표시용) */
  onScaleChange?: (scale: number) => void;
}

/**
 * 휠 확대 + 드래그 패닝 이미지 뷰.
 *
 * 픽셀아트를 다루므로 항상 `image-rendering: pixelated` 로 그린다. 보간을 걸면
 * 확대했을 때 블록 경계가 흐려져 픽셀화 결과를 판정할 수 없다.
 *
 * 사용자가 한 번이라도 확대·이동하면 그 상태를 유지한다. 미리보기 이미지가 갱신될 때마다
 * 되돌리면 슬라이더를 만지는 동안 보던 위치를 계속 잃는다. 배율 변경은 버튼으로만 한다.
 */
const PanZoomView = React.forwardRef<PanZoomHandle, PanZoomViewProps>(function PanZoomView(
  { src, width, height, initialFit, zoomable = false, alt, onScaleChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  // null = 아직 사용자가 건드리지 않음 → 컨테이너 기준으로 자동 배치
  const [view, setView] = useState<View | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // 컨테이너 크기 추적 (모달 크기가 바뀌어도 맞춤이 따라간다)
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 자동 배치값: 맞춤 배율(또는 100%)로 가운데 정렬
  const autoView = useCallback((): View => {
    const w = box?.w ?? 0;
    const h = box?.h ?? 0;
    const fit = width > 0 && height > 0 ? Math.min(w / width, h / height) : 1;
    const scale = initialFit === 'fit' && fit > 0 ? fit : 1;
    return { scale, tx: (w - width * scale) / 2, ty: (h - height * scale) / 2 };
  }, [box, width, height, initialFit]);

  const resolved = view ?? autoView();
  // 이벤트 핸들러(네이티브 리스너 포함)가 항상 최신 값을 보도록 ref에 담아 둔다
  const viewRef = useRef(resolved);
  viewRef.current = resolved;

  useEffect(() => {
    onScaleChange?.(resolved.scale);
  }, [resolved.scale, onScaleChange]);

  React.useImperativeHandle(ref, () => ({
    fit: () => {
      const el = containerRef.current;
      const w = el?.clientWidth ?? 0;
      const h = el?.clientHeight ?? 0;
      const scale = width > 0 && height > 0 ? Math.min(w / width, h / height) : 1;
      setView({
        scale: scale > 0 ? scale : 1,
        tx: (w - width * scale) / 2,
        ty: (h - height * scale) / 2,
      });
    },
    zoomTo: (next: number) => {
      const el = containerRef.current;
      const current = viewRef.current;
      const cx = (el?.clientWidth ?? 0) / 2;
      const cy = (el?.clientHeight ?? 0) / 2;
      // 화면 중앙에 보이던 지점을 그대로 중앙에 둔다
      const ix = (cx - current.tx) / current.scale;
      const iy = (cy - current.ty) / current.scale;
      setView({ scale: next, tx: cx - ix * next, ty: cy - iy * next });
    },
  }), [width, height]);

  // 휠 확대 — React의 onWheel은 루트에 passive로 붙어 preventDefault가 먹지 않는다.
  // 페이지가 같이 스크롤되지 않도록 네이티브 리스너를 non-passive로 직접 단다.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !zoomable) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const current = viewRef.current;
      const factor = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
      if (next === current.scale) return;
      // 커서 밑의 이미지 좌표를 고정점으로 삼아 그 픽셀이 제자리에 남게 한다
      const ix = (px - current.tx) / current.scale;
      const iy = (py - current.ty) / current.scale;
      setView({ scale: next, tx: px - ix * next, ty: py - iy * next });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomable]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // 좌클릭·터치만 — 우클릭은 컨텍스트 메뉴에 양보한다
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const start = dragRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    const current = viewRef.current;
    setView({ scale: current.scale, tx: current.tx + dx, ty: current.ty + dy });
  };

  const endDrag = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden touch-none"
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width,
          height,
          // Tailwind preflight의 `img { max-width: 100% }` 를 반드시 풀어야 한다.
          // 인라인 width 보다 max-width 제약이 우선이라, 컨테이너보다 큰 이미지는 가로만
          // 컨테이너 폭으로 잘려 들어가고 세로는 그대로 남아 **가로로 찌그러진다**.
          maxWidth: 'none',
          maxHeight: 'none',
          transformOrigin: '0 0',
          transform: `translate(${resolved.tx}px, ${resolved.ty}px) scale(${resolved.scale})`,
          imageRendering: 'pixelated',
          userSelect: 'none',
        }}
      />
    </div>
  );
});

export default PanZoomView;
