import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

// PSD 미리보기 상태 + 토글 핸들러
export function usePsdPreview(path: string, size: number = 80) {
  const [psdThumbnail, setPsdThumbnail] = useState<string | null>(null);
  const [showPsdPreview, setShowPsdPreview] = useState(false);
  const [psdLoading, setPsdLoading] = useState(false);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (showPsdPreview) {
      setShowPsdPreview(false);
      return;
    }
    setShowPsdPreview(true);
    if (!psdThumbnail) {
      setPsdLoading(true);
      invoke<string | null>('get_psd_thumbnail', { path, size })
        .then(b64 => { if (b64) setPsdThumbnail(`data:image/png;base64,${b64}`); })
        .catch(() => {/* PSD 썸네일 생성 실패 무시 */})
        .finally(() => setPsdLoading(false));
    }
  }, [path, size, showPsdPreview, psdThumbnail]);

  return { psdThumbnail, showPsdPreview, psdLoading, toggle };
}
