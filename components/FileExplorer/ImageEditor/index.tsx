import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ZoomIn, ZoomOut } from 'lucide-react';
import EditorCanvas, { EditorCanvasRef } from './EditorCanvas';
import Toolbar from './panels/Toolbar';
import PropertyPanel from './panels/PropertyPanel';
import LayerPanel from './panels/LayerPanel';
import { ImageEditorProps, EditorElement } from './types';
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

const WORKSPACE_MARGIN = 400;
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 3;

export default function ImageEditor({ path, themeVars, onClose }: ImageEditorProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 1600, height: 1200 });
  const [imageOffset] = useState({ x: WORKSPACE_MARGIN, y: WORKSPACE_MARGIN });
  const [scale, setScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<EditorCanvasRef>(null);

  const editorState = useEditorState();
  const layerMgr = useLayers();
  const history = useHistory(layerMgr.restoreLayers, layerMgr.getSnapshot);
  const cropMode = useCropMode();

  // --- 모든 가변 값을 ref로 유지 (키보드 핸들러 안정성) ---
  const refs = useRef({
    activeTool: editorState.activeTool,
    strokeWidth: editorState.strokeWidth,
    scale,
    prevTool: null as ToolType | null,
    onClose,
    setActiveTool: editorState.setActiveTool,
    setStrokeWidth: editorState.setStrokeWidth,
    history,
    layerMgr,
  });
  // 매 렌더마다 최신값으로 갱신
  refs.current.activeTool = editorState.activeTool;
  refs.current.strokeWidth = editorState.strokeWidth;
  refs.current.scale = scale;
  refs.current.onClose = onClose;
  refs.current.setActiveTool = editorState.setActiveTool;
  refs.current.setStrokeWidth = editorState.setStrokeWidth;
  refs.current.history = history;
  refs.current.layerMgr = layerMgr;

  // 이미지 로딩
  useEffect(() => {
    (async () => {
      try {
        const base64 = await loadImageFromPath(path);
        const img = await loadImageFromBase64(base64);
        setImage(img);
        const sw = img.width + WORKSPACE_MARGIN * 2;
        const sh = img.height + WORKSPACE_MARGIN * 2;
        setStageSize({ width: sw, height: sh });
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
    setScale(Math.min(cw / sw, ch / sh, 1));
  }, []);

  useEffect(() => {
    const handler = () => fitToContainer(stageSize.width, stageSize.height);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [stageSize, fitToContainer]);

  // #3: 줌 인/아웃
  const zoomIn = useCallback(() => setScale(s => Math.min(ZOOM_MAX, s + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setScale(s => Math.max(ZOOM_MIN, s - ZOOM_STEP)), []);

  // 크롭 모드 시작/종료 — #2: 이미지 크기 기준
  useEffect(() => {
    if (editorState.activeTool === 'crop' && !cropMode.isCropping && image) {
      cropMode.startCrop(imageOffset.x, imageOffset.y, image.width, image.height);
    } else if (editorState.activeTool !== 'crop' && cropMode.isCropping) {
      cropMode.cancelCrop();
    }
  }, [editorState.activeTool, image]);

  // 크롭 적용
  const applyCrop = useCallback(async () => {
    if (!cropMode.cropRect || !canvasRef.current || !image) return;
    const stage = canvasRef.current.getStage();
    if (!stage) return;

    history.pushSnapshot();
    const cr = cropMode.cropRect;
    const s = scale;

    cropMode.cancelCrop();
    await new Promise(r => setTimeout(r, 0));

    const dataUrl = stage.toDataURL({
      x: cr.x * s, y: cr.y * s,
      width: cr.width * s, height: cr.height * s,
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
    setStageSize({ width: sw, height: sh });
    editorState.setActiveTool('select');
    fitToContainer(sw, sh);
  }, [cropMode.cropRect, image, scale, history, layerMgr, editorState, fitToContainer]);

  // #1: 키보드 단축키 — 한 번만 등록, refs로 최신 값 참조
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTextInput = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
      if (isTextInput) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
          e.stopImmediatePropagation();
          e.preventDefault();
        }
        return;
      }

      e.stopImmediatePropagation();
      e.preventDefault();
      const r = refs.current;

      if (e.key === 'Escape') { r.onClose(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { r.history.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { r.history.redo(); return; }

      // #3: Ctrl + -/= 줌
      if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) { setScale(s => Math.max(ZOOM_MIN, s - ZOOM_STEP)); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { setScale(s => Math.min(ZOOM_MAX, s + ZOOM_STEP)); return; }

      // Ctrl 키 자체 → 임시 선택 도구
      if ((e.key === 'Control' || e.key === 'Meta') && !r.prevTool) {
        r.prevTool = r.activeTool;
        r.setActiveTool('select');
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') { r.history.pushSnapshot(); r.layerMgr.removeActiveLayer(); return; }
      if (e.key === '[') { r.setStrokeWidth(Math.max(1, r.strokeWidth - 1)); return; }
      if (e.key === ']') { r.setStrokeWidth(Math.min(50, r.strokeWidth + 1)); return; }

      // 도구 단축키 — Ctrl/Meta/Alt 없을 때
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const tool = TOOL_KEYS[e.key.toLowerCase()];
        if (tool) {
          r.prevTool = null;
          r.setActiveTool(tool);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      e.stopImmediatePropagation();
      const r = refs.current;
      if ((e.key === 'Control' || e.key === 'Meta') && r.prevTool) {
        r.setActiveTool(r.prevTool);
        r.prevTool = null;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, []); // 빈 deps — 절대 재등록 안 함

  const handleReset = useCallback(() => {
    history.pushSnapshot();
    layerMgr.setLayers([{
      id: crypto.randomUUID(), name: '레이어 1',
      visible: true, locked: false, elements: [],
    }]);
  }, [history, layerMgr]);

  // 저장 — scale 보정
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
      const dataUrl = stage.toDataURL({
        x: minX * s, y: minY * s,
        width: (maxX - minX) * s, height: (maxY - minY) * s,
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

  // #4: 선택된 텍스트 요소의 align 정보
  const selectedTextAlign = useMemo(() => {
    if (!editorState.selectedElementId) return null;
    for (const layer of layerMgr.layers) {
      for (const el of layer.elements) {
        if (el.id === editorState.selectedElementId && el.type === 'text') {
          return el.align ?? 'left';
        }
      }
    }
    return null;
  }, [editorState.selectedElementId, layerMgr.layers]);

  const handleTextAlignChange = useCallback((align: 'left' | 'center' | 'right') => {
    if (!editorState.selectedElementId) return;
    history.pushSnapshot();
    layerMgr.updateElement(editorState.selectedElementId, { align } as Partial<EditorElement>);
  }, [editorState.selectedElementId, history, layerMgr]);

  return (
    <div className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 10001, backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="flex rounded-lg overflow-hidden shadow-2xl"
        style={{
          width: '90vw', height: '90vh',
          backgroundColor: themeVars?.bg ?? '#0f172a',
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
        }}>

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
            style={{ backgroundColor: themeVars?.surface ?? '#1e293b' }}>

            {/* 크롭 버튼 */}
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

            {/* #3: 줌 컨트롤 */}
            <div className="absolute top-4 right-4 flex items-center gap-1" style={{ zIndex: 10 }}>
              <button onClick={zoomOut} title="축소 (Ctrl+-)"
                style={{ width: 28, height: 28, borderRadius: 4, border: 'none', cursor: 'pointer',
                  backgroundColor: themeVars?.surface2 ?? '#252540', color: themeVars?.text ?? '#e5e7eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ZoomOut size={14} />
              </button>
              <span style={{ color: themeVars?.muted ?? '#888', fontSize: 11, minWidth: 40, textAlign: 'center' }}>
                {Math.round(scale * 100)}%
              </span>
              <button onClick={zoomIn} title="확대 (Ctrl+=)"
                style={{ width: 28, height: 28, borderRadius: 4, border: 'none', cursor: 'pointer',
                  backgroundColor: themeVars?.surface2 ?? '#252540', color: themeVars?.text ?? '#e5e7eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ZoomIn size={14} />
              </button>
            </div>

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
                cropRect={cropMode.cropRect}
                onCropChange={cropMode.setCropRect}
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
            showTextAlign={selectedTextAlign !== null}
            textAlign={selectedTextAlign ?? 'left'}
            onTextAlignChange={handleTextAlignChange}
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
