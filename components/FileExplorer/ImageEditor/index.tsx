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
import type { ToolType } from './types';

/** 도구 단축키 매핑 */
const TOOL_KEYS: Record<string, ToolType> = {
  v: 'select', m: 'rect', c: 'circle', a: 'arrow',
  t: 'text', e: 'eraser', b: 'draw',
};

/** 이미지 주변 워크스페이스 여백 */
const WORKSPACE_MARGIN = 400;

export default function ImageEditor({ path, themeVars, onClose }: ImageEditorProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState({ width: 800, height: 600 });
  const [stageSize, setStageSize] = useState({ width: 1600, height: 1200 });
  const [imageOffset, setImageOffset] = useState({ x: WORKSPACE_MARGIN, y: WORKSPACE_MARGIN });
  const [scale, setScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<EditorCanvasRef>(null);

  const editorState = useEditorState();
  const layerMgr = useLayers();
  const history = useHistory(layerMgr.restoreLayers, layerMgr.getSnapshot);
  const cropMode = useCropMode(stageSize.width, stageSize.height);
  const { cropRect, setCropRect } = cropMode;

  // --- 키보드 핸들러용 refs (클로저 안정성 확보) ---
  const activeToolRef = useRef(editorState.activeTool);
  activeToolRef.current = editorState.activeTool;
  const strokeWidthRef = useRef(editorState.strokeWidth);
  strokeWidthRef.current = editorState.strokeWidth;
  const prevToolRef = useRef<ToolType | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const historyRef = useRef(history);
  historyRef.current = history;
  const layerMgrRef = useRef(layerMgr);
  layerMgrRef.current = layerMgr;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  // 이미지 로딩
  useEffect(() => {
    (async () => {
      try {
        const base64 = await loadImageFromPath(path);
        const img = await loadImageFromBase64(base64);
        setImage(img);
        const sw = img.width + WORKSPACE_MARGIN * 2;
        const sh = img.height + WORKSPACE_MARGIN * 2;
        setImageSize({ width: img.width, height: img.height });
        setStageSize({ width: sw, height: sh });
        setImageOffset({ x: WORKSPACE_MARGIN, y: WORKSPACE_MARGIN });
        fitToContainer(sw, sh);
      } catch (e) {
        console.error('이미지 로딩 실패:', e);
      }
    })();
  }, [path]);

  const fitToContainer = useCallback((sw: number, sh: number) => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const s = Math.min(cw / sw, ch / sh, 1);
    setScale(s);
  }, []);

  useEffect(() => {
    const handler = () => { fitToContainer(stageSize.width, stageSize.height); };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [stageSize, fitToContainer]);

  // 크롭 도구 선택 시 크롭 모드 시작/종료
  useEffect(() => {
    if (editorState.activeTool === 'crop' && !cropMode.isCropping) {
      cropMode.startCrop();
    } else if (editorState.activeTool !== 'crop' && cropMode.isCropping) {
      cropMode.cancelCrop();
    }
  }, [editorState.activeTool]);

  // 크롭 적용 — #3: 좌표에 scale 적용
  const applyCrop = useCallback(async () => {
    if (!cropMode.cropRect || !canvasRef.current || !image) return;
    const stage = canvasRef.current.getStage();
    if (!stage) return;

    history.pushSnapshot();
    const cr = cropMode.cropRect;
    const s = scale;

    cropMode.cancelCrop();
    await new Promise(r => setTimeout(r, 0));

    // Stage의 toDataURL은 픽셀 좌표 (= 내부좌표 × scale)
    const dataUrl = stage.toDataURL({
      x: cr.x * s,
      y: cr.y * s,
      width: cr.width * s,
      height: cr.height * s,
      pixelRatio: 1 / s,
    });

    layerMgr.setLayers(prev => prev.map(l => ({
      ...l,
      elements: l.elements.map(el => ({
        ...el,
        x: el.x - cr.x + WORKSPACE_MARGIN,
        y: el.y - cr.y + WORKSPACE_MARGIN,
      } as typeof el)),
    })));

    const img = await loadImageFromBase64(dataUrl);
    setImage(img);
    const sw = img.width + WORKSPACE_MARGIN * 2;
    const sh = img.height + WORKSPACE_MARGIN * 2;
    setImageSize({ width: img.width, height: img.height });
    setStageSize({ width: sw, height: sh });
    setImageOffset({ x: WORKSPACE_MARGIN, y: WORKSPACE_MARGIN });
    editorState.setActiveTool('select');
    fitToContainer(sw, sh);
  }, [cropMode.cropRect, image, scale, history, layerMgr, editorState, fitToContainer]);

  // 키보드 단축키 — 빈 deps로 한 번만 등록, refs로 최신 값 참조
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTextInput = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;

      // #2: textarea 내부 ESC → 편집기 닫지 않고 textarea만 blur
      if (isTextInput) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
          e.stopImmediatePropagation();
          e.preventDefault();
        }
        return; // textarea 내부에서는 다른 단축키 무시
      }

      e.stopImmediatePropagation();

      if (e.key === 'Escape') { onCloseRef.current(); return; }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); historyRef.current.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); historyRef.current.redo(); return; }

      // Ctrl 누르면 임시 선택 도구
      if ((e.key === 'Control' || e.key === 'Meta') && !prevToolRef.current) {
        prevToolRef.current = activeToolRef.current;
        editorState.setActiveTool('select');
        return;
      }

      // Delete/Backspace — 활성 레이어 제거
      if (e.key === 'Delete' || e.key === 'Backspace') {
        historyRef.current.pushSnapshot();
        layerMgrRef.current.removeActiveLayer();
        return;
      }

      // [ / ] 두께 조절
      if (e.key === '[') {
        editorState.setStrokeWidth(Math.max(1, strokeWidthRef.current - 1));
        return;
      }
      if (e.key === ']') {
        editorState.setStrokeWidth(Math.min(50, strokeWidthRef.current + 1));
        return;
      }

      // #1: 도구 단축키 — ctrlKey/metaKey 없을 때만
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const tool = TOOL_KEYS[e.key.toLowerCase()];
        if (tool) {
          prevToolRef.current = null;
          editorState.setActiveTool(tool);
          return;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      e.stopImmediatePropagation();
      if ((e.key === 'Control' || e.key === 'Meta') && prevToolRef.current) {
        editorState.setActiveTool(prevToolRef.current);
        prevToolRef.current = null;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 빈 deps — 한 번만 등록, refs로 최신 값 참조

  const handleReset = useCallback(() => {
    history.pushSnapshot();
    layerMgr.setLayers([{
      id: crypto.randomUUID(), name: '레이어 1',
      visible: true, locked: false, elements: [],
    }]);
  }, [history, layerMgr]);

  // 저장 — scale 보정 적용
  const handleSave = useCallback(async () => {
    const stage = canvasRef.current?.getStage();
    if (!stage || !image) return;
    setSaving(true);
    const s = scale;
    try {
      let minX = imageOffset.x, minY = imageOffset.y;
      let maxX = imageOffset.x + image.width, maxY = imageOffset.y + image.height;

      for (const layer of layerMgr.layers) {
        for (const el of layer.elements) {
          if (!el.visible) continue;
          if (el.type === 'arrow' || el.type === 'draw') {
            for (let i = 0; i < el.points.length; i += 2) {
              minX = Math.min(minX, el.points[i] - el.strokeWidth);
              minY = Math.min(minY, el.points[i + 1] - el.strokeWidth);
              maxX = Math.max(maxX, el.points[i] + el.strokeWidth);
              maxY = Math.max(maxY, el.points[i + 1] + el.strokeWidth);
            }
          } else {
            const w = el.type === 'rect' ? Math.abs(el.width) : el.type === 'circle' ? el.radiusX * 2 : el.type === 'text' ? el.width : 0;
            const h = el.type === 'rect' ? Math.abs(el.height) : el.type === 'circle' ? el.radiusY * 2 : el.type === 'text' ? el.fontSize * 2 : 0;
            minX = Math.min(minX, el.x - 10);
            minY = Math.min(minY, el.y - 10);
            maxX = Math.max(maxX, el.x + w + 10);
            maxY = Math.max(maxY, el.y + h + 10);
          }
        }
      }

      const exportWidth = maxX - minX;
      const exportHeight = maxY - minY;

      // Stage의 toDataURL은 픽셀 좌표 사용
      const dataUrl = stage.toDataURL({
        x: minX * s,
        y: minY * s,
        width: exportWidth * s,
        height: exportHeight * s,
        pixelRatio: 1 / s,
      });
      const base64Data = dataUrl.split(',')[1];
      const savePath = getSavePath(path);
      await invoke('save_image_base64', { path: savePath, base64Data });
      onClose();
    } catch (e) {
      console.error('저장 실패:', e);
    } finally {
      setSaving(false);
    }
  }, [image, imageOffset, path, scale, layerMgr.layers, onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 10001, backgroundColor: 'rgba(0,0,0,0.6)' }}
    >
      <div
        className="flex rounded-lg overflow-hidden shadow-2xl"
        style={{
          width: '90vw', height: '90vh',
          backgroundColor: themeVars?.bg ?? '#0f172a',
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
        }}
      >
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

        <div className="flex-1 flex flex-col overflow-hidden">
          <div ref={containerRef}
            className="flex-1 overflow-auto flex items-center justify-center relative"
            style={{ backgroundColor: themeVars?.surface ?? '#1e293b' }}
          >
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
                onRemoveLayerByElement={layerMgr.removeLayerByElement}
                onPushSnapshot={history.pushSnapshot}
                cropRect={cropRect}
                onCropChange={setCropRect}
                stageWidth={stageSize.width}
                stageHeight={stageSize.height}
                imageOffset={imageOffset}
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
    </div>
  );
}
