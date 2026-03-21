import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Play, Pause } from 'lucide-react';
import { ThemeVars } from './types';
import ModalShell from './ui/ModalShell';
import { checkerboardStyle, getInputStyle, Spinner } from './ui/modalStyles';
import { getFileName, getPathSeparator } from '../../utils/pathUtils';

// 기본 프리셋
const DEFAULT_PRESETS = [
  { label: '64×64', w: 64, h: 64 },
  { label: '128×128', w: 128, h: 128 },
  { label: '256×256', w: 256, h: 256 },
  { label: '512×512', w: 512, h: 512 },
];

const STORAGE_KEY = 'qf_sheet_presets';

interface CustomPreset {
  label: string;
  w: number;
  h: number;
}

interface SheetPackerModalProps {
  imagePaths: string[];
  defaultName: string;
  currentPath: string;
  onClose: () => void;
  themeVars: ThemeVars | null;
}

export default function SheetPackerModal({
  imagePaths,
  defaultName,
  currentPath,
  onClose,
  themeVars,
}: SheetPackerModalProps) {
  const count = imagePaths.length;

  // 행/열 계산: 기본값은 정사각형에 가깝게
  const defaultCols = Math.ceil(Math.sqrt(count));
  const [cols, setCols] = useState(defaultCols);
  const [rows, setRows] = useState(Math.ceil(count / defaultCols));
  const [cellWidth, setCellWidth] = useState(256);
  const [cellHeight, setCellHeight] = useState(256);

  // 미리보기
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 시퀀스 재생
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(12);
  const [currentFrame, setCurrentFrame] = useState(0);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 커스텀 프리셋
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const allPresets = useMemo(
    () => [...DEFAULT_PRESETS, ...customPresets],
    [customPresets],
  );

  // 디바운스 타이머
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 자연 정렬된 이미지 경로
  const sortedPaths = useMemo(() => {
    return [...imagePaths].sort((a, b) => {
      const nameA = getFileName(a);
      const nameB = getFileName(b);
      return nameA.localeCompare(nameB, undefined, { numeric: true });
    });
  }, [imagePaths]);

  // 열 변경 시 행 자동 계산
  const handleColsChange = useCallback((val: number) => {
    const c = Math.max(1, val);
    setCols(c);
    setRows(Math.ceil(count / c));
  }, [count]);

  // 행 변경 시 열 자동 계산
  const handleRowsChange = useCallback((val: number) => {
    const r = Math.max(1, val);
    setRows(r);
    setCols(Math.ceil(count / r));
  }, [count]);

  // 미리보기 요청
  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const base64 = await invoke<string>('sprite_sheet_preview', {
        images: sortedPaths,
        cellWidth,
        cellHeight,
        cols,
        rows,
      });
      setPreview(base64);
    } catch (e) {
      setError(`미리보기 실패: ${e}`);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [sortedPaths, cellWidth, cellHeight, cols, rows]);

  // 파라미터 변경 시 200ms 디바운스 후 미리보기 갱신
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchPreview();
    }, 200);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [fetchPreview]);

  // 시퀀스 재생
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setCurrentFrame(prev => (prev + 1) % count);
      }, 1000 / fps);
    } else {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, fps, count]);

  // 저장
  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const sep = getPathSeparator(currentPath);
      const output = `${currentPath}${sep}${defaultName}`;
      await invoke<string>('save_sprite_sheet', {
        images: sortedPaths,
        cellWidth,
        cellHeight,
        cols,
        rows,
        output,
      });
      // 저장 성공 알림은 onClose에서 loadDirectory로 처리
      onClose();
    } catch (e) {
      setError(`저장 실패: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  // 커스텀 프리셋 추가
  const handleAddCustomPreset = () => {
    const label = `${cellWidth}×${cellHeight}`;
    // 이미 같은 크기가 있으면 추가하지 않음
    if (allPresets.some(p => p.w === cellWidth && p.h === cellHeight)) return;
    const next = [...customPresets, { label, w: cellWidth, h: cellHeight }];
    setCustomPresets(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  // 공통 스타일
  const inputStyle = getInputStyle(themeVars);

  // 프레임 재생 영역: CSS clip으로 현재 프레임만 표시
  const frameCol = currentFrame % cols;
  const frameRow = Math.floor(currentFrame / cols);

  return (
    <ModalShell
      title={`시트 패킹 — ${defaultName} (${count}장)`}
      maxWidth="52rem"
      saving={saving}
      saveLabel="저장"
      onClose={onClose}
      onSave={handleSave}
      themeVars={themeVars}
    >
      {/* 본문 */}
      <div className="px-4 py-4 flex flex-col gap-4">
        {/* 미리보기 영역 */}
        <div className="flex gap-3">
          {/* 시트 프리뷰 */}
          <div className="flex-1 flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-medium" style={{ color: themeVars?.muted }}>시트 프리뷰</span>
            <div
              className="flex items-center justify-center rounded-md overflow-hidden w-full"
              style={{
                height: 280,
                ...checkerboardStyle,
                border: `1px solid ${themeVars?.border ?? '#334155'}`,
              }}
            >
              {loading && <Spinner themeVars={themeVars} />}
              {!loading && preview && (
                <img
                  src={`data:image/png;base64,${preview}`}
                  alt="시트 프리뷰"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                  }}
                />
              )}
              {!loading && !preview && !error && (
                <span className="text-xs" style={{ color: themeVars?.muted }}>미리보기 없음</span>
              )}
            </div>
          </div>

          {/* 프레임 재생 영역 */}
          <div className="flex flex-col items-center gap-1.5" style={{ width: 200 }}>
            <span className="text-[10px] font-medium" style={{ color: themeVars?.muted }}>
              프레임 {currentFrame + 1}/{count}
            </span>
            <div
              className="flex items-center justify-center rounded-md overflow-hidden w-full"
              style={{
                height: 200,
                ...checkerboardStyle,
                border: `1px solid ${themeVars?.border ?? '#334155'}`,
              }}
            >
              {preview && (() => {
                // 컨테이너(200×200)에 맞게 프레임 스케일 계산
                const containerSize = 200;
                const scale = Math.min(containerSize / cellWidth, containerSize / cellHeight, 1);
                const displayW = cellWidth * scale;
                const displayH = cellHeight * scale;
                return (
                  <div
                    style={{
                      width: displayW,
                      height: displayH,
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <img
                      src={`data:image/png;base64,${preview}`}
                      alt={`프레임 ${currentFrame + 1}`}
                      style={{
                        position: 'absolute',
                        width: cols * cellWidth * scale,
                        height: rows * cellHeight * scale,
                        maxWidth: 'none',
                        left: -(frameCol * cellWidth * scale),
                        top: -(frameRow * cellHeight * scale),
                        imageRendering: 'auto',
                      }}
                    />
                  </div>
                );
              })()}
            </div>
            {/* 재생 컨트롤 */}
            <div className="flex items-center gap-2 w-full">
              <button
                className="p-1.5 rounded-md transition-colors cursor-pointer"
                style={{
                  backgroundColor: isPlaying ? (themeVars?.accent ?? '#3b82f6') : (themeVars?.surface ?? '#111827'),
                  color: isPlaying ? '#fff' : (themeVars?.text ?? '#e5e7eb'),
                  border: `1px solid ${themeVars?.border ?? '#334155'}`,
                }}
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? <Pause size={12} /> : <Play size={12} />}
              </button>
              <label className="text-[10px]" style={{ color: themeVars?.muted }}>FPS</label>
              <input
                type="number"
                value={fps}
                min={1}
                max={60}
                onChange={e => setFps(Math.max(1, Math.min(60, Number(e.target.value))))}
                onKeyDown={e => e.stopPropagation()}
                style={{ ...inputStyle, width: 44 }}
              />
            </div>
          </div>
        </div>

        {/* 컨트롤 영역 */}
        <div className="flex flex-col gap-3">
          {/* 행/열 */}
          <div className="flex items-center gap-3">
            <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 56 }}>
              열 × 행
            </label>
            <input
              type="number"
              value={cols}
              min={1}
              max={count}
              onChange={e => handleColsChange(Number(e.target.value))}
              onKeyDown={e => e.stopPropagation()}
              style={inputStyle}
            />
            <span className="text-xs" style={{ color: themeVars?.muted }}>×</span>
            <input
              type="number"
              value={rows}
              min={1}
              max={count}
              onChange={e => handleRowsChange(Number(e.target.value))}
              onKeyDown={e => e.stopPropagation()}
              style={inputStyle}
            />
            <span className="text-[10px]" style={{ color: themeVars?.muted }}>
              ({cols * rows}칸, {count}장)
            </span>
          </div>

          {/* 셀 크기 + 프리셋 */}
          <div className="flex items-center gap-3">
            <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 56 }}>
              셀 크기
            </label>
            <input
              type="number"
              value={cellWidth}
              min={8}
              max={4096}
              onChange={e => setCellWidth(Math.max(8, Number(e.target.value)))}
              onKeyDown={e => e.stopPropagation()}
              style={inputStyle}
            />
            <span className="text-xs" style={{ color: themeVars?.muted }}>×</span>
            <input
              type="number"
              value={cellHeight}
              min={8}
              max={4096}
              onChange={e => setCellHeight(Math.max(8, Number(e.target.value)))}
              onKeyDown={e => e.stopPropagation()}
              style={inputStyle}
            />
            {/* 프리셋 버튼들 */}
            <div className="flex gap-1 flex-wrap">
              {allPresets.map(p => (
                <button
                  key={p.label}
                  className="px-2 py-1 text-[10px] rounded-md transition-colors cursor-pointer"
                  style={{
                    backgroundColor: cellWidth === p.w && cellHeight === p.h
                      ? (themeVars?.accent ?? '#3b82f6')
                      : (themeVars?.surface ?? '#111827'),
                    color: cellWidth === p.w && cellHeight === p.h ? '#fff' : (themeVars?.text ?? '#e5e7eb'),
                    border: `1px solid ${cellWidth === p.w && cellHeight === p.h ? 'transparent' : (themeVars?.border ?? '#334155')}`,
                  }}
                  onClick={() => { setCellWidth(p.w); setCellHeight(p.h); }}
                >
                  {p.label}
                </button>
              ))}
              <button
                className="px-2 py-1 text-[10px] rounded-md transition-colors cursor-pointer"
                style={{
                  backgroundColor: themeVars?.surface ?? '#111827',
                  color: themeVars?.muted ?? '#94a3b8',
                  border: `1px solid ${themeVars?.border ?? '#334155'}`,
                }}
                onClick={handleAddCustomPreset}
                title="현재 크기를 프리셋으로 저장"
              >
                + 저장
              </button>
            </div>
          </div>

          {/* 출력 크기 정보 */}
          <div className="flex items-center gap-3">
            <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 56 }}>
              출력 크기
            </label>
            <span className="text-xs" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
              {cols * cellWidth} × {rows * cellHeight} px
            </span>
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="text-xs" style={{ color: '#f87171' }}>{error}</div>
        )}
      </div>
    </ModalShell>
  );
}
