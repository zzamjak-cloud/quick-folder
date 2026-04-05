import React, { useEffect, useRef, useState, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { X, Play, Pause } from 'lucide-react';
import { ThemeVars } from './types';
import { getFileName } from '../../utils/pathUtils';
import VideoEditToolbar, { VideoEditToolbarHandle } from './VideoEditToolbar';

interface VideoPlayerProps {
  path: string;
  onClose: () => void;
  onFileChanged?: () => void; // 편집 후 파일 목록 갱신용
  themeVars: ThemeVars | null;
}

// 동영상 미리보기 모달 (HTML5 video + Tauri asset protocol)
export default function VideoPlayer({ path, onClose, onFileChanged, themeVars }: VideoPlayerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const editToolbarRef = useRef<VideoEditToolbarHandle>(null);
  const [editMode, setEditMode] = useState(false);
  // 재생 상태
  const [isPlaying, setIsPlaying] = useState(false);
  // 현재 재생 시간 (초)
  const [currentTime, setCurrentTime] = useState(0);
  // 전체 길이 (초)
  const [duration, setDuration] = useState(0);

  const videoSrc = convertFileSrc(path);
  const fileName = getFileName(path);

  // 시크바 조작
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Number(e.target.value);
  }, []);

  // 재생/일시정지 토글
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.paused ? video.play() : video.pause();
  }, []);

  // 시간 포맷 (mm:ss)
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // 키보드 단축키 (캡처 단계: 다른 핸들러보다 먼저 실행)
  useEffect(() => {
    const SEEK_SHORT = 5;  // 좌우 화살표: 5초
    const SEEK_LONG = 10;  // Shift+좌우 화살표: 10초

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onClose();
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      // Ctrl+좌우 화살표: 편집 모드에서 시작점 1프레임 이동
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.stopPropagation();
        e.preventDefault();
        if (editMode && editToolbarRef.current) {
          const delta = e.key === 'ArrowRight' ? 1 / 30 : -1 / 30;
          editToolbarRef.current.nudgeStart(delta);
        }
        return;
      }

      // Ctrl+Alt+좌우 화살표: 편집 모드에서 끝점 1프레임 이동
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.stopPropagation();
        e.preventDefault();
        if (editMode && editToolbarRef.current) {
          const delta = e.key === 'ArrowRight' ? 1 / 30 : -1 / 30;
          editToolbarRef.current.nudgeEnd(delta);
        }
        return;
      }

      // 좌우 화살표: 시간 탐색 (파일 이동 차단)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.stopPropagation();
        e.preventDefault();
        const offset = e.shiftKey ? SEEK_LONG : SEEK_SHORT;
        video.currentTime += e.key === 'ArrowRight' ? offset : -offset;
        return;
      }

      // 위아래 화살표도 차단 (볼륨 조절 등 브라우저 기본 동작 유지하되 파일 이동 방지)
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.stopPropagation();
        return;
      }

      // Space: 재생/일시정지 (파일 이동 차단)
      if (e.key === ' ') {
        e.stopPropagation();
        e.preventDefault();
        video.paused ? video.play() : video.pause();
        return;
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, editMode]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* 헤더: 파일명 + 편집 버튼 + 닫기 버튼 */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3">
        <span className="text-sm text-white/80 truncate max-w-[70%]">{fileName}</span>
        <div className="flex items-center gap-2">
          {/* 편집 모드 토글 버튼 */}
          <button
            onClick={() => setEditMode(!editMode)}
            className="text-xs px-3 py-1 rounded hover:opacity-80 transition-opacity cursor-pointer"
            style={{
              background: editMode
                ? (themeVars?.accent ?? '#4ade80')
                : (themeVars?.surface ?? '#333'),
              color: editMode ? '#000' : (themeVars?.text ?? '#e5e7eb'),
              fontWeight: editMode ? 600 : 500,
              border: editMode ? 'none' : `1px solid ${themeVars?.border ?? '#444'}`,
            }}
          >
            {editMode ? '편집 종료' : '편집'}
          </button>
          {/* 닫기 버튼 */}
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={20} className="text-white/80" />
          </button>
        </div>
      </div>

      {/* 비디오 컨테이너 */}
      <div
        className="flex flex-col items-center w-full"
        style={{ maxWidth: '90vw', marginTop: editMode ? '0' : '0' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HTML5 비디오 플레이어 */}
        {!editMode ? (
          // 일반 모드: 브라우저 기본 컨트롤
          <video
            ref={videoRef}
            src={videoSrc}
            controls
            autoPlay
            className="max-w-[90vw] max-h-[85vh] rounded-lg"
            style={{ outline: 'none' }}
          />
        ) : (
          // 편집 모드: 커스텀 컨트롤 + VideoEditToolbar
          <div className="flex flex-col items-center w-full gap-3">
            {/* 비디오 (컨트롤 없음) */}
            <video
              ref={videoRef}
              src={videoSrc}
              autoPlay
              className="max-w-[90vw] rounded-lg"
              style={{ outline: 'none', maxHeight: '55vh' }}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => {
                setDuration(e.currentTarget.duration);
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            {/* 커스텀 재생 컨트롤 */}
            <div
              className="flex flex-col gap-2 w-full px-2"
              style={{ maxWidth: '640px' }}
            >
              {/* 재생/일시정지 + 시간 표시 */}
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="p-1.5 rounded hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
                >
                  {isPlaying
                    ? <Pause size={18} className="text-white/80" />
                    : <Play size={18} className="text-white/80" />
                  }
                </button>
                <span className="text-xs text-white/60 font-mono flex-shrink-0">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                {/* 시크바 */}
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 h-1 cursor-pointer accent-current"
                  style={{ accentColor: themeVars?.accent ?? '#4ade80' }}
                />
              </div>
            </div>

            {/* 편집 툴바 */}
            <VideoEditToolbar
              ref={editToolbarRef}
              videoRef={videoRef}
              videoPath={path}
              duration={duration}
              currentTime={currentTime}
              themeVars={themeVars}
              onFileChanged={onFileChanged}
            />
          </div>
        )}
      </div>
    </div>
  );
}
