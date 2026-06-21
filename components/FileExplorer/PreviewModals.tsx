import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Edit3, Eraser, Film, Maximize2, Minimize2, Save, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import ImageCropOverlay from './ImageCropOverlay';
import DrawingCanvas, { DrawingCanvasHandle } from './DrawingCanvas';
import PreviewToolbar from './PreviewToolbar';
import { PreviewIconActionButton } from './PreviewIconActionButton';
import { VideoPreviewModal } from './VideoPreviewModal';
import { TextPreviewModal } from './TextPreviewModal';
import { JsonPreviewModalHost } from './JsonPreviewModalHost';
import { MarkdownPreviewModalHost } from './MarkdownPreviewModalHost';
import { HwpPreviewModalHost } from './HwpPreviewModalHost';
import { ThemeVars } from './types';
import { DrawingTool } from '../../types';
import { PreviewState } from './hooks/usePreview';
import { getFileName } from '../../utils/pathUtils';
import { FileEntry } from '../../types';
import { formatSize } from './fileUtils';

interface PreviewModalsProps {
  preview: PreviewState;
  themeVars: ThemeVars | null;
  previewEntry?: FileEntry | null;
  onCropSave?: (outputPath: string) => void;
  onRemoveBg?: (path: string) => void;
  onOpenGifCompress?: (paths: string[]) => void;
  onGifToMp4?: (paths: string[]) => void;
  onOpenImageCompress?: (path: string) => void;
  onOpenImageResize?: (path: string) => void;
  onOpenMdEditor: (path: string) => void;
  onFileChanged?: () => void;
}

