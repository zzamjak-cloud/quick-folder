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
  // JSON
  previewJsonPath: string | null;
  previewJsonData: any | null;
  handlePreviewJson: (path: string) => void;
  closeJsonPreview: () => void;
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

  // JSON 미리보기
  const [previewJsonPath, setPreviewJsonPath] = useState<string | null>(null);
  const [previewJsonData, setPreviewJsonData] = useState<any | null>(null);

  const handlePreviewImage = useCallback(async (path: string) => {
    // 같은 파일이면 리로드 안 함 (깜빡임 방지)
    if (path === previewImagePath) return;
    setPreviewImagePath(path);
    setPreviewImageData(null);
    setPreviewLoading(true);
    try {
      const isPsd = /\.(psd|psb)$/i.test(path);
      const isIcns = /\.icns$/i.test(path);
      if (isPsd) {
        // PSD/PSB: Rust 변환 필요 (size=0 → 원본 해상도 유지)
        const b64 = await invoke<string | null>('get_psd_thumbnail', { path, size: 0 });
        if (b64) {
          setPreviewImageData(`data:image/png;base64,${b64}`);
        }
      } else if (isIcns) {
        // ICNS: 브라우저 미지원 → Rust로 PNG 변환하여 미리보기
        const b64 = await invoke<string | null>('get_file_thumbnail', { path, size: 512 });
        if (b64) {
          setPreviewImageData(`data:image/png;base64,${b64}`);
        }
      } else {
        // 일반 이미지 (PNG, JPG, ICO 등): asset 프로토콜로 직접 로딩
        setPreviewImageData(convertFileSrc(path));
      }
    } catch {
      // 미리보기 생성 실패
    } finally {
      setPreviewLoading(false);
    }
  }, [previewImagePath]);

  const closeImagePreview = useCallback(() => {
    setPreviewImagePath(null);
    setPreviewImageData(null);
  }, []);

  const handlePreviewText = useCallback(async (path: string) => {
    // 같은 파일이면 리로드하지 않음 (깜빡임 방지)
    if (path === previewTextPath) return;
    setPreviewTextPath(path);
    setPreviewTextContent(null);
    try {
      const content = await invoke<string>('read_text_file', { path, maxBytes: 100000 });
      setPreviewTextContent(content);
    } catch {
      setPreviewTextContent('파일을 읽을 수 없습니다.');
    }
  }, [previewTextPath]);

  const closeTextPreview = useCallback(() => {
    setPreviewTextPath(null);
    setPreviewTextContent(null);
  }, []);

  const handlePreviewJson = useCallback(async (path: string) => {
    // 같은 파일이면 리로드하지 않음
    if (path === previewJsonPath) return;
    setPreviewJsonPath(path);
    setPreviewJsonData(null);
    try {
      const content = await invoke<string>('read_text_file', { path, maxBytes: 1000000 }); // 1MB
      // 주석 제거 (JSONC 지원)
      const stripped = content
        .replace(/\/\/.*$/gm, '') // 한 줄 주석 제거
        .replace(/\/\*[\s\S]*?\*\//g, ''); // 블록 주석 제거
      const parsed = JSON.parse(stripped);
      setPreviewJsonData(parsed);
    } catch (e) {
      console.error('JSON 파싱 실패:', e);
      setPreviewJsonData({ _error: 'JSON 파싱에 실패했습니다. 주석이 포함된 파일은 일반 텍스트 뷰어를 사용하세요.' });
    }
  }, [previewJsonPath]);

  const closeJsonPreview = useCallback(() => {
    setPreviewJsonPath(null);
    setPreviewJsonData(null);
  }, []);

  const closeAllPreviews = useCallback(() => {
    setPreviewImagePath(null);
    setPreviewImageData(null);
    setVideoPlayerPath(null);
    setPreviewTextPath(null);
    setPreviewTextContent(null);
    setPreviewJsonPath(null);
    setPreviewJsonData(null);
  }, []);

  const isAnyPreviewOpen = !!(previewImagePath || videoPlayerPath || previewTextPath || previewJsonPath);

  return {
    videoPlayerPath, setVideoPlayerPath,
    previewImagePath, previewImageData, previewLoading,
    handlePreviewImage, closeImagePreview,
    previewTextPath, previewTextContent,
    handlePreviewText, closeTextPreview,
    previewJsonPath, previewJsonData,
    handlePreviewJson, closeJsonPreview,
    closeAllPreviews, isAnyPreviewOpen,
  };
}
