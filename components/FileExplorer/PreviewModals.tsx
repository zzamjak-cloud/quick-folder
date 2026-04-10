import React, { useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import VideoPlayer from './VideoPlayer';
import ImageCropOverlay from './ImageCropOverlay';
import DrawingCanvas, { DrawingCanvasHandle } from './DrawingCanvas';
import PreviewToolbar from './PreviewToolbar';
import JsonViewerModal from './JsonViewerModal';
import { ThemeVars } from './types';
import { DrawingTool } from '../../types';
import { PreviewState } from './hooks/usePreview';
import { getFileName } from '../../utils/pathUtils';

interface PreviewModalsProps {
  preview: PreviewState;
  themeVars: ThemeVars | null;
  onCropSave?: (outputPath: string) => void;
  onRemoveBg?: (path: string) => void;
  onFileChanged?: () => void;
}

export function PreviewModals({ preview, themeVars, onCropSave, onRemoveBg, onFileChanged }: PreviewModalsProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [imageRect, setImageRect] = useState<{ width: number; height: number; left: number; top: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasCrop, setHasCrop] = useState(false);
  const cropSaveFnRef = useRef<(() => void) | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [activeTool, setActiveTool] = useState<DrawingTool>('pen');
  const [drawColor, setDrawColor] = useState('#EF4444');
  const [drawWidth, setDrawWidth] = useState(4);
  const [hasDrawStrokes, setHasDrawStrokes] = useState(false);
  const drawingCanvasRef = useRef<DrawingCanvasHandle>(null);

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

  // 드로잉 합성 저장 핸들러
  const handleDrawingSave = useCallback(async () => {
    if (!preview.previewImagePath || saving || !drawingCanvasRef.current) return;
    setSaving(true);
    try {
      const dataUrl = await drawingCanvasRef.current.compositeToDataUrl();
      if (!dataUrl) { setSaving(false); return; }
      const outputPath = await invoke<string>('save_annotated_image', {
        originalPath: preview.previewImagePath,
        imageData: dataUrl,
      });
      onCropSave?.(outputPath);
    } catch (e) {
      console.error('드로잉 저장 실패:', e);
    } finally {
      setSaving(false);
    }
  }, [preview.previewImagePath, saving, onCropSave]);

  // 이미지 모달 닫을 때 크롭·드로잉 상태도 초기화
  const handleCloseImage = useCallback(() => {
    setImageRect(null);
    setNaturalSize(null);
    setHasCrop(false);
    cropSaveFnRef.current = null;
    setEditMode(false);
    setActiveTool('pen');
    setHasDrawStrokes(false);
    preview.closeImagePreview();
  }, [preview]);

  // JPG/PNG/PSD 크롭·편집 지원
  const isCroppable = preview.previewImagePath &&
    /\.(jpe?g|png|psd|psb)$/i.test(preview.previewImagePath);

  return (
    <>
      {/* 비디오 플레이어 모달 */}
      {preview.videoPlayerPath && (
        <VideoPlayer
          path={preview.videoPlayerPath}
          onClose={() => preview.setVideoPlayerPath(null)}
          onFileChanged={onFileChanged}
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
            className="relative max-w-[90vw] max-h-[90vh] rounded-lg overflow-hidden shadow-2xl flex"
            style={{ backgroundColor: themeVars?.surface2 ?? '#1e293b', minWidth: editMode ? 360 : undefined }}
            onClick={(e) => e.stopPropagation()}
          >
          {/* 좌측 툴바 — 편집 모드일 때만 표시 */}
          {isCroppable && editMode && (
            <PreviewToolbar
              activeTool={activeTool}
              onToolChange={setActiveTool}
              color={drawColor}
              onColorChange={setDrawColor}
              lineWidth={drawWidth}
              onLineWidthChange={setDrawWidth}
              onClear={() => drawingCanvasRef.current?.clearAll()}
              onSave={handleDrawingSave}
              hasStrokes={hasDrawStrokes}
              themeVars={themeVars}
            />
          )}
            {/* 우측: 헤더 + 이미지 영역 */}
            <div className="flex flex-col flex-1 min-w-0">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}>
              <span className="text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                {getFileName(preview.previewImagePath)}
              </span>
              <div className="flex items-center gap-2">
                {/* 편집 버튼 — 편집 모드가 아닐 때 */}
                {isCroppable && !editMode && (
                  <button
                    className="text-xs px-3 py-1 rounded hover:opacity-80"
                    style={{
                      background: themeVars?.surface ?? '#333',
                      color: themeVars?.text ?? '#e5e7eb',
                      fontWeight: 500,
                      cursor: 'pointer',
                      border: `1px solid ${themeVars?.border ?? '#444'}`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditMode(true);
                      setActiveTool('pen');
                    }}
                  >
                    편집
                  </button>
                )}
                {/* 편집 모드 종료 버튼 */}
                {editMode && (
                  <button
                    className="text-xs px-3 py-1 rounded hover:opacity-80"
                    style={{
                      background: themeVars?.accent ?? '#4ade80',
                      color: '#000',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditMode(false);
                    }}
                  >
                    편집 종료
                  </button>
                )}
                {/* 크롭 PNG 저장 — 편집 모드가 아닐 때만 */}
                {isCroppable && !editMode && hasCrop && (
                  <button
                    className="text-xs px-3 py-1 rounded hover:opacity-80"
                    style={{
                      background: themeVars?.accent ?? '#4ade80',
                      color: '#000',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                    }}
                    onClick={(e) => { e.stopPropagation(); cropSaveFnRef.current?.(); }}
                  >
                    PNG 저장
                  </button>
                )}
                {isCroppable && !editMode && !hasCrop && onRemoveBg && preview.previewImagePath && (
                  <button
                    className="text-xs px-3 py-1 rounded hover:opacity-80"
                    style={{
                      background: themeVars?.surface ?? '#333',
                      color: themeVars?.text ?? '#e5e7eb',
                      fontWeight: 500,
                      cursor: 'pointer',
                      border: `1px solid ${themeVars?.border ?? '#444'}`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const path = preview.previewImagePath!;
                      handleCloseImage();
                      onRemoveBg(path);
                    }}
                  >
                    배경 제거
                  </button>
                )}
                <button
                  className="text-lg px-2 hover:opacity-70"
                  style={{ color: themeVars?.muted ?? '#94a3b8' }}
                  onClick={handleCloseImage}
                >
                  ✕
                </button>
              </div>
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
                      {!editMode ? (
                        <ImageCropOverlay
                          imageRect={imageRect}
                          naturalSize={naturalSize}
                          accentColor={themeVars?.accent ?? '#4ade80'}
                          onSave={handleCropSave}
                          onCropChange={setHasCrop}
                          onRegisterSave={(fn) => { cropSaveFnRef.current = fn; }}
                        />
                      ) : (
                        <DrawingCanvas
                          ref={drawingCanvasRef}
                          imageRect={imageRect}
                          naturalSize={naturalSize}
                          tool={activeTool}
                          color={drawColor}
                          lineWidth={drawWidth}
                          accentColor={themeVars?.accent ?? '#4ade80'}
                          imageSrc={preview.previewImageData!}
                          onHasStrokes={setHasDrawStrokes}
                        />
                      )}
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
            </div>{/* flex-col 닫기 */}
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

      {/* JSON 뷰어 모달 */}
      {preview.previewJsonPath && preview.previewJsonData && (
        <JsonViewerModal
          path={preview.previewJsonPath}
          data={preview.previewJsonData}
          onClose={preview.closeJsonPreview}
          themeVars={themeVars}
        />
      )}
    </>
  );
}
