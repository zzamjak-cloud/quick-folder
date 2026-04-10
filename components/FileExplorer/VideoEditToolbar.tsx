import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { ThemeVars } from './types';
import { getFileName } from '../../utils/pathUtils';

interface VideoEditToolbarProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  videoPath: string;
  duration: number;
  currentTime: number;
  themeVars: ThemeVars | null;
  onFileChanged?: () => void;
  cropRect?: { x: number; y: number; w: number; h: number } | null;
}

// 외부에서 호출 가능한 메서드
export interface VideoEditToolbarHandle {
  nudgeStart: (delta: number) => void;
  nudgeEnd: (delta: number) => void;
}

// 동영상 처리 진행률 메시지 타입
interface VideoProgress {
  percent: number;
  speed: string;
  fps: number;
}

// 시간 포맷 헬퍼 (mm:ss)
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// 비디오에서 타임라인 썸네일 캡처
async function generateThumbnails(
  video: HTMLVideoElement | null,
  dur: number,
  count: number
): Promise<string[]> {
  if (!video || dur <= 0) return [];
  // 별도 video 요소로 캡처 (원본 재생에 영향 없음)
  const tmpVideo = document.createElement('video');
  tmpVideo.src = video.src;
  tmpVideo.crossOrigin = 'anonymous';
  tmpVideo.muted = true;
  tmpVideo.preload = 'auto';

  await new Promise<void>((resolve) => {
    tmpVideo.onloadeddata = () => resolve();
    tmpVideo.onerror = () => resolve();
    tmpVideo.load();
  });

  const canvas = document.createElement('canvas');
  const thumbW = 80;
  const thumbH = 45;
  canvas.width = thumbW;
  canvas.height = thumbH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const results: string[] = [];
  const interval = dur / count;

  for (let i = 0; i < count; i++) {
    const seekTime = interval * i + interval / 2;
    tmpVideo.currentTime = Math.min(seekTime, dur - 0.1);
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        tmpVideo.removeEventListener('seeked', onSeeked);
        resolve();
      };
      tmpVideo.addEventListener('seeked', onSeeked);
      // 타임아웃: 시크 실패 방지
      setTimeout(resolve, 500);
    });
    try {
      ctx.drawImage(tmpVideo, 0, 0, thumbW, thumbH);
      results.push(canvas.toDataURL('image/jpeg', 0.5));
    } catch {
      results.push('');
    }
  }

  tmpVideo.remove();
  return results;
}

// 시간 문자열 "m:ss" → 초 변환
function parseTimeInput(str: string, max: number): number | null {
  const parts = str.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseFloat(parts[1]);
    if (!isNaN(m) && !isNaN(s)) return Math.max(0, Math.min(m * 60 + s, max));
  }
  const n = parseFloat(str);
  if (!isNaN(n)) return Math.max(0, Math.min(n, max));
  return null;
}

// 1프레임 ≈ 1/30초
const FRAME_STEP = 1 / 30;

