import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { ThemeVars } from './types';

const COLOR_OPTIONS = [4, 8, 16, 32, 64, 128, 256] as const;
const SCALE_OPTIONS = [16, 32, 48, 64, 128, 256] as const;

interface PixelateModalProps {
  path: string;
  onClose: () => void;
  onApply: (path: string, pixelSize: number, scale: number, maxColors: number) => Promise<void>;
  themeVars: ThemeVars | null;
}

export default function PixelateModal({ path, onClose, onApply, themeVars }: PixelateModalProps) {
  // 실제 적용 값
  const [pixelSize, setPixelSize] = useState(4);
  const [scale, setScale] = useState(32);
  const [maxColors, setMaxColors] = useState(16);

  // 미리보기 상태
  const [preview, setPreview] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<{ w: number; h: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 디바운스 타이머 ref
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 미리보기 이미지 ref (자연 크기 감지용)
  const imgRef = useRef<HTMLImageElement | null>(null);

  // 파일명 추출 (헤더 표시용)
  const fileName = useMemo(() => {
    const sep = path.includes('/') ? '/' : '\\';
    return path.split(sep).pop() ?? path;
  }, [path]);

  // 픽셀 크기 범위: 출력 크기에 비례 (최소 1, 최대 scale/2)
  const pixelSizeMax = useMemo(() => Math.max(2, Math.floor(scale / 2)), [scale]);

  // 출력 크기 변경 시 픽셀 크기가 범위를 벗어나면 클램핑
  useEffect(() => {
    if (pixelSize > pixelSizeMax) {
      setPixelSize(pixelSizeMax);
    }
  }, [pixelSizeMax, pixelSize]);

  // 미리보기 요청 함수
  const fetchPreview = useCallback(async (ps: number, sc: number, mc: number) => {
    setLoading(true);
    setError('');
    try {
      const base64 = await invoke<string>('pixelate_preview', {
        input: path,
        pixelSize: ps,
        scale: sc,
        maxColors: mc,
      });
      setPreview(base64);
    } catch (e) {
      setError(`미리보기 실패: ${e}`);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [path]);

  // 파라미터 변경 시 200ms 디바운스 후 미리보기 갱신
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchPreview(pixelSize, scale, maxColors);
    }, 200);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [pixelSize, scale, maxColors, fetchPreview]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saving, onClose]);

  // 미리보기 이미지 로드 후 자연 크기 저장
  const handleImgLoad = () => {
    if (imgRef.current) {
      setPreviewSize({
        w: imgRef.current.naturalWidth,
        h: imgRef.current.naturalHeight,
      });
    }
  };

  // 저장 버튼 클릭
  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await onApply(path, pixelSize, scale, maxColors);
      onClose();
    } catch (e) {
      setError(`저장 실패: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  // 공통 스타일
  const btnBase: React.CSSProperties = {
    padding: '5px 14px',
    fontSize: 12,
    borderRadius: 6,
    border: `1px solid ${themeVars?.border ?? '#334155'}`,
    backgroundColor: themeVars?.surface ?? '#111827',
    color: themeVars?.text ?? '#e5e7eb',
    cursor: 'pointer',
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: themeVars?.surface ?? '#111827',
    color: themeVars?.text ?? '#e5e7eb',
    border: `1px solid ${themeVars?.border ?? '#334155'}`,
  };

  const checkerboardStyle: React.CSSProperties = {
    backgroundImage:
      'linear-gradient(45deg, #808080 25%, transparent 25%), ' +
      'linear-gradient(-45deg, #808080 25%, transparent 25%), ' +
      'linear-gradient(45deg, transparent 75%, #808080 75%), ' +
      'linear-gradient(-45deg, transparent 75%, #808080 75%)',
    backgroundSize: '16px 16px',
    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
  };

  const spinner = (
    <div className="flex items-center justify-center">
      <div
        className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: `${themeVars?.accent ?? '#3b82f6'} transparent transparent transparent` }}
      />
    </div>
  );

  // 선택 버튼 그룹 렌더러
  const optionButton = (value: number, selected: boolean, onClick: () => void, label?: string) => (
    <button
      key={value}
      className="px-2 py-1 text-[11px] rounded-md transition-colors cursor-pointer"
      style={{
        backgroundColor: selected ? (themeVars?.accent ?? '#3b82f6') : (themeVars?.surface ?? '#111827'),
        color: selected ? '#fff' : (themeVars?.text ?? '#e5e7eb'),
        border: `1px solid ${selected ? 'transparent' : (themeVars?.border ?? '#334155')}`,
      }}
      onClick={onClick}
    >
      {label ?? value}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
    >
      <div
        className="rounded-lg shadow-2xl flex flex-col"
        style={{
          backgroundColor: themeVars?.surface2 ?? '#1e293b',
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
          width: '100%',
          maxWidth: '40rem',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}
        >
          <span className="text-sm font-medium truncate flex-1 mr-2" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
            픽셀화 — {fileName}
          </span>
          <button
            className="p-1 hover:opacity-70 flex-shrink-0"
            style={{ color: themeVars?.muted }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* 본문 */}
        <div className="px-4 py-4 flex flex-col gap-4">
          {/* 미리보기 영역 — 좌: 확대(꽉 채움), 우: 실제 크기 */}
          <div className="flex gap-3">
            {/* 확대 미리보기 */}
            <div className="flex-1 flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-medium" style={{ color: themeVars?.muted }}>확대 미리보기</span>
              <div
                className="flex items-center justify-center rounded-md overflow-hidden w-full"
                style={{
                  height: 240,
                  ...checkerboardStyle,
                  border: `1px solid ${themeVars?.border ?? '#334155'}`,
                }}
              >
                {loading && spinner}
                {!loading && preview && (
                  <img
                    src={`data:image/png;base64,${preview}`}
                    alt="확대 미리보기"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      imageRendering: 'pixelated',
                    }}
                  />
                )}
                {!loading && !preview && !error && (
                  <span className="text-xs" style={{ color: themeVars?.muted }}>미리보기 없음</span>
                )}
              </div>
            </div>

            {/* 실제 크기 미리보기 */}
            <div className="flex-1 flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-medium" style={{ color: themeVars?.muted }}>
                실제 크기{previewSize ? ` (${previewSize.w}×${previewSize.h})` : ''}
              </span>
              <div
                className="flex items-center justify-center rounded-md overflow-auto w-full"
                style={{
                  height: 240,
                  ...checkerboardStyle,
                  border: `1px solid ${themeVars?.border ?? '#334155'}`,
                }}
              >
                {loading && spinner}
                {!loading && preview && (
                  <img
                    ref={imgRef}
                    src={`data:image/png;base64,${preview}`}
                    alt="실제 크기 미리보기"
                    onLoad={handleImgLoad}
                    style={{ imageRendering: 'pixelated' }}
                  />
                )}
                {!loading && !preview && !error && (
                  <span className="text-xs" style={{ color: themeVars?.muted }}>미리보기 없음</span>
                )}
              </div>
            </div>
          </div>

          {/* 컨트롤 영역 */}
          <div className="flex flex-col gap-3">
            {/* 출력 크기 버튼 그룹 */}
            <div className="flex items-center gap-3">
              <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 56 }}>
                출력 크기
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {SCALE_OPTIONS.map(s =>
                  optionButton(s, scale === s, () => setScale(s), `${s}px`)
                )}
              </div>
            </div>

            {/* 픽셀 크기 슬라이더 (범위가 출력 크기에 비례) */}
            <div className="flex items-center gap-3">
              <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 56 }}>
                픽셀 크기
              </label>
              <input
                type="range"
                min={1}
                max={pixelSizeMax}
                value={pixelSize}
                onChange={e => setPixelSize(Number(e.target.value))}
                onKeyDown={e => e.stopPropagation()}
                className="flex-1"
                style={{ accentColor: themeVars?.accent ?? '#3b82f6' }}
              />
              <span
                className="w-10 text-center text-xs"
                style={{ color: themeVars?.text ?? '#e5e7eb' }}
              >
                {pixelSize}
              </span>
            </div>

            {/* 컬러 수 드롭다운 */}
            <div className="flex items-center gap-3">
              <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 56 }}>
                컬러 수
              </label>
              <select
                value={maxColors}
                onChange={e => setMaxColors(Number(e.target.value))}
                className="flex-1 px-2 py-1 text-xs rounded-md outline-none cursor-pointer"
                style={inputStyle}
              >
                {COLOR_OPTIONS.map(n => (
                  <option key={n} value={n}>{n} 컬러</option>
                ))}
              </select>
            </div>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="text-xs" style={{ color: '#f87171' }}>{error}</div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div
          className="flex justify-end gap-2 px-4 py-3"
          style={{ borderTop: `1px solid ${themeVars?.border ?? '#334155'}` }}
        >
          <button style={btnBase} onClick={onClose} disabled={saving}>
            취소
          </button>
          <button
            style={{
              ...btnBase,
              backgroundColor: themeVars?.accent ?? '#3b82f6',
              color: '#fff',
              border: 'none',
              opacity: saving ? 0.5 : 1,
            }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
