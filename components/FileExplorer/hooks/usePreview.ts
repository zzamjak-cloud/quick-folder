import { useState, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

export interface PreviewState {
  // 비디오
  videoPlayerPath: string | null;
  setVideoPlayerPath: (path: string | null) => void;
  // 이미지/PSD
  previewImagePath: string | null;
  previewImageData: string | null;
  previewLoading: boolean;
  handlePreviewImage: (path: string) => void;
  closeImagePreview: () => void;
  // 텍스트
  previewTextPath: string | null;
  previewTextContent: string | null;
  handlePreviewText: (path: string) => void;
  closeTextPreview: () => void;
  // 전체 닫기
  closeAllPreviews: () => void;
  // 미리보기 열려있는지 확인
  isAnyPreviewOpen: boolean;
}

export function usePreview(): PreviewState {
  // 비디오 플레이어
  const [videoPlayerPath, setVideoPlayerPath] = useState<string | null>(null);

  // 이미지/PSD 미리보기
  const [previewImagePath, setPreviewImagePath] = useState<string | null>(null);
  const [previewImageData, setPreviewImageData] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 텍스트 미리보기
  const [previewTextPath, setPreviewTextPath] = useState<string | null>(null);
  const [previewTextContent, setPreviewTextContent] = useState<string | null>(null);

  const handlePreviewImage = useCallback(async (path: string) => {
    setPreviewImagePath(path);
    setPreviewImageData(null);
    setPreviewLoading(true);
    try {
      const isPsd = /\.(psd|psb)$/i.test(path);
      if (isPsd) {
        // PSD/PSB: Rust 변환 필요 (원본에 가깝게 큰 해상도)
        const b64 = await invoke<string | null>('get_psd_thumbnail', { path, size: 4096 });
        if (b64) {
          setPreviewImageData(`data:image/png;base64,${b64}`);
        }
      } else {
        // 일반 이미지: 원본 파일을 asset 프로토콜로 직접 로딩
        setPreviewImageData(convertFileSrc(path));
      }
    } catch {
      // 미리보기 생성 실패
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const closeImagePreview = useCallback(() => {
    setPreviewImagePath(null);
    setPreviewImageData(null);
  }, []);

  const handlePreviewText = useCallback(async (path: string) => {
    setPreviewTextPath(path);
    setPreviewTextContent(null);
    try {
      const content = await invoke<string>('read_text_file', { path, maxBytes: 100000 });
      setPreviewTextContent(content);
    } catch {
      setPreviewTextContent('파일을 읽을 수 없습니다.');
    }
  }, []);

  const closeTextPreview = useCallback(() => {
    setPreviewTextPath(null);
    setPreviewTextContent(null);
  }, []);

  const closeAllPreviews = useCallback(() => {
    setPreviewImagePath(null);
    setPreviewImageData(null);
    setVideoPlayerPath(null);
    setPreviewTextPath(null);
    setPreviewTextContent(null);
  }, []);

  const isAnyPreviewOpen = !!(previewImagePath || videoPlayerPath || previewTextPath);

  return {
    videoPlayerPath, setVideoPlayerPath,
    previewImagePath, previewImageData, previewLoading,
    handlePreviewImage, closeImagePreview,
    previewTextPath, previewTextContent,
    handlePreviewText, closeTextPreview,
    closeAllPreviews, isAnyPreviewOpen,
  };
}
