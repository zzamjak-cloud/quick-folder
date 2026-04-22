import { useState, useCallback, useRef } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

// 텍스트/MD/JSON 파일 로드 타임아웃(ms) — 구글 드라이브 동기화 미완료 파일 무한 대기 방지
const TEXT_LOAD_TIMEOUT_MS = 4000;

// 경쟁 상태: read_text_file vs timeout
async function readTextWithTimeout(path: string, maxBytes: number, timeoutMs: number = TEXT_LOAD_TIMEOUT_MS): Promise<string> {
  return await Promise.race([
    invoke<string>('read_text_file', { path, maxBytes }),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT: 파일을 불러오지 못했습니다. 클라우드 동기화가 완료되지 않은 파일일 수 있습니다.')), timeoutMs)
    ),
  ]);
}

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
  /** 편집 모드 요청 토큰 — 같은 경로로 Enter 재진입 시에도 변경되어 모달이 편집 모드로 전환 */
  previewJsonEditRequest: number;
  handlePreviewJson: (path: string, initialEdit?: boolean) => void;
  closeJsonPreview: () => void;
  // 마크다운
  previewMdPath: string | null;
  previewMdContent: string | null;
  previewMdError: string | null;
  previewMdLoading: boolean;
  handlePreviewMd: (path: string) => void;
  closeMdPreview: () => void;
  // 코드 미리보기
  codePreviewPath: string | null;
  setCodePreviewPath: (path: string | null) => void;
  // FBX 3D 미리보기
  fbxPreviewPath: string | null;
  setFbxPreviewPath: (path: string | null) => void;
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
  const [previewJsonEditRequest, setPreviewJsonEditRequest] = useState(0);

  // 마크다운 미리보기
  const [previewMdPath, setPreviewMdPath] = useState<string | null>(null);
  const [previewMdContent, setPreviewMdContent] = useState<string | null>(null);
  const [previewMdError, setPreviewMdError] = useState<string | null>(null);
  const [previewMdLoading, setPreviewMdLoading] = useState(false);
  const mdLoadRequestRef = useRef(0);
  const textLoadRequestRef = useRef(0);
  const jsonLoadRequestRef = useRef(0);

  // 코드 미리보기
  const [codePreviewPath, setCodePreviewPath] = useState<string | null>(null);

  // FBX 3D 미리보기
  const [fbxPreviewPath, setFbxPreviewPath] = useState<string | null>(null);

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
    const reqId = ++textLoadRequestRef.current;
    try {
      const content = await readTextWithTimeout(path, 100000);
      if (reqId !== textLoadRequestRef.current) return; // 오래된 응답 무시
      setPreviewTextContent(content);
    } catch (e: any) {
      if (reqId !== textLoadRequestRef.current) return;
      const msg = String(e?.message || e || '');
      setPreviewTextContent(msg.startsWith('TIMEOUT') ? msg.replace(/^TIMEOUT:\s*/, '') : '파일을 읽을 수 없습니다.');
    }
  }, [previewTextPath]);

  const closeTextPreview = useCallback(() => {
    setPreviewTextPath(null);
    setPreviewTextContent(null);
    textLoadRequestRef.current++; // 진행 중 요청 무효화
  }, []);

  const handlePreviewJson = useCallback(async (path: string, initialEdit = false) => {
    // 편집 모드 요청이면 토큰 증가 (같은 경로에서도 편집 모드 재진입 가능)
    if (initialEdit) setPreviewJsonEditRequest(n => n + 1);
    // 같은 파일이면 리로드하지 않음
    if (path === previewJsonPath) return;
    setPreviewJsonPath(path);
    setPreviewJsonData(null);
    const reqId = ++jsonLoadRequestRef.current;
    try {
      const content = await readTextWithTimeout(path, 1000000);
      if (reqId !== jsonLoadRequestRef.current) return;
      // 주석 제거 (JSONC 지원) — 문자열 리터럴 내부의 // 는 보존
      const stripped = content.replace(
        /"(?:[^"\\]|\\.)*"|\/\/.*$|\/\*[\s\S]*?\*\//gm,
        (match) => match.startsWith('"') ? match : ''
      );
      const parsed = JSON.parse(stripped);
      setPreviewJsonData(parsed);
    } catch (e: any) {
      if (reqId !== jsonLoadRequestRef.current) return;
      console.error('JSON 로드 실패:', e);
      const msg = String(e?.message || e || '');
      if (msg.startsWith('TIMEOUT')) {
        setPreviewJsonData({ _error: msg.replace(/^TIMEOUT:\s*/, '') });
      } else {
        setPreviewJsonData({ _error: 'JSON 파싱에 실패했습니다. 주석이 포함된 파일은 일반 텍스트 뷰어를 사용하세요.' });
      }
    }
  }, [previewJsonPath]);

  const closeJsonPreview = useCallback(() => {
    setPreviewJsonPath(null);
    setPreviewJsonData(null);
    jsonLoadRequestRef.current++;
  }, []);

  const handlePreviewMd = useCallback(async (path: string) => {
    // 같은 파일이면 리로드하지 않음
    if (path === previewMdPath) return;
    setPreviewMdPath(path);
    setPreviewMdContent(null);
    setPreviewMdError(null);
    setPreviewMdLoading(true);
    const reqId = ++mdLoadRequestRef.current;
    try {
      const content = await readTextWithTimeout(path, 1048576);
      if (reqId !== mdLoadRequestRef.current) return;
      setPreviewMdContent(content);
      setPreviewMdError(null);
    } catch (e: any) {
      if (reqId !== mdLoadRequestRef.current) return;
      const msg = String(e?.message || e || '');
      setPreviewMdError(msg.startsWith('TIMEOUT') ? msg.replace(/^TIMEOUT:\s*/, '') : '마크다운 파일을 불러올 수 없습니다.');
      setPreviewMdContent('');
    } finally {
      if (reqId === mdLoadRequestRef.current) setPreviewMdLoading(false);
    }
  }, [previewMdPath]);

  const closeMdPreview = useCallback(() => {
    setPreviewMdPath(null);
    setPreviewMdContent(null);
    setPreviewMdError(null);
    setPreviewMdLoading(false);
    mdLoadRequestRef.current++;
  }, []);

  const closeAllPreviews = useCallback(() => {
    setPreviewImagePath(null);
    setPreviewImageData(null);
    setVideoPlayerPath(null);
    setPreviewTextPath(null);
    setPreviewTextContent(null);
    setPreviewJsonPath(null);
    setPreviewJsonData(null);
    setPreviewMdPath(null);
    setPreviewMdContent(null);
    setPreviewMdError(null);
    setPreviewMdLoading(false);
    setCodePreviewPath(null);
    setFbxPreviewPath(null);
    // 진행 중 로드 무효화
    textLoadRequestRef.current++;
    jsonLoadRequestRef.current++;
    mdLoadRequestRef.current++;
  }, []);

  const isAnyPreviewOpen = !!(previewImagePath || videoPlayerPath || previewTextPath || previewJsonPath || previewMdPath || codePreviewPath || fbxPreviewPath);

  return {
    videoPlayerPath, setVideoPlayerPath,
    previewImagePath, previewImageData, previewLoading,
    handlePreviewImage, closeImagePreview,
    previewTextPath, previewTextContent,
    handlePreviewText, closeTextPreview,
    previewJsonPath, previewJsonData, previewJsonEditRequest,
    handlePreviewJson, closeJsonPreview,
    previewMdPath, previewMdContent, previewMdError, previewMdLoading,
    handlePreviewMd, closeMdPreview,
    codePreviewPath, setCodePreviewPath,
    fbxPreviewPath, setFbxPreviewPath,
    closeAllPreviews, isAnyPreviewOpen,
  };
}
