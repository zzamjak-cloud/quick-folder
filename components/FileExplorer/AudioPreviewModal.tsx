import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ThemeVars } from './types';
import { FileEntry } from '../../types';
import { getFileName } from '../../utils/pathUtils';

/** 오디오 확장자 판정 (대소문자 무시) */
export const AUDIO_EXT_RE = /\.(mp3|wav|aac|flac|ogg|m4a|opus|wma|aiff?|alac|mid|midi)$/i;

interface AudioPreviewModalProps {
  path: string;
  entries: FileEntry[];
  themeVars: ThemeVars | null;
  onClose: () => void;
}

/** 초 단위를 mm:ss 로 포맷 */
function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * ArrayBuffer를 AudioContext로 디코드 후 채널 평균 절대값 피크 배열 반환.
 * 다운샘플링 횟수 = width 픽셀 수. 실패 시 null.
 */
async function computePeaks(buffer: ArrayBuffer, buckets: number): Promise<Float32Array | null> {
  try {
    // Safari 호환 윈도우 AudioContext
    const AC: typeof AudioContext = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new AC();
    try {
      // decodeAudioData 는 일부 구현에서 ArrayBuffer를 in-place로 사용하여 중복 호출 시 실패 가능 → 복사본 전달
      const copy = buffer.slice(0);
      const audioBuf = await ctx.decodeAudioData(copy);
      const chCount = audioBuf.numberOfChannels;
      const len = audioBuf.length;
      const samplesPerBucket = Math.max(1, Math.floor(len / buckets));
      const peaks = new Float32Array(buckets);
      for (let ch = 0; ch < chCount; ch++) {
        const data = audioBuf.getChannelData(ch);
        for (let b = 0; b < buckets; b++) {
          const start = b * samplesPerBucket;
          const end = Math.min(len, start + samplesPerBucket);
          let max = 0;
          for (let i = start; i < end; i++) {
            const v = Math.abs(data[i]);
            if (v > max) max = v;
          }
          // 여러 채널 평균
          peaks[b] = (peaks[b] * ch + max) / (ch + 1);
        }
      }
      return peaks;
    } finally {
      try { await ctx.close(); } catch { /* noop */ }
    }
  } catch {
    return null;
  }
}

