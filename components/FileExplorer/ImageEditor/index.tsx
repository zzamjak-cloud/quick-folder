import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import EditorCanvas, { EditorCanvasRef } from './EditorCanvas';
import Toolbar from './panels/Toolbar';
import PropertyPanel from './panels/PropertyPanel';
import LayerPanel from './panels/LayerPanel';
import { ImageEditorProps } from './types';
import { useEditorState } from './hooks/useEditorState';
import { useLayers } from './hooks/useLayers';
import { useHistory } from './hooks/useHistory';
import { useCropMode } from './hooks/useCropMode';
import { loadImageFromPath, loadImageFromBase64, getSavePath } from './utils';

export default function ImageEditor({ path, themeVars, onClose }: ImageEditorProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<EditorCanvasRef>(null);

  const editorState = useEditorState();
  const layerMgr = useLayers();
  const history = useHistory(layerMgr.restoreLayers, layerMgr.getSnapshot);
  const cropMode = useCropMode(stageSize.width, stageSize.height);
  const { cropRect, setCropRect } = cropMode;

  // 이미지 로딩
  useEffect(() => {
    (async () => {
      try {
        const base64 = await loadImageFromPath(path);
        const img = await loadImageFromBase64(base64);
        setImage(img);
        fitToContainer(img);
      } catch (e) {
        console.error('이미지 로딩 실패:', e);
      }
    })();
  }, [path]);

  // 컨테이너에 맞춤
  const fitToContainer = useCallback((img: HTMLImageElement) => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const s = Math.min(cw / img.width, ch / img.height, 1);
    setScale(s);
    setStageSize({ width: img.width, height: img.height });
  }, []);

  // 윈도우 리사이즈 시 재맞춤
  useEffect(() => {
    const handler = () => { if (image) fitToContainer(image); };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [image, fitToContainer]);

  // 크롭 도구 선택 시 크롭 모드 시작/종료
  useEffect(() => {
    if (editorState.activeTool === 'crop' && !cropMode.isCropping) {
      cropMode.startCrop();
    } else if (editorState.activeTool !== 'crop' && cropMode.isCropping) {
      cropMode.cancelCrop();
    }
  }, [editorState.activeTool]);

  // 크롭 적용
  const applyCrop = useCallback(async () => {
    if (!cropMode.cropRect || !canvasRef.current || !image) return;
    const stage = canvasRef.current.getStage();
    if (!stage) return;

    history.pushSnapshot();
    const cr = cropMode.cropRect;

    // 크롭 오버레이를 숨기고 캔버스 캡처
    cropMode.cancelCrop();
    // 레이어를 한 프레임 뒤에 캡처 (오버레이 제거 반영)
    await new Promise(r => setTimeout(r, 0));

    const dataUrl = stage.toDataURL({
      x: cr.x, y: cr.y,
      width: cr.width, height: cr.height,
      pixelRatio: 1 / scale,
    });

    // 기존 레이어 요소 좌표를 크롭 오프셋만큼 보정
    layerMgr.setLayers(prev => prev.map(l => ({
      ...l,
      elements: l.elements.map(el => ({
        ...el,
        x: el.x - cr.x,
        y: el.y - cr.y,
      } as typeof el)),
    })));

    const img = await loadImageFromBase64(dataUrl);
    setImage(img);
    setStageSize({ width: img.width, height: img.height });
    editorState.setActiveTool('select');
    fitToContainer(img);
  }, [cropMode.cropRect, image, scale, history, layerMgr, editorState, fitToContainer]);

  // 키보드 단축키 (캡처 단계 — 글로벌 단축키 차단)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.key === 'Escape') { onClose(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); history.undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); history.redo(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editorState.selectedElementId) {
          history.pushSnapshot();
          layerMgr.removeElement(editorState.selectedElementId);
          editorState.setSelectedElementId(null);
        }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [editorState.selectedElementId, history, layerMgr, onClose]);

  // 초기화
  const handleReset = useCallback(() => {
    history.pushSnapshot();
    layerMgr.setLayers([{
      id: crypto.randomUUID(), name: '레이어 1',
      visible: true, locked: false, elements: [],
    }]);
  }, [history, layerMgr]);

  // 저장
  const handleSave = useCallback(async () => {
    const stage = canvasRef.current?.getStage();
    if (!stage || !image) return;
    setSaving(true);
    try {
      const dataUrl = stage.toDataURL({ pixelRatio: 1 / scale });
      const base64Data = dataUrl.split(',')[1];
      const savePath = getSavePath(path);
      await invoke('save_image_base64', { path: savePath, base64Data });
      onClose();
    } catch (e) {
      console.error('저장 실패:', e);
    } finally {
      setSaving(false);
    }
  }, [image, path, scale, onClose]);

  return (
    <div
      className="fixed inset-0 flex"
      style={{ zIndex: 10001, backgroundColor: themeVars?.bg ?? '#0f172a' }}
    >
      {/* 좌측 툴바 */}
      <Toolbar
        activeTool={editorState.activeTool}
        setActiveTool={editorState.setActiveTool}
        onReset={handleReset}
        onSave={handleSave}
        themeVars={themeVars}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
      />

      {/* 캔버스 + 속성패널 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div ref={containerRef} className="flex-1 overflow-hidden flex items-center justify-center relative"
          style={{ backgroundColor: '#1a1a2e' }}
        >
          {/* 크롭 모드 적용/취소 버튼 */}
          {cropMode.isCropping && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2" style={{ zIndex: 10 }}>
              <button onClick={applyCrop}
                style={{ padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  backgroundColor: themeVars?.accent ?? '#3b82f6', color: '#fff', fontSize: 13 }}>
                적용
              </button>
              <button onClick={() => { cropMode.cancelCrop(); editorState.setActiveTool('select'); }}
                style={{ padding: '6px 16px', borderRadius: 6, border: `1px solid ${themeVars?.border ?? '#444'}`,
                  cursor: 'pointer', backgroundColor: 'transparent', color: themeVars?.text ?? '#e5e7eb', fontSize: 13 }}>
                취소
              </button>
            </div>
          )}
          {image ? (
            <EditorCanvas
              ref={canvasRef}
              image={image}
              layers={layerMgr.layers}
              activeTool={editorState.activeTool}
              strokeColor={editorState.strokeColor}
              strokeWidth={editorState.strokeWidth}
              fontSize={editorState.fontSize}
              selectedElementId={editorState.selectedElementId}
              onSelectElement={editorState.setSelectedElementId}
              onAddElement={layerMgr.addElement}
              onUpdateElement={layerMgr.updateElement}
              onRemoveElement={layerMgr.removeElement}
              onPushSnapshot={history.pushSnapshot}
              cropRect={cropRect}
              onCropChange={setCropRect}
              stageWidth={stageSize.width}
              stageHeight={stageSize.height}
              scale={scale}
            />
          ) : (
            <span style={{ color: themeVars?.muted ?? '#888' }}>이미지 로딩 중...</span>
          )}
        </div>
        <PropertyPanel
          strokeColor={editorState.strokeColor}
          setStrokeColor={editorState.setStrokeColor}
          strokeWidth={editorState.strokeWidth}
          setStrokeWidth={editorState.setStrokeWidth}
          fontSize={editorState.fontSize}
          setFontSize={editorState.setFontSize}
          themeVars={themeVars}
        />
      </div>

      {/* 우측 레이어 패널 */}
      <LayerPanel
        layers={layerMgr.layers}
        activeLayerId={layerMgr.activeLayerId}
        setActiveLayerId={layerMgr.setActiveLayerId}
        addLayer={layerMgr.addLayer}
        removeLayer={layerMgr.removeLayer}
        toggleVisibility={layerMgr.toggleLayerVisibility}
        toggleLock={layerMgr.toggleLayerLock}
        renameLayer={layerMgr.renameLayer}
        themeVars={themeVars}
      />
    </div>
  );
}