// 동영상 편집 툴바: 구간 선택 + 내보내기/삭제/이어붙이기
const VideoEditToolbar = forwardRef<VideoEditToolbarHandle, VideoEditToolbarProps>(function VideoEditToolbar({
  videoRef,
  videoPath,
  duration,
  currentTime,
  themeVars,
  onFileChanged,
  cropRect,
}, ref) {
  const [startPoint, setStartPoint] = useState(0);
  const [endPoint, setEndPoint] = useState(duration || 0);
  const [processing, setProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');

  // 시간 입력 필드 상태
  const [startInput, setStartInput] = useState(formatTime(0));
  const [endInput, setEndInput] = useState(formatTime(duration || 0));

  // 외부에서 호출 가능한 프레임 이동 메서드
  useImperativeHandle(ref, () => ({
    nudgeStart(delta: number) {
      setStartPoint(prev => {
        const next = Math.max(0, Math.min(prev + delta, endPoint - 0.1));
        if (videoRef.current) videoRef.current.currentTime = next;
        setStartInput(formatTime(next));
        return next;
      });
    },
    nudgeEnd(delta: number) {
      setEndPoint(prev => {
        const next = Math.max(startPoint + 0.1, Math.min(prev + delta, duration));
        if (videoRef.current) videoRef.current.currentTime = next;
        setEndInput(formatTime(next));
        return next;
      });
    },
  }), [startPoint, endPoint, duration, videoRef]);

  // 타임라인 썸네일 스트립
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  // duration 변경 시 endPoint 초기화 + 썸네일 생성
  useEffect(() => {
    if (duration > 0) {
      setEndPoint((prev) => (prev === 0 ? duration : prev));
      // 타임라인 썸네일 생성 (최대 20장)
      generateThumbnails(videoRef.current, duration, 20).then(setThumbnails);
    }
  }, [duration, videoRef]);

  // 구간 바 드래그 상태
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'start' | 'end' | null>(null);

  // 구간 바에서 시간 계산
  const calcTimeFromX = useCallback(
    (clientX: number): number => {
      const bar = barRef.current;
      if (!bar || duration <= 0) return 0;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
  );

  // 핸들 마우스다운
  const handleMouseDown = (which: 'start' | 'end') => (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = which;
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const t = calcTimeFromX(e.clientX);
      if (dragging.current === 'start') {
        const clamped = Math.min(t, endPoint - 0.5);
        setStartPoint(clamped);
        setStartInput(formatTime(clamped));
        if (videoRef.current) videoRef.current.currentTime = clamped;
      } else {
        const clamped = Math.max(t, startPoint + 0.5);
        setEndPoint(clamped);
        setEndInput(formatTime(clamped));
        if (videoRef.current) videoRef.current.currentTime = clamped;
      }
    };
    const onMouseUp = () => {
      dragging.current = null;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [calcTimeFromX, startPoint, endPoint]);

  // 시작점/끝점을 현재 재생 위치로 설정
  const setStartToCurrent = () => {
    const t = videoRef.current?.currentTime ?? currentTime;
    const clamped = Math.min(t, endPoint - 0.5);
    setStartPoint(clamped);
    setStartInput(formatTime(clamped));
  };
  const setEndToCurrent = () => {
    const t = videoRef.current?.currentTime ?? currentTime;
    const clamped = Math.max(t, startPoint + 0.5);
    setEndPoint(clamped);
    setEndInput(formatTime(clamped));
  };

  // 처음으로 / 끝으로 이동
  const goToStart = () => {
    const video = videoRef.current;
    if (video) video.currentTime = startPoint;
  };
  const goToEnd = () => {
    const video = videoRef.current;
    if (video) video.currentTime = endPoint;
  };

  // 선택 구간 내보내기 (trim)
  const handleTrim = async () => {
    if (processing) return;
    setProcessing(true);
    setStatusText('내보내기 중...');
    try {
      const progress = new Channel<VideoProgress>();
      progress.onmessage = (msg) => {
        setStatusText(`처리 중... ${msg.percent.toFixed(0)}%`);
      };
      const output = await invoke<string>('trim_video', {
        input: videoPath,
        startSec: startPoint,
        endSec: endPoint,
        cropX: cropRect?.x ?? null,
        cropY: cropRect?.y ?? null,
        cropW: cropRect?.w ?? null,
        cropH: cropRect?.h ?? null,
        onProgress: progress,
      });
      setStatusText(`내보내기 완료: ${getFileName(output)}`);
      onFileChanged?.();
    } catch (e) {
      setStatusText(`내보내기 실패: ${e}`);
    } finally {
      setProcessing(false);
    }
  };

  // 선택 구간 삭제 (구간 제거 후 앞뒤를 이어붙임)
  const handleDeleteSegment = async () => {
    if (processing) return;
    setProcessing(true);
    setStatusText('구간 삭제 중...');
    try {
      const progress = new Channel<VideoProgress>();
      progress.onmessage = (msg) => {
        setStatusText(`처리 중... ${msg.percent.toFixed(0)}%`);
      };
      const output = await invoke<string>('cut_video', {
        input: videoPath,
        startSec: startPoint,
        endSec: endPoint,
        onProgress: progress,
      });
      setStatusText(`구간 삭제 완료: ${getFileName(output)}`);
      onFileChanged?.();
    } catch (e) {
      setStatusText(`구간 삭제 실패: ${e}`);
    } finally {
      setProcessing(false);
    }
  };

  // GIF 내보내기
  const handleExportGif = async () => {
    if (processing) return;
    setProcessing(true);
    setStatusText('GIF 변환 중...');
    try {
      const progress = new Channel<VideoProgress>();
      progress.onmessage = (msg) => {
        setStatusText(`GIF 변환 중... ${msg.percent.toFixed(0)}%`);
      };
      const output = await invoke<string>('video_to_gif', {
        input: videoPath,
        startSec: startPoint,
        endSec: endPoint,
        cropX: cropRect?.x ?? null,
        cropY: cropRect?.y ?? null,
        cropW: cropRect?.w ?? null,
        cropH: cropRect?.h ?? null,
        onProgress: progress,
      });
      setStatusText(`GIF 생성 완료: ${getFileName(output)}`);
      onFileChanged?.();
    } catch (e) {
      setStatusText(`GIF 변환 실패: ${e}`);
    } finally {
      setProcessing(false);
    }
  };



  // 구간 바 퍼센트 계산
  const startPct = duration > 0 ? (startPoint / duration) * 100 : 0;
  const endPct = duration > 0 ? (endPoint / duration) * 100 : 100;

  // 선택 구간 길이 텍스트
  const segLen = endPoint - startPoint;
  const segMin = Math.floor(segLen / 60);
  const segSec = Math.floor(segLen % 60);
  const segLabel =
    segMin > 0
      ? `${segMin}분 ${segSec}초`
      : `${segSec}초`;

  // 버튼 공통 스타일
  const btnBase: React.CSSProperties = {
    fontSize: '0.75rem',
    padding: '0.375rem 0.75rem',
    borderRadius: '0.375rem',
    cursor: processing ? 'not-allowed' : 'pointer',
    opacity: processing ? 0.5 : 1,
    border: `1px solid ${themeVars?.border ?? '#444'}`,
    background: themeVars?.surface ?? '#2a2a2a',
    color: themeVars?.text ?? '#e5e7eb',
    transition: 'opacity 0.15s',
    fontWeight: 500,
  };

  const accentBtnStyle: React.CSSProperties = {
    ...btnBase,
    background: themeVars?.accent ?? '#4ade80',
    color: '#000',
    border: 'none',
    fontWeight: 600,
  };

  return (
    <div
      className="flex flex-col gap-3 w-full rounded-lg p-3"
      style={{
        maxWidth: '830px',
        background: themeVars?.surface ? `${themeVars.surface}cc` : 'rgba(30,30,30,0.85)',
        border: `1px solid ${themeVars?.border ?? '#333'}`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1단: 구간 선택 버튼 + 시간 입력 필드 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button style={btnBase} onClick={goToStart} title="시작점으로 이동">|◄</button>
        <button style={btnBase} onClick={() => { setStartPoint(prev => { const n = Math.max(0, prev - FRAME_STEP); setStartInput(formatTime(n)); if (videoRef.current) videoRef.current.currentTime = n; return n; }); }} title="시작점 1프레임 뒤로">◄◄</button>
        <button style={btnBase} onClick={setStartToCurrent} title="현재 위치를 시작점으로">◄ 시작점</button>
        {/* 시작점 시간 입력 */}
        <input
          value={startInput}
          onChange={e => setStartInput(e.target.value)}
          onBlur={() => {
            const t = parseTimeInput(startInput, duration);
            if (t !== null && t < endPoint) { setStartPoint(t); setStartInput(formatTime(t)); if (videoRef.current) videoRef.current.currentTime = t; }
            else setStartInput(formatTime(startPoint));
          }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); e.stopPropagation(); }}
          className="text-xs font-mono text-center rounded"
          style={{ width: 56, padding: '3px 4px', background: themeVars?.bg ?? '#111', color: themeVars?.text ?? '#e5e7eb', border: `1px solid ${themeVars?.border ?? '#444'}` }}
          title="시작점 시간 (mm:ss)"
        />
        <span className="text-xs" style={{ color: themeVars?.muted ?? '#666' }}>~</span>
        {/* 끝점 시간 입력 */}
        <input
          value={endInput}
          onChange={e => setEndInput(e.target.value)}
          onBlur={() => {
            const t = parseTimeInput(endInput, duration);
            if (t !== null && t > startPoint) { setEndPoint(t); setEndInput(formatTime(t)); if (videoRef.current) videoRef.current.currentTime = t; }
            else setEndInput(formatTime(endPoint));
          }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); e.stopPropagation(); }}
          className="text-xs font-mono text-center rounded"
          style={{ width: 56, padding: '3px 4px', background: themeVars?.bg ?? '#111', color: themeVars?.text ?? '#e5e7eb', border: `1px solid ${themeVars?.border ?? '#444'}` }}
          title="끝점 시간 (mm:ss)"
        />
        <button style={btnBase} onClick={setEndToCurrent} title="현재 위치를 끝점으로">끝점 ►</button>
        <button style={btnBase} onClick={() => { setEndPoint(prev => { const n = Math.min(duration, prev + FRAME_STEP); setEndInput(formatTime(n)); if (videoRef.current) videoRef.current.currentTime = n; return n; }); }} title="끝점 1프레임 앞으로">►►</button>
        <button style={btnBase} onClick={goToEnd} title="끝점으로 이동">►|</button>
      </div>

      {/* 2단: 구간 시각화 바 */}
      <div className="flex flex-col gap-1">
        {/* 시간 라벨 */}
        <div className="flex justify-between text-xs font-mono" style={{ color: themeVars?.text ?? '#9ca3af', opacity: 0.7 }}>
          <span>{formatTime(startPoint)}</span>
          <span>{formatTime(endPoint)}</span>
        </div>

        {/* 시각화 바 + 핸들 (썸네일 배경) */}
        <div
          ref={barRef}
          className="relative h-16 rounded select-none overflow-hidden"
          style={{ background: themeVars?.bg ?? '#1e293b' }}
        >
          {/* 타임라인 썸네일 스트립 */}
          {thumbnails.length > 0 && (
            <div className="absolute inset-0 flex">
              {thumbnails.map((src, i) => (
                <div
                  key={i}
                  className="flex-1 h-full bg-cover bg-center"
                  style={{
                    backgroundImage: src ? `url(${src})` : undefined,
                    opacity: 0.6,
                  }}
                />
              ))}
            </div>
          )}
          {/* 선택 구간 하이라이트 */}
          <div
            className="absolute top-0 bottom-0 rounded"
            style={{
              left: `${startPct}%`,
              width: `${endPct - startPct}%`,
              background: `${themeVars?.accent ?? '#4ade80'}55`,
              borderLeft: `2px solid ${themeVars?.accent ?? '#4ade80'}`,
              borderRight: `2px solid ${themeVars?.accent ?? '#4ade80'}`,
            }}
          />

          {/* 현재 재생 위치 표시 */}
          {duration > 0 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 pointer-events-none"
              style={{
                left: `${(currentTime / duration) * 100}%`,
                background: 'rgba(255,255,255,0.5)',
              }}
            />
          )}

          {/* 시작 핸들 */}
          <div
            className="absolute top-0 bottom-0 flex items-center justify-center"
            style={{
              left: `${startPct}%`,
              transform: 'translateX(-50%)',
              width: '12px',
              cursor: 'ew-resize',
            }}
            onMouseDown={handleMouseDown('start')}
          >
            <div
              className="w-3 h-12 rounded-sm"
              style={{ background: themeVars?.accent ?? '#4ade80' }}
            />
          </div>

          {/* 끝 핸들 */}
          <div
            className="absolute top-0 bottom-0 flex items-center justify-center"
            style={{
              left: `${endPct}%`,
              transform: 'translateX(-50%)',
              width: '12px',
              cursor: 'ew-resize',
            }}
            onMouseDown={handleMouseDown('end')}
          >
            <div
              className="w-3 h-12 rounded-sm"
              style={{ background: themeVars?.accent ?? '#4ade80' }}
            />
          </div>
        </div>
      </div>

      {/* 3단: 액션 버튼 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          style={accentBtnStyle}
          onClick={handleTrim}
          disabled={processing}
          title="선택한 구간만 새 파일로 내보내기"
        >
          선택 구간 내보내기
        </button>
        <button
          style={accentBtnStyle}
          onClick={handleExportGif}
          disabled={processing}
          title="선택한 구간을 GIF로 변환 (FPS 15, 폭 480px)"
        >
          GIF 내보내기
        </button>
        <button
          style={btnBase}
          onClick={handleDeleteSegment}
          disabled={processing}
          title="선택한 구간을 삭제하고 앞뒤를 이어붙이기"
        >
          선택 구간 삭제
        </button>
      </div>

      {/* 4단: 상태 텍스트 + 처리 중 표시 */}
      <div className="flex items-center gap-2 text-xs" style={{ color: themeVars?.text ?? '#9ca3af', minHeight: '1.5rem' }}>
        {processing && (
          <div
            className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0"
            style={{ borderColor: `${themeVars?.accent ?? '#4ade80'} transparent ${themeVars?.accent ?? '#4ade80'} ${themeVars?.accent ?? '#4ade80'}` }}
          />
        )}
        <span style={{ opacity: processing ? 1 : 0.7 }}>
          {statusText
            ? statusText
            : `구간 선택: ${formatTime(startPoint)} ~ ${formatTime(endPoint)} (${segLabel})`}
        </span>
      </div>
    </div>
  );
});

export default VideoEditToolbar;
