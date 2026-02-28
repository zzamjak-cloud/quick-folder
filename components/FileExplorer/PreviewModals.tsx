import React from 'react';
import VideoPlayer from './VideoPlayer';
import { ThemeVars } from './types';
import { PreviewState } from './hooks/usePreview';

interface PreviewModalsProps {
  preview: PreviewState;
  themeVars: ThemeVars | null;
}

export function PreviewModals({ preview, themeVars }: PreviewModalsProps) {
  return (
    <>
      {/* 비디오 플레이어 모달 */}
      {preview.videoPlayerPath && (
        <VideoPlayer
          path={preview.videoPlayerPath}
          onClose={() => preview.setVideoPlayerPath(null)}
          themeVars={themeVars}
        />
      )}

      {/* 이미지/PSD 미리보기 모달 */}
      {preview.previewImagePath && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={preview.closeImagePreview}
          onKeyDown={(e) => { if (e.key === 'Escape') preview.closeImagePreview(); }}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] rounded-lg overflow-hidden shadow-2xl"
            style={{ backgroundColor: themeVars?.surface2 ?? '#1e293b' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}>
              <span className="text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                {preview.previewImagePath.split(/[/\\]/).pop()}
              </span>
              <button
                className="text-lg px-2 hover:opacity-70"
                style={{ color: themeVars?.muted ?? '#94a3b8' }}
                onClick={preview.closeImagePreview}
              >
                ✕
              </button>
            </div>
            {/* 이미지 */}
            <div className="flex items-center justify-center p-4" style={{ minWidth: 300, minHeight: 200 }}>
              {preview.previewLoading ? (
                <span className="text-sm" style={{ color: themeVars?.muted ?? '#94a3b8' }}>로딩 중...</span>
              ) : preview.previewImageData ? (
                <img
                  src={preview.previewImageData}
                  alt="미리보기"
                  className="max-w-[85vw] max-h-[80vh] object-contain"
                />
              ) : (
                <span className="text-sm" style={{ color: themeVars?.muted ?? '#94a3b8' }}>미리보기를 생성할 수 없습니다</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 텍스트 미리보기 모달 */}
      {preview.previewTextPath && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={preview.closeTextPreview}
        >
          <div
            className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
            style={{
              backgroundColor: themeVars?.surface2 ?? '#1e293b',
              width: '70vw', maxWidth: 800, maxHeight: '85vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}>
              <span className="text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                {preview.previewTextPath.split(/[/\\]/).pop()}
              </span>
              <button
                className="text-lg px-2 hover:opacity-70"
                style={{ color: themeVars?.muted ?? '#94a3b8' }}
                onClick={preview.closeTextPreview}
              >
                ✕
              </button>
            </div>
            {/* 텍스트 내용 */}
            <pre
              className="flex-1 overflow-auto p-4 text-xs leading-relaxed whitespace-pre-wrap"
              style={{ color: themeVars?.text ?? '#e5e7eb', maxHeight: '75vh' }}
            >
              {preview.previewTextContent ?? '로딩 중...'}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
