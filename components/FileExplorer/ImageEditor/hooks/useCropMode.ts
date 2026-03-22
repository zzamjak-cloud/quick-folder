import { useState, useCallback } from 'react';
import { CropRect } from '../types';

/** 크롭 모드 상태 및 제어 훅 */
export function useCropMode() {
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  // #2: 크롭 시작 — 이미지 영역 기준 (offset + size)
  const startCrop = useCallback((imgOffsetX: number, imgOffsetY: number, imgW: number, imgH: number) => {
    setCropRect({
      x: imgOffsetX,
      y: imgOffsetY,
      width: imgW,
      height: imgH,
    });
    setIsCropping(true);
  }, []);

  const cancelCrop = useCallback(() => {
    setCropRect(null);
    setIsCropping(false);
  }, []);

  return { cropRect, setCropRect, isCropping, startCrop, cancelCrop, setIsCropping };
}
