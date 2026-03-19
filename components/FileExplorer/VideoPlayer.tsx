import React, { useEffect, useRef } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { ThemeVars } from './types';

interface VideoPlayerProps {
  path: string;
  onClose: () => void;
  themeVars: ThemeVars | null;
}

// 동영상 미리보기 모달 (HTML5 video + Tauri asset protocol)
export default function VideoPlayer({ path, onClose, themeVars }: VideoPlayerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoSrc = convertFileSrc(path);
  const fileName = path.split(/[/\\]/).pop() ?? '';

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
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* 헤더: 파일명 + 닫기 버튼 */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3">
        <span className="text-sm text-white/80 truncate max-w-[80%]">{fileName}</span>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X size={20} className="text-white/80" />
        </button>
      </div>

      {/* HTML5 비디오 플레이어 */}
      <video
        ref={videoRef}
        src={videoSrc}
        controls
        autoPlay
        className="max-w-[90vw] max-h-[85vh] rounded-lg"
        style={{ outline: 'none' }}
      />
    </div>
  );
}