export function PreviewModals({ preview, themeVars, previewEntry, onCropSave, onRemoveBg, onOpenGifCompress, onGifToMp4, onOpenImageCompress, onOpenImageResize, onOpenMdEditor, onFileChanged }: PreviewModalsProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const originalScrollRef = useRef<HTMLDivElement>(null);
  const compressedScrollRef = useRef<HTMLDivElement>(null);
  const syncingScrollRef = useRef(false);
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
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const drawingCanvasRef = useRef<DrawingCanvasHandle>(null);
  const [actionMode, setActionMode] = useState<'none' | 'compress' | 'resize'>('none');
  const [compressQuality, setCompressQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [resizeWidth, setResizeWidth] = useState('');
  const [resizeHeight, setResizeHeight] = useState('');
  const [keepRatio, setKeepRatio] = useState(true);
  const [compressedPreviewData, setCompressedPreviewData] = useState<string | null>(null);
  const [compressedPreviewSize, setCompressedPreviewSize] = useState<number | null>(null);
  const [compressPreviewLoading, setCompressPreviewLoading] = useState(false);
  const buttonStyle = {
    background: themeVars?.surface ?? '#333',
    color: themeVars?.text ?? '#e5e7eb',
    border: `1px solid ${themeVars?.border ?? '#444'}`,
  };
  const panelStyle = {
    background: themeVars?.surface ?? '#0f172a',
    border: `1px solid ${themeVars?.border ?? '#334155'}`,
  };
  const iconButtonStyle = useCallback((options?: { active?: boolean; accent?: boolean; disabled?: boolean }): React.CSSProperties => {
    const active = options?.active ?? false;
    const accent = options?.accent ?? false;
    const disabled = options?.disabled ?? false;
    return {
      width: 30,
      height: 30,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      background: accent
        ? (themeVars?.accent ?? '#4ade80')
        : active
          ? (themeVars?.accent20 ?? 'rgba(74, 222, 128, 0.2)')
          : (themeVars?.surface ?? '#333'),
      color: accent
        ? '#000'
        : active
          ? (themeVars?.accent ?? '#4ade80')
          : (themeVars?.text ?? '#e5e7eb'),
      border: `1px solid ${accent ? 'transparent' : active ? (themeVars?.accent ?? '#4ade80') : (themeVars?.border ?? '#444')}`,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      flexShrink: 0,
    };
  }, [themeVars]);

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
    if (!resizeWidth && !resizeHeight) {
      setResizeWidth(String(img.naturalWidth));
      setResizeHeight(String(img.naturalHeight));
    }
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
    setImageDims(null);
    setActionMode('none');
    preview.closeImagePreview();
  }, [preview]);

  // JPG/PNG/PSD 크롭·편집 지원
  const isCroppable = preview.previewImagePath &&
    /\.(jpe?g|png|psd|psb)$/i.test(preview.previewImagePath);
  const isGifPreview = !!preview.previewImagePath && /\.gif$/i.test(preview.previewImagePath);
  const canCompressInHeader = isGifPreview;
  const canImageActions = !!preview.previewImagePath && /\.(jpe?g|png)$/i.test(preview.previewImagePath);
  const originalSize = previewEntry?.size ?? null;
  const compressedDelta = originalSize && compressedPreviewSize != null
    ? Math.round(((compressedPreviewSize - originalSize) / originalSize) * 100)
    : null;
  const compressOptions: { value: 'low' | 'medium' | 'high'; label: string }[] = [
    { value: 'low', label: '고품질' },
    { value: 'medium', label: '균형' },
    { value: 'high', label: '고압축' },
  ];
  const compareImageStyle = imageDims
    ? { width: imageDims.width, height: 'auto', maxWidth: 'none' as const, maxHeight: 'none' as const }
    : { maxWidth: 'none' as const, maxHeight: 'none' as const };
  const resizedPreviewStyle = {
    width: `${Math.max(1, Number(resizeWidth) || imageDims?.width || 1)}px`,
    height: `${Math.max(1, Number(resizeHeight) || imageDims?.height || 1)}px`,
    maxWidth: 'none' as const,
    maxHeight: 'none' as const,
    objectFit: 'fill' as const,
  };

  useEffect(() => {
    if (actionMode !== 'compress' || !preview.previewImageData || !preview.previewImagePath) {
      setCompressedPreviewData(null);
      setCompressedPreviewSize(null);
      setCompressPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setCompressPreviewLoading(true);
    invoke<{ dataUrl?: string; data_url?: string; size: number }>('compress_image_preview', {
      path: preview.previewImagePath,
      quality: compressQuality,
    })
      .then((result) => {
        if (cancelled) return;
        setCompressedPreviewData(result.data_url ?? result.dataUrl ?? null);
        setCompressedPreviewSize(result.size);
      })
      .catch((e) => {
        console.error('이미지 압축 미리보기 실패:', e);
        if (cancelled) return;
        setCompressedPreviewData(preview.previewImageData);
        setCompressedPreviewSize(null);
      })
      .finally(() => {
        if (!cancelled) setCompressPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [actionMode, preview.previewImageData, preview.previewImagePath, compressQuality]);

  const syncPreviewScroll = useCallback((from: 'original' | 'compressed') => {
    if (syncingScrollRef.current) return;
    const source = from === 'original' ? originalScrollRef.current : compressedScrollRef.current;
    const target = from === 'original' ? compressedScrollRef.current : originalScrollRef.current;
    if (!source || !target) return;
    syncingScrollRef.current = true;
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  }, []);

  const handleCompressSave = useCallback(async () => {
    if (!preview.previewImagePath || saving) return;
    setSaving(true);
    try {
      const outputPath = await invoke<string>('compress_image', {
        path: preview.previewImagePath,
        quality: compressQuality,
      });
      handleCloseImage();
      onCropSave?.(outputPath);
    } catch (e) {
      console.error('이미지 압축 실패:', e);
    } finally {
      setSaving(false);
    }
  }, [preview.previewImagePath, saving, compressQuality, handleCloseImage, onCropSave]);

  const handleResizeSave = useCallback(async () => {
    if (!preview.previewImagePath || saving) return;
    const w = Number(resizeWidth);
    const h = Number(resizeHeight);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    setSaving(true);
    try {
      const outputPath = await invoke<string>('resize_image', {
        path: preview.previewImagePath,
        width: Math.round(w),
        height: Math.round(h),
      });
      handleCloseImage();
      onCropSave?.(outputPath);
    } catch (e) {
      console.error('이미지 크기조정 실패:', e);
    } finally {
      setSaving(false);
    }
  }, [preview.previewImagePath, saving, resizeWidth, resizeHeight, handleCloseImage, onCropSave]);

  // E 키로 편집 모드 진입 (이미지 미리보기 활성 + 편집 가능 + 아직 편집 모드 아닐 때)
  // 물리 키 e.code 기준 + IME 입력 중 제외
  React.useEffect(() => {
    if (!preview.previewImagePath || !isCroppable || editMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'KeyE' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && (e as any).keyCode !== 229) {
        const target = e.target as HTMLElement | null;
        const isTyping = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (isTyping) return;
        e.preventDefault();
        e.stopPropagation();
        setEditMode(true);
        setActiveTool('pen');
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [preview.previewImagePath, isCroppable, editMode]);

  useEffect(() => {
    if (!preview.previewImagePath || !isCroppable || preview.previewImageEditRequest === 0) return;
    setActionMode('none');
    setHasCrop(false);
    setEditMode(true);
    setActiveTool('pen');
  }, [preview.previewImageEditRequest, preview.previewImagePath, isCroppable]);

  return (
    <>
      <VideoPreviewModal
        path={preview.videoPlayerPath}
        onClose={() => preview.setVideoPlayerPath(null)}
        onFileChanged={onFileChanged}
        themeVars={themeVars}
      />

      {/* 이미지/PSD 미리보기 모달 */}
      {preview.previewImagePath && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={handleCloseImage}
          onKeyDown={(e) => { if (e.key === 'Escape') handleCloseImage(); }}
        >
          <div
            className="relative max-w-[94vw] max-h-[92vh] rounded-lg overflow-hidden shadow-2xl flex"
            style={{
              backgroundColor: themeVars?.surface2 ?? '#1e293b',
              minWidth: actionMode === 'none'
                ? (editMode ? 'min(760px, 94vw)' : 'min(560px, 94vw)')
                : 'min(1180px, 94vw)',
              minHeight: actionMode === 'none'
                ? (editMode ? 'min(520px, 92vh)' : 'min(360px, 92vh)')
                : 'min(720px, 92vh)',
              height: actionMode === 'none' ? undefined : '92vh',
            }}
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
          {isCroppable && editMode && (
            <div style={{ width: 10, background: themeVars?.surface2 ?? '#1e293b', flexShrink: 0 }} />
          )}
            {/* 우측: 헤더 + 이미지 영역 */}
            <div className="flex flex-col flex-1 min-w-0">
            {/* 헤더 1행: 제목 / 압축( gif ) / 닫기 */}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0 truncate text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                {getFileName(preview.previewImagePath)}
              </span>
              <div className="flex items-center gap-1.5">
                {canCompressInHeader && preview.previewImagePath && (
                  <>
                    <PreviewIconActionButton
                      label="GIF 압축"
                      buttonStyle={iconButtonStyle()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenGifCompress?.([preview.previewImagePath!]);
                      }}
                      icon={<Minimize2 size={15} />}
                    />
                    <PreviewIconActionButton
                      label="GIF를 MP4로 변환"
                      buttonStyle={iconButtonStyle()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const path = preview.previewImagePath!;
                        handleCloseImage();
                        onGifToMp4?.([path]);
                      }}
                      icon={<Film size={15} />}
                    />
                  </>
                )}
                {isCroppable && (
                  <PreviewIconActionButton
                    label={editMode ? '편집 종료' : '편집'}
                    buttonStyle={iconButtonStyle({ active: editMode })}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (editMode) {
                        setEditMode(false);
                        return;
                      }
                      setActionMode('none');
                      setActiveTool('pen');
                      setEditMode(true);
                    }}
                    icon={<Edit3 size={15} />}
                  />
                )}
                {canImageActions && (
                  <>
                    <PreviewIconActionButton
                      label="이미지 압축"
                      buttonStyle={iconButtonStyle({ active: actionMode === 'compress' })}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditMode(false);
                        setHasCrop(false);
                        setActionMode((m) => (m === 'compress' ? 'none' : 'compress'));
                        if (preview.previewImagePath) onOpenImageCompress?.(preview.previewImagePath);
                      }}
                      icon={<Minimize2 size={15} />}
                    />
                    <PreviewIconActionButton
                      label="크기 조정"
                      buttonStyle={iconButtonStyle({ active: actionMode === 'resize' })}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditMode(false);
                        setHasCrop(false);
                        setActionMode((m) => (m === 'resize' ? 'none' : 'resize'));
                        if (preview.previewImagePath) onOpenImageResize?.(preview.previewImagePath);
                      }}
                      icon={<Maximize2 size={15} />}
                    />
                  </>
                )}
                {isCroppable && !editMode && !hasCrop && onRemoveBg && preview.previewImagePath && (
                  <PreviewIconActionButton
                    label="배경 제거"
                    buttonStyle={iconButtonStyle()}
                    onClick={(e) => {
                      e.stopPropagation();
                      const path = preview.previewImagePath!;
                      handleCloseImage();
                      onRemoveBg(path);
                    }}
                    icon={<Eraser size={15} />}
                  />
                )}
                {editMode && hasDrawStrokes && (
                  <PreviewIconActionButton
                    label="PNG 저장"
                    className="hover:opacity-90"
                    buttonStyle={iconButtonStyle({ accent: true, disabled: saving })}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!saving) handleDrawingSave();
                    }}
                    icon={<Save size={15} />}
                  />
                )}
                {isCroppable && !editMode && hasCrop && (
                  <PreviewIconActionButton
                    label="PNG 저장"
                    className="hover:opacity-90"
                    buttonStyle={iconButtonStyle({ accent: true })}
                    onClick={(e) => {
                      e.stopPropagation();
                      cropSaveFnRef.current?.();
                    }}
                    icon={<Save size={15} />}
                  />
                )}
                <PreviewIconActionButton
                  label="닫기"
                  className="hover:opacity-80"
                  buttonStyle={iconButtonStyle()}
                  onClick={handleCloseImage}
                  icon={<X size={16} />}
                />
              </div>
            </div>
            {/* 헤더 2행: 편집/압축/크기조정/배경제거/PNG저장 */}
            <div className="hidden">
              {isCroppable && !editMode && (
                <button className="text-xs px-3 py-1 rounded hover:opacity-80" style={{ background: themeVars?.surface ?? '#333', color: themeVars?.text ?? '#e5e7eb', border: `1px solid ${themeVars?.border ?? '#444'}` }} onClick={(e) => { e.stopPropagation(); setEditMode(true); setActiveTool('pen'); }}>편집</button>
              )}
              {editMode && (
                <button className="text-xs px-3 py-1 rounded hover:opacity-80" style={{ background: themeVars?.surface ?? '#333', color: themeVars?.text ?? '#e5e7eb', border: `1px solid ${themeVars?.border ?? '#444'}` }} onClick={(e) => { e.stopPropagation(); setEditMode(false); }}>편집 종료</button>
              )}
              {!isGifPreview && (
                <button
                  className="text-xs px-3 py-1 rounded hover:opacity-80"
                  style={{ background: themeVars?.surface ?? '#333', color: themeVars?.text ?? '#e5e7eb', border: `1px solid ${themeVars?.border ?? '#444'}` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canImageActions) return;
                    setEditMode(false);
                    setHasCrop(false);
                    setActionMode((m) => (m === 'compress' ? 'none' : 'compress'));
                    if (preview.previewImagePath) onOpenImageCompress?.(preview.previewImagePath);
                  }}
                >
                  압축
                </button>
              )}
              {canImageActions && (
                <button
                  className="text-xs px-3 py-1 rounded hover:opacity-80"
                  style={{ background: themeVars?.surface ?? '#333', color: themeVars?.text ?? '#e5e7eb', border: `1px solid ${themeVars?.border ?? '#444'}` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditMode(false);
                    setHasCrop(false);
                    setActionMode((m) => (m === 'resize' ? 'none' : 'resize'));
                    if (preview.previewImagePath) onOpenImageResize?.(preview.previewImagePath);
                  }}
                >
                  크기조정
                </button>
              )}
              {isCroppable && !editMode && !hasCrop && onRemoveBg && preview.previewImagePath && (
                <button className="text-xs px-3 py-1 rounded hover:opacity-80" style={{ background: themeVars?.surface ?? '#333', color: themeVars?.text ?? '#e5e7eb', border: `1px solid ${themeVars?.border ?? '#444'}` }} onClick={(e) => { e.stopPropagation(); const path = preview.previewImagePath!; handleCloseImage(); onRemoveBg(path); }}>배경 제거</button>
              )}
              {editMode && hasDrawStrokes && (
                <button className="text-xs px-3 py-1 rounded hover:opacity-90" style={{ background: '#22c55e', color: '#fff', fontWeight: 600, border: 'none', opacity: saving ? 0.6 : 1 }} onClick={(e) => { e.stopPropagation(); if (!saving) handleDrawingSave(); }}>PNG 저장</button>
              )}
              {isCroppable && !editMode && hasCrop && (
                <button className="text-xs px-3 py-1 rounded hover:opacity-80" style={{ background: themeVars?.accent ?? '#4ade80', color: '#000', fontWeight: 600, border: 'none' }} onClick={(e) => { e.stopPropagation(); cropSaveFnRef.current?.(); }}>PNG 저장</button>
              )}
            </div>
            {/* 이미지 + 크롭 오버레이 */}
            <div
              ref={imgContainerRef}
              className="relative flex items-center justify-center p-4"
              style={{
                minWidth: actionMode === 'none' ? 380 : 980,
                minHeight: actionMode === 'none' ? 240 : 0,
                flex: actionMode === 'none' ? undefined : '1 1 0',
                overflow: actionMode === 'none' ? undefined : 'hidden',
              }}
            >
              {preview.previewLoading ? (
                <span className="text-sm" style={{ color: themeVars?.muted ?? '#94a3b8' }}>로딩 중...</span>
              ) : preview.previewImageData && actionMode === 'compress' && canImageActions ? (
                <div className="grid h-full min-h-0 w-full gap-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 300px' }}>
                  <div className="flex min-h-0 min-w-0 flex-col rounded-lg p-3" style={panelStyle}>
                    <div className="mb-2 flex items-center justify-between text-xs" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
                      <span>원본</span>
                      <span>{previewEntry ? formatSize(previewEntry.size, false) : '-'}</span>
                    </div>
                    <div
                      ref={originalScrollRef}
                      className="flex-1 overflow-auto rounded"
                      style={{ background: '#05070a' }}
                      onScroll={() => syncPreviewScroll('original')}
                    >
                      <img src={preview.previewImageData} alt="원본" draggable={false} style={compareImageStyle} />
                    </div>
                  </div>
                  <div className="flex min-h-0 min-w-0 flex-col rounded-lg p-3" style={panelStyle}>
                    <div className="mb-2 flex items-center justify-between text-xs" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
                      <span>압축 이미지</span>
                      <span>{compressPreviewLoading ? '계산 중...' : compressedPreviewSize != null ? formatSize(compressedPreviewSize, false) : '-'}</span>
                    </div>
                    <div
                      ref={compressedScrollRef}
                      className="flex-1 overflow-auto rounded"
                      style={{ background: '#05070a' }}
                      onScroll={() => syncPreviewScroll('compressed')}
                    >
                      <img src={compressedPreviewData ?? preview.previewImageData} alt="압축 이미지" draggable={false} style={compareImageStyle} />
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-col rounded-lg p-4" style={panelStyle}>
                    <div className="mb-3 text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>압축 단계</div>
                    <div className="grid grid-cols-3 gap-2">
                      {compressOptions.map((option) => (
                        <button
                          key={option.value}
                          className="rounded px-2 py-2 text-xs"
                          onClick={() => setCompressQuality(option.value)}
                          style={{
                            border: `1px solid ${option.value === compressQuality ? (themeVars?.accent ?? '#4ade80') : (themeVars?.border ?? '#444')}`,
                            background: option.value === compressQuality ? `${themeVars?.accent ?? '#4ade80'}22` : 'transparent',
                            color: themeVars?.text ?? '#e5e7eb',
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 space-y-2 text-xs" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
                      <div className="flex justify-between"><span>원본 용량</span><span>{previewEntry ? formatSize(previewEntry.size, false) : '-'}</span></div>
                      <div className="flex justify-between"><span>예상 용량</span><span>{compressPreviewLoading ? '계산 중...' : compressedPreviewSize != null ? formatSize(compressedPreviewSize, false) : '-'}</span></div>
                      <div className="flex justify-between"><span>변화</span><span>{compressedDelta == null ? '-' : `${compressedDelta > 0 ? '+' : ''}${compressedDelta}%`}</span></div>
                    </div>
                    <div className="mt-auto flex gap-2">
                      <button className="flex-1 rounded px-3 py-2 text-sm" style={buttonStyle} onClick={() => setActionMode('none')}>취소</button>
                      <button className="flex-1 rounded px-3 py-2 text-sm font-semibold" style={{ background: themeVars?.accent ?? '#4ade80', color: '#000' }} onClick={handleCompressSave} disabled={saving}>저장</button>
                    </div>
                  </div>
                </div>
              ) : preview.previewImageData && actionMode === 'resize' && canImageActions ? (
                <div className="grid h-full min-h-0 w-full gap-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 300px' }}>
                  <div className="flex min-h-0 min-w-0 flex-col rounded-lg p-3" style={panelStyle}>
                    <div className="mb-2 flex items-center justify-between text-xs" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
                      <span>원본</span>
                      <span>{imageDims ? `${imageDims.width} x ${imageDims.height}px` : '-'}</span>
                    </div>
                    <div
                      className="flex-1 overflow-auto rounded"
                      style={{ background: '#05070a' }}
                    >
                      <img src={preview.previewImageData} alt="원본" draggable={false} style={compareImageStyle} />
                    </div>
                  </div>
                  <div className="flex min-h-0 min-w-0 flex-col rounded-lg p-3" style={panelStyle}>
                    <div className="mb-2 flex items-center justify-between text-xs" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
                      <span>크기조정</span>
                      <span>{resizeWidth || '-'} x {resizeHeight || '-'}px</span>
                    </div>
                    <div
                      className="flex-1 overflow-auto rounded"
                      style={{ background: '#05070a' }}
                    >
                      <img src={preview.previewImageData} alt="크기조정" draggable={false} style={resizedPreviewStyle} />
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-col rounded-lg p-4" style={panelStyle}>
                    <div className="mb-3 text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>크기조정</div>
                    <div className="flex items-center gap-2">
                      <input
                        value={resizeWidth}
                        onChange={(e) => {
                          const next = e.target.value.replace(/[^\d]/g, '');
                          setResizeWidth(next);
                          if (keepRatio && imageDims && next) {
                            const w = Number(next);
                            if (w > 0) setResizeHeight(String(Math.max(1, Math.round((w * imageDims.height) / imageDims.width))));
                          }
                        }}
                        className="w-24 rounded px-2 py-2 text-sm"
                        style={buttonStyle}
                      />
                      <span style={{ color: themeVars?.muted ?? '#94a3b8' }}>x</span>
                      <input
                        value={resizeHeight}
                        onChange={(e) => {
                          const next = e.target.value.replace(/[^\d]/g, '');
                          setResizeHeight(next);
                          if (keepRatio && imageDims && next) {
                            const h = Number(next);
                            if (h > 0) setResizeWidth(String(Math.max(1, Math.round((h * imageDims.width) / imageDims.height))));
                          }
                        }}
                        className="w-24 rounded px-2 py-2 text-sm"
                        style={buttonStyle}
                      />
                    </div>
                    <label className="mt-4 flex items-center gap-2 text-xs" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
                      <input type="checkbox" checked={keepRatio} onChange={(e) => setKeepRatio(e.target.checked)} />
                      비율 유지
                    </label>
                    <div className="mt-auto flex gap-2">
                      <button className="flex-1 rounded px-3 py-2 text-sm" style={buttonStyle} onClick={() => setActionMode('none')}>취소</button>
                      <button className="flex-1 rounded px-3 py-2 text-sm font-semibold" style={{ background: themeVars?.accent ?? '#4ade80', color: '#000' }} onClick={handleResizeSave} disabled={saving}>저장</button>
                    </div>
                  </div>
                </div>
              ) : preview.previewImageData ? (
                <>
                  <img
                    ref={imgRef}
                    src={preview.previewImageData}
                    alt="미리보기"
                    className="max-w-[85vw] max-h-[80vh] object-contain"
                    onLoad={handleImageLoad}
                    onLoadCapture={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      setImageDims({ width: target.naturalWidth, height: target.naturalHeight });
                    }}
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
            {/* 푸터 */}
            <div
              className="px-4 py-2 text-xs flex items-center justify-between"
              style={{ color: themeVars?.muted ?? '#94a3b8' }}
            >
              <span>{imageDims ? `${imageDims.width} x ${imageDims.height}px` : '-'}</span>
              <span>{previewEntry ? formatSize(previewEntry.size, false) : '-'}</span>
            </div>
            </div>{/* flex-col 닫기 */}
          </div>
        </div>
      )}

      <TextPreviewModal
        path={preview.previewTextPath}
        content={preview.previewTextContent}
        themeVars={themeVars}
        onClose={preview.closeTextPreview}
      />
      <JsonPreviewModalHost
        path={preview.previewJsonPath}
        data={preview.previewJsonData}
        editRequestToken={preview.previewJsonEditRequest}
        themeVars={themeVars}
        onClose={preview.closeJsonPreview}
      />
      <MarkdownPreviewModalHost
        path={preview.previewMdPath}
        content={preview.previewMdContent}
        error={preview.previewMdError}
        loading={preview.previewMdLoading}
        themeVars={themeVars}
        onClose={preview.closeMdPreview}
        onEdit={(path) => {
          preview.closeMdPreview();
          onOpenMdEditor(path);
        }}
      />
      <HwpPreviewModalHost
        path={preview.hwpPreviewPath}
        themeVars={themeVars}
        onClose={() => preview.setHwpPreviewPath(null)}
      />
    </>
  );
}
