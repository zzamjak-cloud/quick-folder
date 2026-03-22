import { useState, useCallback } from 'react';
import { CropRect } from '../types';

/** 크롭 모드 상태 및 제어 훅 */
export function useCropMode(imageWidth: number, imageHeight: number) {
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  // 크롭 모드 시작 — 이미지 80% 영역을 초기 선택
  const startCrop = useCallback(() => {
    setCropRect({
      x: imageWidth * 0.1,
      y: imageHeight * 0.1,
      width: imageWidth * 0.8,
      height: imageHeight * 0.8,
    });
    setIsCropping(true);
  }, [imageWidth, imageHeight]);

  // 크롭 모드 취소
  const cancelCrop = useCallback(() => {
    setCropRect(null);
    setIsCropping(false);
  }, []);

  return { cropRect, setCropRect, isCropping, startCrop, cancelCrop, setIsCropping };
}