export default function AudioPreviewModal({ path, entries, themeVars, onClose }: AudioPreviewModalProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [peakLoading, setPeakLoading] = useState(false);

  // 현재 폴더의 오디오 형제(디렉토리 제외) 목록 — 화살표 내비게이션용
  const audioSiblings = useMemo(() => entries.filter(e => !e.is_dir && AUDIO_EXT_RE.test(e.name)), [entries]);
  const currentIdx = useMemo(() => audioSiblings.findIndex(e => e.path === path), [audioSiblings, path]);

  // 테마 변수
  const bg = themeVars?.bg ?? '#0f172a';
  const surface = themeVars?.surface ?? '#111827';
  const surface2 = themeVars?.surface2 ?? '#1f2937';
  const text = themeVars?.text ?? '#e5e7eb';
  const muted = themeVars?.muted ?? '#94a3b8';
  const border = themeVars?.border ?? '#334155';
  const accent = themeVars?.accent ?? '#3b82f6';

  // 파장 피크 계산 — 경로 변경 시 재계산
  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    setPeakLoading(true);
    (async () => {
      try {
        const res = await fetch(convertFileSrc(path));
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const width = canvasRef.current?.clientWidth ?? 520;
        const dpr = window.devicePixelRatio || 1;
        const buckets = Math.max(64, Math.floor(width * dpr / 3)); // 3px 간격 기준
        const p = await computePeaks(buf, buckets);
        if (!cancelled) setPeaks(p);
      } catch {
        if (!cancelled) setPeaks(null);
      } finally {
        if (!cancelled) setPeakLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [path]);

  // 파장 그리기 — 피크, 진행률, 테마 변경 시 재렌더
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    if (!peaks || peaks.length === 0) {
      // 피크 없을 때는 얇은 기준선
      ctx.fillStyle = border;
      ctx.fillRect(0, cssH / 2 - 0.5, cssW, 1);
      return;
    }

    const progress = duration > 0 ? currentTime / duration : 0;
    const barGap = 1;
    const barWidth = Math.max(1, Math.floor((cssW - barGap * (peaks.length - 1)) / peaks.length));
    const totalWidth = peaks.length * barWidth + (peaks.length - 1) * barGap;
    const playedX = totalWidth * progress;
    for (let i = 0; i < peaks.length; i++) {
      const x = i * (barWidth + barGap);
      const h = Math.max(1, peaks[i] * (cssH * 0.9));
      const y = (cssH - h) / 2;
      ctx.fillStyle = x + barWidth <= playedX ? accent : muted;
      ctx.fillRect(x, y, barWidth, h);
    }
  }, [peaks, duration, currentTime, accent, border, muted]);

  // 오디오 메타 로드 + 자동 재생
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(0);
    setCurrentTime(0);
    audio.src = convertFileSrc(path);
    audio.load();
    // 자동 재생 (Tauri 환경: 사용자 상호작용 후이므로 허용)
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [path]);

  // 오디오 이벤트 바인딩
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onDur = () => setDuration(audio.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => setPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onDur);
    audio.addEventListener('durationchange', onDur);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onDur);
      audio.removeEventListener('durationchange', onDur);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  // 재생/리플레이 처리
  const handlePlayToggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.ended || audio.currentTime >= (audio.duration - 0.05)) {
      audio.currentTime = 0;
      audio.play().catch(() => { /* noop */ });
    } else if (audio.paused) {
      audio.play().catch(() => { /* noop */ });
    } else {
      audio.pause();
    }
  };

  const handleReplay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => { /* noop */ });
  };

  // 전역 키보드: Space = 리플레이, ESC = 닫기
  // 화살표 이동은 모두 그리드 전역 핸들러에 위임(focusedIndex/선택 싱크 유지) → 선택 변경을 감지해 모달이 새 오디오로 전환
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === ' ') {
        e.preventDefault(); e.stopPropagation();
        handleReplay();
        return;
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose]);

  // 파장 클릭/드래그로 탐색
  const seekAt = (clientX: number) => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  };

  const fileName = getFileName(path);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      data-audio-preview="true"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="relative rounded-lg overflow-hidden shadow-2xl"
        style={{
          backgroundColor: surface2,
          border: `1px solid ${border}`,
          width: 'min(560px, 90vw)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더: 파일명 + 닫기 */}
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ borderBottom: `1px solid ${border}` }}
        >
          <span className="text-sm font-medium truncate pr-2" style={{ color: text }}>
            🔊 {fileName}
          </span>
          <button
            onClick={onClose}
            className="text-lg px-2 hover:opacity-70"
            style={{ color: muted, background: 'none', border: 'none', cursor: 'pointer' }}
            title="닫기 (ESC)"
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="px-4 py-3" style={{ backgroundColor: bg }}>
          {/* 시간 + 내비게이션 */}
          <div className="flex items-center justify-between mb-2 text-xs" style={{ color: muted }}>
            <span style={{ color: text, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {fmtTime(currentTime)} / {fmtTime(duration)}
            </span>
            {audioSiblings.length > 1 && (
              <span>{currentIdx + 1} / {audioSiblings.length}  <span style={{ opacity: 0.6 }}>←/→ 이동</span></span>
            )}
          </div>

          {/* 파장 타임라인 */}
          <div
            className="relative"
            style={{
              width: '100%',
              height: 80,
              backgroundColor: surface,
              border: `1px solid ${border}`,
              borderRadius: 6,
              cursor: 'pointer',
              overflow: 'hidden',
            }}
            onClick={(e) => seekAt(e.clientX)}
          >
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
            {peakLoading && (
              <div
                className="absolute inset-0 flex items-center justify-center text-xs"
                style={{ color: muted, pointerEvents: 'none' }}
              >
                파장 분석 중...
              </div>
            )}
          </div>

          {/* 플레이/리플레이 컨트롤 */}
          <div className="flex items-center justify-center gap-2 mt-3">
            <button
              onClick={handlePlayToggle}
              className="px-3 py-1.5 rounded-md flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
              style={{
                backgroundColor: accent,
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              title={playing ? '일시정지' : '재생'}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? '일시정지' : '재생'}
            </button>
            <button
              onClick={handleReplay}
              className="px-3 py-1.5 rounded-md flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
              style={{
                backgroundColor: surface,
                color: text,
                border: `1px solid ${border}`,
                cursor: 'pointer',
              }}
              title="처음부터 다시 재생 (Space)"
            >
              <RotateCcw size={14} />
              리플레이
            </button>
          </div>
        </div>

        <audio ref={audioRef} preload="auto" />
      </div>
    </div>
  );
}
