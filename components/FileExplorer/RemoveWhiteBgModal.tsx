import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ThemeVars } from './types';
import ModalShell from './ui/ModalShell';
import { Spinner } from './ui/modalStyles';
import { getFileName } from '../../utils/pathUtils';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, Wand2 } from 'lucide-react';

// localStorage 키
const LS_KEY = 'qf_remove_bg_settings';

interface SavedSettings {
  threshold: number;
  feather: number;
  previewBg: string; // 'checker' 또는 hex 색상
  trim: boolean;
}

function loadSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* 무시 */ }
  return { threshold: 60, feather: 30, previewBg: 'checker', trim: true };
}

function saveSettings(s: SavedSettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
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
  { label: '체커', value: 'checker' },
  { label: '검정', value: '#000000' },
  { label: '흰색', value: '#ffffff' },
  { label: '회색', value: '#808080' },
  { label: '빨강', value: '#cc3333' },
  { label: '초록', value: '#33cc33' },
  { label: '파랑', value: '#3333cc' },
];

interface RemoveWhiteBgModalProps {
  paths: string[];
  onClose: () => void;
  onApply: (paths: string[], threshold: number, feather: number, seeds: [number, number][], trim: boolean) => Promise<void>;
  themeVars: ThemeVars | null;
}

export default function RemoveWhiteBgModal({ paths, onClose, onApply, themeVars }: RemoveWhiteBgModalProps) {
  const saved = useMemo(loadSettings, []);

  // 파라미터
  const [threshold, setThreshold] = useState(saved.threshold);
  const [feather, setFeather] = useState(saved.feather);

  // 미리보기 배경 (체커 또는 단색)
  const [previewBg, setPreviewBg] = useState(saved.previewBg);

  // 투명 여백 트림 여부
  const [trim, setTrim] = useState(saved.trim);

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
    ? `배경 제거 — ${paths.length}개 이미지 (${previewIndex + 1}/${paths.length})`
    : `배경 제거 — ${fileName}`;

  // 미리보기 배경 스타일
  const previewBgStyle: React.CSSProperties = previewBg === 'checker'
    ? darkCheckerboardStyle
    : { backgroundColor: previewBg };

  // 설정 변경 시 localStorage 저장
  useEffect(() => {
    saveSettings({ threshold, feather, previewBg, trim });
  }, [threshold, feather, previewBg, trim]);

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
  const fetchPreview = useCallback(async (path: string, t: number, f: number, s: [number, number][]) => {
    setLoading(true);
    setError('');
    try {
      const base64 = await invoke<string>('remove_white_bg_preview', {
        input: path, threshold: t, feather: f, seeds: s,
      });
      setPreview(base64);
    } catch (e) {
      setError(`미리보기 실패: ${e}`);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOriginal(currentPath);
  }, [currentPath, fetchOriginal]);

  // 파라미터/시드 변경 시 200ms 디바운스 후 미리보기 갱신
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchPreview(currentPath, threshold, feather, seedPoints);
    }, 200);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [currentPath, threshold, feather, seedPoints, fetchPreview]);

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
      await onApply(paths, threshold, feather, seedPoints, trim);
      onClose();
    } catch (e) {
      setError(`저장 실패: ${e}`);
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
      saveLabel={saving && saveProgress ? `저장 중 (${saveProgress})` : '저장'}
      onClose={onClose}
      onSave={handleSave}
      themeVars={themeVars}
    >
      <div className="px-4 py-3 flex flex-col gap-3">
        {/* 툴바 */}
        <div className="flex items-center justify-between flex-wrap gap-1">
          <div className="flex items-center gap-1.5">
            <button
              style={wandActive ? activeBtnStyle : smallBtnStyle}
              onClick={() => setWandActive(v => !v)}
              title="마술봉: 클릭한 영역을 배경으로 지정"
            >
              <Wand2 size={13} />
              <span>마술봉</span>
            </button>
            {seedPoints.length > 0 && (
              <button style={smallBtnStyle} onClick={resetSeeds} title="선택 초기화">
                <RotateCcw size={13} />
                <span>초기화 ({seedPoints.length})</span>
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
            <button style={smallBtnStyle} onClick={zoomOut} title="축소"><ZoomOut size={13} /></button>
            <span className="text-[10px] w-10 text-center" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button style={smallBtnStyle} onClick={zoomIn} title="확대"><ZoomIn size={13} /></button>
            <button style={smallBtnStyle} onClick={resetZoom} title="줌 초기화" className="text-[10px]">1:1</button>
          </div>
        </div>

        {/* 미리보기 영역 */}
        <div className="flex gap-3">
          {/* 원본 */}
          <div className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] font-medium" style={{ color: themeVars?.muted }}>
              원본 {wandActive && '(클릭으로 배경 선택)'}
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
                    alt="원본"
                    onLoad={triggerMarkerUpdate}
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
            <span className="text-[10px] font-medium" style={{ color: themeVars?.muted }}>결과</span>
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
                    alt="결과"
                    draggable={false}
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', display: 'block' }}
                  />
                )}
                {!loading && !preview && !error && (
                  <span className="text-xs" style={{ color: themeVars?.muted }}>미리보기 없음</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 컨트롤 영역 */}
        <div className="flex flex-col gap-2.5">
          {/* 미리보기 배경색 */}
          <div className="flex items-center gap-3">
            <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 72 }}>미리보기 배경</label>
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
                  {p.label}
                </button>
              ))}
              <input
                type="color"
                value={previewBg === 'checker' ? '#2a2a2a' : previewBg}
                onChange={e => setPreviewBg(e.target.value)}
                className="w-5 h-5 rounded cursor-pointer"
                style={{ border: `1px solid ${themeVars?.border ?? '#334155'}`, padding: 0, background: 'none' }}
                title="직접 선택"
              />
            </div>
          </div>

          {/* Threshold 슬라이더 */}
          <div className="flex items-center gap-3">
            <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 72 }}>제거 범위</label>
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
            <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 72 }}>경계 부드러움</label>
            <input
              type="range" min={0} max={50} value={feather}
              onChange={e => setFeather(Number(e.target.value))}
              onKeyDown={e => e.stopPropagation()}
              className="flex-1"
              style={{ accentColor: themeVars?.accent ?? '#3b82f6' }}
            />
            <span className="w-10 text-center text-xs" style={{ color: themeVars?.text ?? '#e5e7eb' }}>{feather}</span>
          </div>

          {/* Trim 체크박스 */}
          <div className="flex items-center gap-3">
            <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 72 }}>여백 제거</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={trim}
                onChange={e => setTrim(e.target.checked)}
                style={{ accentColor: themeVars?.accent ?? '#3b82f6', width: 14, height: 14 }}
              />
              <span className="text-xs" style={{ color: themeVars?.text ?? '#e5e7eb' }}>투명 영역 Trim</span>
            </label>
          </div>
        </div>

        {error && <div className="text-xs" style={{ color: '#f87171' }}>{error}</div>}
      </div>
    </ModalShell>
  );
}
