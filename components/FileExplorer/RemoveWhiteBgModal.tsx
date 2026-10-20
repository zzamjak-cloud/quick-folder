import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ThemeVars } from './types';
import ModalShell from './ui/ModalShell';
import { Spinner } from './ui/modalStyles';
import { getFileName } from '../../utils/pathUtils';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Wand2, Download } from 'lucide-react';
import { Channel } from '@tauri-apps/api/core';
import { readJsonStorage, writeJsonStorage } from '../../utils/storage';
import { invokeTauriCommand as invoke } from '../../utils/tauriInvoke';
import type { TranslationKey } from '../../utils/i18n';
import { tauriCommands } from '../../utils/tauriCommands';
import type { AiBgDownloadProgress, AiBgOptions, AiBgStatus } from '../../utils/tauriCommandDomains/mediaCommands';

// 저장소 키
const LS_KEY = 'qf_remove_bg_settings';

// 제거 방식: 색상 기반(단색 배경) / AI 모델(사진·복잡한 배경)
type RemoveBgMode = 'color' | 'ai';

interface SavedSettings {
  threshold: number;
  feather: number;
  previewBg: string; // 'checker' 또는 hex 색상
  trim: boolean;
  mode: RemoveBgMode;
  aiModel: string;
  aiOptions: AiBgOptions;
}

const DEFAULT_SETTINGS: SavedSettings = {
  threshold: 60,
  feather: 30,
  previewBg: 'checker',
  trim: true,
  mode: 'color',
  aiModel: 'isnet-general',
  aiOptions: { cutoff: 5, sharpness: 0, refineEdges: false, decontaminate: true },
};

// AI 모델 표시 순서와 라벨 (Rust 카탈로그 id 와 일치)
const AI_MODEL_LABEL_KEYS: Record<string, TranslationKey> = {
  'isnet-general': 'removeBg.ai.model.isnet-general',
  'isnet-anime': 'removeBg.ai.model.isnet-anime',
  'birefnet-lite': 'removeBg.ai.model.birefnet-lite',
};

