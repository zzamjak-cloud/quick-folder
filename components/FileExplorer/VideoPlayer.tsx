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
  const videoSrc = convertFileSrc(path);
  const fileName = path.split(/[/\\]/).pop() ?? '';

  // ESC 키로 닫기 (캡처 단계에서 처리하여 다른 핸들러보다 먼저 실행)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
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
        src={videoSrc}
        controls
        autoPlay
        className="max-w-[90vw] max-h-[85vh] rounded-lg"
        style={{ outline: 'none' }}
      />
    </div>
  );
}
