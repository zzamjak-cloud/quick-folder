import React, { useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import VideoPlayer from './VideoPlayer';
import ImageCropOverlay from './ImageCropOverlay';
import { ThemeVars } from './types';
import { PreviewState } from './hooks/usePreview';
import { getFileName } from '../../utils/pathUtils';

interface PreviewModalsProps {
  preview: PreviewState;
  themeVars: ThemeVars | null;
  onCropSave?: (outputPath: string) => void;
}

export function PreviewModals({ preview, themeVars, onCropSave }: PreviewModalsProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [imageRect, setImageRect] = useState<{ width: number; height: number; left: number; top: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // 이미지 로드 완료 시 표시 크기와 원본 크기 기록
  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    const container = imgContainerRef.current;
    if (!img || !container) return;
    const containerRect = container.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    setImageRect({
      width: imgRect.width,
      height: imgRect.height,
      left: imgRect.left - containerRect.left,
      top: imgRect.top - containerRect.top,
    });
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

  // 크롭 저장 핸들러
  const handleCropSave = useCallback(async (x: number, y: number, width: number, height: number) => {
    if (!preview.previewImagePath || saving) return;
    setSaving(true);
    try {
      const outputPath = await invoke<string>('crop_image', {
        path: preview.previewImagePath,
        x, y, width, height,
      });
      onCropSave?.(outputPath);
    } catch (e) {
      console.error('크롭 저장 실패:', e);
    } finally {
      setSaving(false);
    }
  }, [preview.previewImagePath, saving, onCropSave]);

  // 이미지 모달 닫을 때 크롭 상태도 초기화
  const handleCloseImage = useCallback(() => {
    setImageRect(null);
    setNaturalSize(null);
    preview.closeImagePreview();
  }, [preview]);

  // JPG/PNG만 크롭 지원
  const isCroppable = preview.previewImagePath &&
    /\.(jpe?g|png)$/i.test(preview.previewImagePath);

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
          onClick={handleCloseImage}
          onKeyDown={(e) => { if (e.key === 'Escape') handleCloseImage(); }}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] rounded-lg overflow-hidden shadow-2xl"
            style={{ backgroundColor: themeVars?.surface2 ?? '#1e293b' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}>
              <span className="text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                {getFileName(preview.previewImagePath)}
              </span>
              <button
                className="text-lg px-2 hover:opacity-70"
                style={{ color: themeVars?.muted ?? '#94a3b8' }}
                onClick={handleCloseImage}
              >
                ✕
              </button>
            </div>
            {/* 이미지 + 크롭 오버레이 */}
            <div
              ref={imgContainerRef}
              className="relative flex items-center justify-center p-4"
              style={{ minWidth: 300, minHeight: 200 }}
            >
              {preview.previewLoading ? (
                <span className="text-sm" style={{ color: themeVars?.muted ?? '#94a3b8' }}>로딩 중...</span>
              ) : preview.previewImageData ? (
                <>
                  <img
                    ref={imgRef}
                    src={preview.previewImageData}
                    alt="미리보기"
                    className="max-w-[85vw] max-h-[80vh] object-contain"
                    onLoad={handleImageLoad}
                    draggable={false}
                  />
                  {isCroppable && imageRect && naturalSize && (
                    <div style={{
                      position: 'absolute',
                      left: imageRect.left,
                      top: imageRect.top,
                      width: imageRect.width,
                      height: imageRect.height,
                    }}>
                      <ImageCropOverlay
                        imageRect={imageRect}
                        naturalSize={naturalSize}
                        accentColor={themeVars?.accent ?? '#4ade80'}
                        onSave={handleCropSave}
                      />
                    </div>
                  )}
                </>
              ) : (
                <span className="text-sm" style={{ color: themeVars?.muted ?? '#94a3b8' }}>미리보기를 생성할 수 없습니다</span>
              )}
              {saving && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.4)', borderRadius: 8,
                }}>
                  <span style={{ color: '#fff', fontSize: 14 }}>저장 중...</span>
                </div>
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
                {getFileName(preview.previewTextPath)}
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