function loadSettings(): SavedSettings {
  // 이전 버전에서 저장한 값에는 AI 관련 필드가 없으므로 기본값 위에 덮는다
  const stored = readJsonStorage<Partial<SavedSettings>>(LS_KEY, {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    aiOptions: { ...DEFAULT_SETTINGS.aiOptions, ...(stored.aiOptions ?? {}) },
  };
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

function saveSettings(s: SavedSettings) {
  writeJsonStorage(LS_KEY, s);
}

// 어두운 체커보드 스타일 (투명 영역 표시용)
const darkCheckerboardStyle: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #444 25%, transparent 25%), ' +
    'linear-gradient(-45deg, #444 25%, transparent 25%), ' +
    'linear-gradient(45deg, transparent 75%, #444 75%), ' +
    'linear-gradient(-45deg, transparent 75%, #444 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
  backgroundColor: '#2a2a2a',
};

// 미리보기 배경 프리셋
const BG_PRESETS = [
  { labelKey: 'removeBg.previewBg.checker', value: 'checker' },
  { labelKey: 'removeBg.previewBg.black', value: '#000000' },
  { labelKey: 'removeBg.previewBg.white', value: '#ffffff' },
  { labelKey: 'removeBg.previewBg.gray', value: '#808080' },
  { labelKey: 'removeBg.previewBg.red', value: '#cc3333' },
  { labelKey: 'removeBg.previewBg.green', value: '#33cc33' },
  { labelKey: 'removeBg.previewBg.blue', value: '#3333cc' },
];

interface RemoveWhiteBgModalProps {
  paths: string[];
  onClose: () => void;
  onApply: (paths: string[], threshold: number, feather: number, seeds: [number, number][], trim: boolean) => Promise<void>;
  onApplyAi: (paths: string[], model: string, options: AiBgOptions, trim: boolean) => Promise<void>;
  themeVars: ThemeVars | null;
  t: (key: TranslationKey) => string;
}

export default function RemoveWhiteBgModal({ paths, onClose, onApply, onApplyAi, themeVars, t }: RemoveWhiteBgModalProps) {
  const saved = useMemo(loadSettings, []);

  const formatMessage = useCallback((template: string, values: Record<string, string | number>) => (
    Object.entries(values).reduce(
      (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
      template,
    )
  ), []);

  // 파라미터
  const [threshold, setThreshold] = useState(saved.threshold);
  const [feather, setFeather] = useState(saved.feather);

  // 미리보기 배경 (체커 또는 단색)
  const [previewBg, setPreviewBg] = useState(saved.previewBg);

  // 투명 여백 트림 여부
  const [trim, setTrim] = useState(saved.trim);

  // 제거 방식과 AI 설정
  const [mode, setMode] = useState<RemoveBgMode>(saved.mode);
  const [aiModel, setAiModel] = useState(saved.aiModel);
  const [aiOptions, setAiOptions] = useState<AiBgOptions>(saved.aiOptions);
  const [aiStatus, setAiStatus] = useState<AiBgStatus | null>(null);
  const [download, setDownload] = useState<AiBgDownloadProgress | null>(null);
  const [downloading, setDownloading] = useState(false);

  // 원본 미리보기 이미지의 표시 크기 — AI 결과(더 큰 해상도)를 같은 크기로 맞춰 그린다
  const [origNatural, setOrigNatural] = useState<{ w: number; h: number } | null>(null);

  // 늦게 도착한 이전 미리보기 응답이 최신 결과를 덮지 않도록 요청 번호로 거른다
  const previewRequestId = useRef(0);

  // 다중 파일 전환
  const [previewIndex, setPreviewIndex] = useState(0);

  // 줌 & 패닝
  const [zoom, setZoom] = useState(1);

  // 마술봉 시드 포인트 (원본 이미지 좌표)
  const [seedPoints, setSeedPoints] = useState<[number, number][]>([]);
  const [wandActive, setWandActive] = useState(false);

  // 원본 이미지 크기
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);

  // 미리보기 상태
  const [preview, setPreview] = useState<string | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState('');
  const [error, setError] = useState('');

  // refs
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origImgRef = useRef<HTMLImageElement | null>(null);
  const origContainerRef = useRef<HTMLDivElement | null>(null);
  const resultContainerRef = useRef<HTMLDivElement | null>(null);

  // 드래그 패닝 상태
  const dragState = useRef<{ dragging: boolean; startX: number; startY: number; scrollLeft: number; scrollTop: number }>({
    dragging: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0,
  });

  const currentPath = paths[previewIndex];
  const fileName = useMemo(() => getFileName(currentPath), [currentPath]);
  const isMulti = paths.length > 1;

  const title = isMulti
    ? formatMessage(t('removeBg.titleMulti'), { count: paths.length, current: previewIndex + 1, total: paths.length })
    : formatMessage(t('removeBg.titleSingle'), { fileName });

  // 미리보기 배경 스타일
  const previewBgStyle: React.CSSProperties = previewBg === 'checker'
    ? darkCheckerboardStyle
    : { backgroundColor: previewBg };

  // 설정 변경 시 저장소에 반영
  useEffect(() => {
    saveSettings({ threshold, feather, previewBg, trim, mode, aiModel, aiOptions });
  }, [threshold, feather, previewBg, trim, mode, aiModel, aiOptions]);

  // AI 런타임·모델 설치 상태
  const refreshAiStatus = useCallback(async () => {
    try {
      setAiStatus(await tauriCommands.aiBgStatus());
    } catch (e) {
      setError(formatMessage(t('removeBg.warning.previewFailed'), { message: String(e) }));
    }
  }, [formatMessage, t]);

  useEffect(() => {
    if (mode === 'ai' && !aiStatus) refreshAiStatus();
  }, [mode, aiStatus, refreshAiStatus]);

  const aiModelStatus = aiStatus?.models.find(m => m.id === aiModel) ?? null;
  const aiReady = !!aiStatus?.supported && aiStatus.runtimeInstalled && !!aiModelStatus?.installed;
  // 아직 받지 않은 것만 합산한 다운로드 용량
  const aiDownloadBytes = (aiStatus && !aiStatus.runtimeInstalled ? aiStatus.runtimeSizeBytes : 0)
    + (aiModelStatus && !aiModelStatus.installed ? aiModelStatus.sizeBytes : 0);

  // 런타임·모델 내려받기
  const handleAiDownload = useCallback(async () => {
    setDownloading(true);
    setError('');
    const onProgress = new Channel<AiBgDownloadProgress>();
    onProgress.onmessage = progress => setDownload(progress);
    try {
      await tauriCommands.aiBgInstall(aiModel, onProgress);
      await refreshAiStatus();
    } catch (e) {
      setError(formatMessage(t('removeBg.ai.downloadFailed'), { message: String(e) }));
    } finally {
      setDownloading(false);
      setDownload(null);
    }
  }, [aiModel, refreshAiStatus, formatMessage, t]);

  // 원본 이미지 크기 조회
  useEffect(() => {
    (async () => {
      try {
        const dims = await invoke<[number, number] | null>('get_image_dimensions', { path: currentPath });
        if (dims) setImgDims({ w: dims[0], h: dims[1] });
      } catch {
        setImgDims(null);
      }
    })();
  }, [currentPath]);

  // 파일 전환 시 시드 초기화
  useEffect(() => {
    setSeedPoints([]);
  }, [previewIndex]);

  // 원본 미리보기 로드
  const fetchOriginal = useCallback(async (path: string) => {
    try {
      const base64 = await invoke<string>('remove_white_bg_preview', {
        input: path, threshold: 0, feather: 0, seeds: [],
      });
      setOriginalPreview(base64);
    } catch {
      setOriginalPreview(null);
    }
  }, []);

  // 결과 미리보기 요청
  // 매개변수명이 번역 함수 t를 가리지 않도록 주의 (섀도잉 시 catch 블록에서 크래시)
  const fetchPreview = useCallback(async (request: () => Promise<string>) => {
    const requestId = ++previewRequestId.current;
    setLoading(true);
    setError('');
    try {
      const base64 = await request();
      if (requestId !== previewRequestId.current) return;
      setPreview(base64);
    } catch (e) {
      if (requestId !== previewRequestId.current) return;
      setError(formatMessage(t('removeBg.warning.previewFailed'), { message: String(e) }));
      setPreview(null);
    } finally {
      if (requestId === previewRequestId.current) setLoading(false);
    }
  }, [formatMessage, t]);

  useEffect(() => {
    fetchOriginal(currentPath);
  }, [currentPath, fetchOriginal]);

  // 파라미터/시드 변경 시 200ms 디바운스 후 미리보기 갱신
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (mode === 'ai' && !aiReady) {
      // 모델을 받기 전에는 미리볼 수 없다 — 진행 중이던 응답도 무시
      previewRequestId.current++;
      setPreview(null);
      setLoading(false);
      return;
    }
    debounceTimer.current = setTimeout(() => {
      fetchPreview(mode === 'ai'
        ? () => tauriCommands.aiBgPreview(currentPath, aiModel, aiOptions)
        : () => invoke<string>('remove_white_bg_preview', {
          input: currentPath, threshold, feather, seeds: seedPoints,
        }));
    }, 200);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [currentPath, mode, aiReady, aiModel, aiOptions, threshold, feather, seedPoints, fetchPreview]);

  // 이미지 클릭 → 시드 포인트 추가
  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!wandActive || !imgDims) return;
    if (dragState.current.dragging) return;
    const img = origImgRef.current;
    if (!img) return;

    const rect = img.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaleX = imgDims.w / (rect.width / zoom);
    const scaleY = imgDims.h / (rect.height / zoom);
    const origX = Math.round((clickX / zoom) * scaleX);
    const origY = Math.round((clickY / zoom) * scaleY);

    if (origX >= 0 && origX < imgDims.w && origY >= 0 && origY < imgDims.h) {
      setSeedPoints(prev => [...prev, [origX, origY]]);
    }
  }, [wandActive, imgDims, zoom]);

  // 시드 마커 스타일
  const getSeedMarkerStyle = useCallback((seed: [number, number]): React.CSSProperties | null => {
    const img = origImgRef.current;
    if (!img || !imgDims) return null;
    const x = (seed[0] / imgDims.w) * img.naturalWidth * zoom;
    const y = (seed[1] / imgDims.h) * img.naturalHeight * zoom;
    return {
      position: 'absolute',
      left: x - 5,
      top: y - 5,
      width: 10,
      height: 10,
      borderRadius: '50%',
      border: '2px solid #f43f5e',
      backgroundColor: 'rgba(244, 63, 94, 0.4)',
      pointerEvents: 'none',
    };
  }, [imgDims, zoom]);

  // 드래그 패닝 핸들러 (양쪽 컨테이너 동기)
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>, container: HTMLDivElement | null) => {
    if (!container || zoom <= 1) return;
    dragState.current = {
      dragging: false,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragState.current.dragging = true;
      }
      const sl = dragState.current.scrollLeft - dx;
      const st = dragState.current.scrollTop - dy;
      if (origContainerRef.current) {
        origContainerRef.current.scrollLeft = sl;
        origContainerRef.current.scrollTop = st;
      }
      if (resultContainerRef.current) {
        resultContainerRef.current.scrollLeft = sl;
        resultContainerRef.current.scrollTop = st;
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setTimeout(() => { dragState.current.dragging = false; }, 0);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [zoom]);

  // 저장
  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaveProgress(isMulti ? `0/${paths.length}` : '');
    try {
      if (mode === 'ai') {
        if (!aiReady) {
          setError(t('removeBg.ai.notReady'));
          return;
        }
        await onApplyAi(paths, aiModel, aiOptions, trim);
      } else {
        await onApply(paths, threshold, feather, seedPoints, trim);
      }
      onClose();
    } catch (e) {
      setError(formatMessage(t('removeBg.warning.saveFailed'), { message: String(e) }));
    } finally {
      setSaving(false);
      setSaveProgress('');
    }
  };

  // 줌
  const zoomIn = () => setZoom(z => Math.min(z + 0.25, 4));
  const zoomOut = () => setZoom(z => Math.max(z - 0.25, 0.5));
  const resetZoom = () => setZoom(1);

  // 파일 전환
  const goPrev = () => setPreviewIndex(i => Math.max(0, i - 1));
  const goNext = () => setPreviewIndex(i => Math.min(paths.length - 1, i + 1));

  const resetSeeds = () => setSeedPoints([]);

  // 리렌더 트리거
  const [, setMarkerTick] = useState(0);
  const triggerMarkerUpdate = useCallback(() => setMarkerTick(t => t + 1), []);

  const smallBtnStyle: React.CSSProperties = {
    background: themeVars?.surface ?? '#111827',
    border: `1px solid ${themeVars?.border ?? '#334155'}`,
    color: themeVars?.text ?? '#e5e7eb',
    borderRadius: 6,
    padding: '3px 6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 11,
  };

  const activeBtnStyle: React.CSSProperties = {
    ...smallBtnStyle,
    backgroundColor: themeVars?.accent ?? '#3b82f6',
    color: '#fff',
    borderColor: 'transparent',
  };

  const previewContainerBase: React.CSSProperties = {
    height: 420,
    cursor: zoom > 1 ? 'grab' : (wandActive ? 'crosshair' : 'default'),
    position: 'relative',
    overflow: 'auto',
  };

  return (
    <ModalShell
      title={title}
      maxWidth="60rem"
      saving={saving}
      saveLabel={saving && saveProgress
        ? formatMessage(t('removeBg.savingProgress'), { progress: saveProgress })
        : t('removeBg.save')}
      onClose={onClose}
      onSave={handleSave}
      themeVars={themeVars}
    >
      <div className="px-4 py-3 flex flex-col gap-3">
        {/* 툴바 */}
        <div className="flex items-center justify-between flex-wrap gap-1">
          <div className="flex items-center gap-1.5">
            <button
              style={mode === 'color' ? activeBtnStyle : smallBtnStyle}
              onClick={() => setMode('color')}
              title={t('removeBg.mode.colorTitle')}
            >
              <span>{t('removeBg.mode.color')}</span>
            </button>
            <button
              style={mode === 'ai' ? activeBtnStyle : smallBtnStyle}
              onClick={() => { setMode('ai'); setWandActive(false); }}
              title={t('removeBg.mode.aiTitle')}
            >
              <span>{t('removeBg.mode.ai')}</span>
            </button>
            <div style={{ width: 8 }} />
            {mode === 'color' && (
              <button
                style={wandActive ? activeBtnStyle : smallBtnStyle}
                onClick={() => setWandActive(v => !v)}
                title={t('removeBg.magicWandTitle')}
              >
                <Wand2 size={13} />
                <span>{t('removeBg.magicWand')}</span>
              </button>
            )}
            {mode === 'color' && seedPoints.length > 0 && (
              <button style={smallBtnStyle} onClick={resetSeeds} title={t('removeBg.resetSelectionTitle')}>
                <RotateCcw size={13} />
                <span>{formatMessage(t('removeBg.resetSelection'), { count: seedPoints.length })}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {isMulti && (
              <>
                <button style={smallBtnStyle} onClick={goPrev} disabled={previewIndex === 0}>
                  <ChevronLeft size={13} />
                </button>
                <span className="text-[10px]" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                  {previewIndex + 1}/{paths.length}
                </span>
                <button style={smallBtnStyle} onClick={goNext} disabled={previewIndex === paths.length - 1}>
                  <ChevronRight size={13} />
                </button>
                <div style={{ width: 8 }} />
              </>
            )}
            <button style={smallBtnStyle} onClick={zoomOut} title={t('removeBg.zoomOut')}><ZoomOut size={13} /></button>
            <span className="text-[10px] w-10 text-center" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button style={smallBtnStyle} onClick={zoomIn} title={t('removeBg.zoomIn')}><ZoomIn size={13} /></button>
            <button style={smallBtnStyle} onClick={resetZoom} title={t('removeBg.resetZoom')} className="text-[10px]">1:1</button>
          </div>
        </div>

        {/* 미리보기 영역 */}
        <div className="flex gap-3">
          {/* 원본 */}
          <div className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] font-medium" style={{ color: themeVars?.muted }}>
              {t('removeBg.original')} {wandActive && t('removeBg.clickToSelectBackground')}
            </span>
            <div
              ref={origContainerRef}
              className="rounded-md w-full"
              style={{
                ...previewContainerBase,
                ...previewBgStyle,
                border: `1px solid ${wandActive ? (themeVars?.accent ?? '#3b82f6') : (themeVars?.border ?? '#334155')}`,
              }}
              onClick={handleImageClick}
              onMouseDown={e => handleMouseDown(e, origContainerRef.current)}
            >
              <div style={{ width: 'fit-content', height: 'fit-content', position: 'relative', display: 'inline-block' }}>
                {originalPreview ? (
                  <img
                    ref={origImgRef}
                    src={`data:image/png;base64,${originalPreview}`}
                    alt={t('removeBg.original')}
                    onLoad={e => {
                      setOrigNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
                      triggerMarkerUpdate();
                    }}
                    draggable={false}
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', display: 'block' }}
                  />
                ) : (
                  <div style={{ width: '100%', height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Spinner themeVars={themeVars} />
                  </div>
                )}
                {origImgRef.current && seedPoints.map((seed, i) => {
                  const style = getSeedMarkerStyle(seed);
                  if (!style) return null;
                  return <div key={i} style={style} />;
                })}
              </div>
            </div>
          </div>

          {/* 결과 */}
          <div className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] font-medium" style={{ color: themeVars?.muted }}>{t('removeBg.result')}</span>
            <div
              ref={resultContainerRef}
              className="rounded-md w-full"
              style={{
                ...previewContainerBase,
                ...previewBgStyle,
                border: `1px solid ${themeVars?.border ?? '#334155'}`,
                cursor: zoom > 1 ? 'grab' : 'default',
              }}
              onMouseDown={e => handleMouseDown(e, resultContainerRef.current)}
            >
              <div style={{ width: 'fit-content', height: 'fit-content', display: 'inline-block' }}>
                {loading && (
                  <div style={{ width: '100%', height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Spinner themeVars={themeVars} />
                  </div>
                )}
                {!loading && preview && (
                  <img
                    src={`data:image/png;base64,${preview}`}
                    alt={t('removeBg.result')}
                    draggable={false}
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: 'top left',
                      display: 'block',
                      // AI 결과는 원본 미리보기보다 해상도가 높다 — 같은 너비로 그려 좌우를 맞춘다.
                      // max-width(100%) 는 원본 <img> 와 똑같이 남겨 둔다: 풀면 결과 패널이
                      // 이미지 폭만큼 늘어나 원본 패널을 찌그러뜨린다(실측).
                      ...(mode === 'ai' && origNatural ? { width: origNatural.w, height: 'auto' } : {}),
                    }}
                  />
                )}
                {mode === 'ai' && !loading && !aiReady && (
                  <div className="flex flex-col items-center justify-center gap-2 px-4 text-center" style={{ width: '100%', minHeight: 420 }}>
                    {aiStatus && !aiStatus.supported ? (
                      <span className="text-xs" style={{ color: themeVars?.muted }}>
                        {formatMessage(t('removeBg.ai.unsupported'), { reason: aiStatus.unsupportedReason ?? '' })}
                      </span>
                    ) : aiStatus ? (
                      <>
                        <span className="text-xs" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                          {formatMessage(t('removeBg.ai.downloadDescription'), { size: formatMb(aiDownloadBytes) })}
                        </span>
                        {downloading ? (
                          <div className="flex flex-col items-center gap-1" style={{ width: 220 }}>
                            <div className="w-full rounded" style={{ height: 6, background: themeVars?.border ?? '#334155' }}>
                              <div
                                className="rounded"
                                style={{
                                  height: 6,
                                  width: `${download && download.total > 0 ? Math.min(100, (download.downloaded / download.total) * 100) : 0}%`,
                                  background: themeVars?.accent ?? '#3b82f6',
                                }}
                              />
                            </div>
                            <span className="text-[10px]" style={{ color: themeVars?.muted }}>
                              {formatMessage(t('removeBg.ai.downloading'), {
                                stage: download ? t(download.stage === 'runtime' ? 'removeBg.ai.stage.runtime' : 'removeBg.ai.stage.model') : '',
                                percent: download && download.total > 0 ? Math.floor((download.downloaded / download.total) * 100) : 0,
                              })}
                            </span>
                          </div>
                        ) : (
                          <button style={activeBtnStyle} onClick={handleAiDownload}>
                            <Download size={13} />
                            <span>{formatMessage(t('removeBg.ai.download'), { size: formatMb(aiDownloadBytes) })}</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <Spinner themeVars={themeVars} />
                    )}
                  </div>
                )}
                {!loading && !preview && !error && !(mode === 'ai' && !aiReady) && (
                  <span className="text-xs" style={{ color: themeVars?.muted }}>{t('removeBg.noPreview')}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 컨트롤 영역 */}
        <div className="flex flex-col gap-2.5">
          {/* 미리보기 배경색 */}
          <div className="flex items-center gap-3">
            <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 72 }}>{t('removeBg.previewBackground')}</label>
            <div className="flex items-center gap-1 flex-wrap">
              {BG_PRESETS.map(p => (
                <button
                  key={p.value}
                  className="rounded text-[10px] px-1.5 py-0.5 cursor-pointer"
                  style={{
                    backgroundColor: previewBg === p.value ? (themeVars?.accent ?? '#3b82f6') : (themeVars?.surface ?? '#111827'),
                    color: previewBg === p.value ? '#fff' : (themeVars?.text ?? '#e5e7eb'),
                    border: `1px solid ${previewBg === p.value ? 'transparent' : (themeVars?.border ?? '#334155')}`,
                  }}
                  onClick={() => setPreviewBg(p.value)}
                >
                  {p.value !== 'checker' && (
                    <span className="inline-block w-2 h-2 rounded-sm mr-0.5 align-middle" style={{ backgroundColor: p.value, border: '1px solid #555' }} />
                  )}
                  {t(p.labelKey as TranslationKey)}
                </button>
              ))}
              <input
                type="color"
                value={previewBg === 'checker' ? '#2a2a2a' : previewBg}
                onChange={e => setPreviewBg(e.target.value)}
                className="w-5 h-5 rounded cursor-pointer"
                style={{ border: `1px solid ${themeVars?.border ?? '#334155'}`, padding: 0, background: 'none' }}
                title={t('removeBg.customColor')}
              />
            </div>
          </div>

          {mode === 'ai' && (
            <>
              {/* AI 모델 */}
              <div className="flex items-center gap-3">
                <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 72 }}>{t('removeBg.ai.model')}</label>
                <div className="flex items-center gap-1 flex-wrap">
                  {Object.entries(AI_MODEL_LABEL_KEYS).map(([id, labelKey]) => {
                    const status = aiStatus?.models.find(m => m.id === id);
                    return (
                      <button
                        key={id}
                        style={aiModel === id ? activeBtnStyle : smallBtnStyle}
                        onClick={() => setAiModel(id)}
                        disabled={downloading}
                        title={status && !status.installed
                          ? formatMessage(t('removeBg.ai.notDownloaded'), { size: formatMb(status.sizeBytes) })
                          : undefined}
                      >
                        <span>{t(labelKey)}</span>
                        {status && !status.installed && <Download size={11} style={{ opacity: 0.7 }} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 잔여 반투명 제거 */}
              <div className="flex items-center gap-3">
                <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 72 }}>{t('removeBg.ai.cutoff')}</label>
                <input
                  type="range" min={0} max={100} value={aiOptions.cutoff}
                  onChange={e => setAiOptions(o => ({ ...o, cutoff: Number(e.target.value) }))}
                  onKeyDown={e => e.stopPropagation()}
                  className="flex-1"
                  style={{ accentColor: themeVars?.accent ?? '#3b82f6' }}
                />
                <span className="w-10 text-center text-xs" style={{ color: themeVars?.text ?? '#e5e7eb' }}>{aiOptions.cutoff}</span>
              </div>

              {/* 경계 선명도 */}
              <div className="flex items-center gap-3">
                <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 72 }}>{t('removeBg.ai.sharpness')}</label>
                <input
                  type="range" min={0} max={100} value={aiOptions.sharpness}
                  onChange={e => setAiOptions(o => ({ ...o, sharpness: Number(e.target.value) }))}
                  onKeyDown={e => e.stopPropagation()}
                  className="flex-1"
                  style={{ accentColor: themeVars?.accent ?? '#3b82f6' }}
                />
                <span className="w-10 text-center text-xs" style={{ color: themeVars?.text ?? '#e5e7eb' }}>{aiOptions.sharpness}</span>
              </div>

              {/* 보정 옵션 */}
              <div className="flex items-center gap-3">
                <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 72 }}>{t('removeBg.ai.options')}</label>
                <label className="flex items-center gap-2 cursor-pointer" title={t('removeBg.ai.decontaminateTitle')}>
                  <input
                    type="checkbox"
                    checked={aiOptions.decontaminate}
                    onChange={e => setAiOptions(o => ({ ...o, decontaminate: e.target.checked }))}
                    style={{ accentColor: themeVars?.accent ?? '#3b82f6', width: 14, height: 14 }}
                  />
                  <span className="text-xs" style={{ color: themeVars?.text ?? '#e5e7eb' }}>{t('removeBg.ai.decontaminate')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer" title={t('removeBg.ai.refineEdgesTitle')}>
                  <input
                    type="checkbox"
                    checked={aiOptions.refineEdges}
                    onChange={e => setAiOptions(o => ({ ...o, refineEdges: e.target.checked }))}
                    style={{ accentColor: themeVars?.accent ?? '#3b82f6', width: 14, height: 14 }}
                  />
                  <span className="text-xs" style={{ color: themeVars?.text ?? '#e5e7eb' }}>{t('removeBg.ai.refineEdges')}</span>
                </label>
              </div>
            </>
          )}

          {/* Threshold 슬라이더 (색상 기반 전용) */}
          {mode === 'color' && (<>
          <div className="flex items-center gap-3">
            <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 72 }}>{t('removeBg.threshold')}</label>
            <input
              type="range" min={0} max={100} value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              onKeyDown={e => e.stopPropagation()}
              className="flex-1"
              style={{ accentColor: themeVars?.accent ?? '#3b82f6' }}
            />
            <span className="w-10 text-center text-xs" style={{ color: themeVars?.text ?? '#e5e7eb' }}>{threshold}</span>
          </div>

          {/* Feather 슬라이더 */}
          <div className="flex items-center gap-3">
            <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 72 }}>{t('removeBg.feather')}</label>
            <input
              type="range" min={0} max={50} value={feather}
              onChange={e => setFeather(Number(e.target.value))}
              onKeyDown={e => e.stopPropagation()}
              className="flex-1"
              style={{ accentColor: themeVars?.accent ?? '#3b82f6' }}
            />
            <span className="w-10 text-center text-xs" style={{ color: themeVars?.text ?? '#e5e7eb' }}>{feather}</span>
          </div>
          </>)}

          {/* Trim 체크박스 */}
          <div className="flex items-center gap-3">
            <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 72 }}>{t('removeBg.trim')}</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={trim}
                onChange={e => setTrim(e.target.checked)}
                style={{ accentColor: themeVars?.accent ?? '#3b82f6', width: 14, height: 14 }}
              />
              <span className="text-xs" style={{ color: themeVars?.text ?? '#e5e7eb' }}>{t('removeBg.trimTransparent')}</span>
            </label>
          </div>
        </div>

        {error && <div className="text-xs" style={{ color: '#f87171' }}>{error}</div>}
      </div>
    </ModalShell>
  );
}
