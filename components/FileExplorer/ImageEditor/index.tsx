import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
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

const TOOL_KEYS: Record<string, ToolType> = {
  v: 'select', m: 'rect', c: 'circle', a: 'arrow',
  t: 'text', e: 'eraser', b: 'draw',
};

const WORKSPACE_MARGIN = 400;

export default function ImageEditor({ path, themeVars, onClose }: ImageEditorProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 1600, height: 1200 });
  const [imageOffset] = useState({ x: WORKSPACE_MARGIN, y: WORKSPACE_MARGIN });
  const [scale, setScale] = useState(1);
  const [zoomInput, setZoomInput] = useState('100');
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<EditorCanvasRef>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const editorState = useEditorState();
  const layerMgr = useLayers();
  const history = useHistory(layerMgr.restoreLayers, layerMgr.getSnapshot);
  const cropMode = useCropMode();

  // Ctrl 임시 선택 도구용
  const prevToolRef = useRef<ToolType | null>(null);
  // fitScale 기억 (Fit 버튼용)
  const fitScaleRef = useRef(1);

  // 줌 변경 시 input 동기화
  useEffect(() => {
    setZoomInput(String(Math.round(scale * 100)));
  }, [scale]);

  // 루트 div 자동 포커스
  useEffect(() => { rootRef.current?.focus(); }, []);

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
    const s = Math.min(cw / sw, ch / sh, 1);
    fitScaleRef.current = s;
    setScale(s);
  }, []);

  useEffect(() => {
    const handler = () => fitToContainer(stageSize.width, stageSize.height);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [stageSize, fitToContainer]);

  // 줌
  const zoomTo = useCallback((pct: number) => {
    setScale(Math.max(0.1, Math.min(3, pct / 100)));
  }, []);
  const zoomIn = useCallback(() => setScale(s => Math.min(3, +(s + 0.1).toFixed(1))), []);
  const zoomOut = useCallback(() => setScale(s => Math.max(0.1, +(s - 0.1).toFixed(1))), []);
  const zoomFit = useCallback(() => setScale(fitScaleRef.current), []);

  // 크롭 모드
  useEffect(() => {
    if (editorState.activeTool === 'crop' && !cropMode.isCropping && image) {
      cropMode.startCrop(imageOffset.x, imageOffset.y, image.width, image.height);
    } else if (editorState.activeTool !== 'crop' && cropMode.isCropping) {
      cropMode.cancelCrop();
    }
  }, [editorState.activeTool, image]);

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
        ...el, x: el.x - cr.x + WORKSPACE_MARGIN, y: el.y - cr.y + WORKSPACE_MARGIN,
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

  // ============================================================
  // 키보드 핸들러 — React onKeyDownCapture (window 리스너 불필요)
  // ============================================================
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const isTextInput = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
    if (isTextInput) {
      if (e.key === 'Escape') {
        (e.target as HTMLElement).blur();
        e.stopPropagation();
        e.preventDefault();
      }
      return;
    }

    e.stopPropagation();

    if (e.key === 'Escape') { onClose(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); history.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); history.redo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) { e.preventDefault(); zoomOut(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); return; }

    // Ctrl 키 자체 → 임시 선택 도구
    if ((e.key === 'Control' || e.key === 'Meta') && !prevToolRef.current) {
      prevToolRef.current = editorState.activeTool;
      editorState.setActiveTool('select');
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); history.pushSnapshot(); layerMgr.removeActiveLayer(); return; }
    if (e.key === '[') { editorState.setStrokeWidth(Math.max(1, editorState.strokeWidth - 1)); return; }
    if (e.key === ']') { editorState.setStrokeWidth(Math.min(50, editorState.strokeWidth + 1)); return; }

    // 도구 단축키
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool) {
        prevToolRef.current = null;
        editorState.setActiveTool(tool);
      }
    }
  }, [onClose, history, layerMgr, editorState, zoomIn, zoomOut]);

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    e.stopPropagation();
    if ((e.key === 'Control' || e.key === 'Meta') && prevToolRef.current) {
      editorState.setActiveTool(prevToolRef.current);
      prevToolRef.current = null;
    }
  }, [editorState]);

  const handleReset = useCallback(() => {
    history.pushSnapshot();
    layerMgr.setLayers([{
      id: crypto.randomUUID(), name: '레이어 1',
      visible: true, locked: false, elements: [],
    }]);
    rootRef.current?.focus();
  }, [history, layerMgr]);

  // 저장 상태 메시지
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // 저장 — 빠른 캡처 방식, JPG + 캔버스 배경색 적용
  const handleSave = useCallback(async () => {
    const stage = canvasRef.current?.getStage();
    if (!stage || !image) return;
    setSaving(true);
    setSaveMsg('저장 중...');
    try {
      // 이미지 영역 기준으로 간단 캡처
      const s = scale;
      const ox = imageOffset.x;
      const oy = imageOffset.y;
      const iw = image.width;
      const ih = image.height;

      const dataUrl = stage.toDataURL({
        x: ox * s, y: oy * s,
        width: iw * s, height: ih * s,
        pixelRatio: 1 / s,
        mimeType: 'image/jpeg',
        quality: 0.92,
      });
      const base64Data = dataUrl.split(',')[1];
      const savePath = getSavePath(path).replace(/\.[^.]+$/, '.jpg');
      await invoke('save_image_base64', { path: savePath, base64Data });
      setSaveMsg('저장 완료!');
      setTimeout(() => { setSaveMsg(null); }, 1500);
    } catch (e) {
      console.error('저장 실패:', e);
      setSaveMsg('저장 실패');
      setTimeout(() => { setSaveMsg(null); }, 2000);
    } finally {
      setSaving(false);
    }
  }, [image, imageOffset, path, scale]);

  // 텍스트 정렬 상태
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

  // 줌 입력 핸들러
  const handleZoomInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = parseInt(zoomInput, 10);
      if (!isNaN(val) && val > 0) zoomTo(val);
      rootRef.current?.focus();
    }
  };

  const zoomBtnStyle: React.CSSProperties = {
    width: 24, height: 24, borderRadius: 4, border: 'none', cursor: 'pointer',
    backgroundColor: themeVars?.surface2 ?? '#252540', color: themeVars?.text ?? '#e5e7eb',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDownCapture={handleKeyDown}
      onKeyUpCapture={handleKeyUp}
      // #1: 캔버스 클릭 후 포커스 복원 — 단축키 동작 보장
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) {
          setTimeout(() => rootRef.current?.focus(), 0);
        }
      }}
      className="fixed inset-0 flex items-center justify-center outline-none"
      style={{ zIndex: 10001, backgroundColor: 'rgba(0,0,0,0.6)' }}
    >
      <div className="flex rounded-lg overflow-hidden shadow-2xl"
        style={{
          width: '90vw', height: '90vh',
          backgroundColor: themeVars?.bg ?? '#0f172a',
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
        }}>

        <Toolbar
          activeTool={editorState.activeTool}
          setActiveTool={(t) => { editorState.setActiveTool(t); rootRef.current?.focus(); }}
          onReset={handleReset}
          onSave={handleSave}
          themeVars={themeVars}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={() => { history.undo(); rootRef.current?.focus(); }}
          onRedo={() => { history.redo(); rootRef.current?.focus(); }}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <div ref={containerRef}
            className="flex-1 overflow-auto flex items-center justify-center relative"
            style={{ backgroundColor: themeVars?.surface ?? '#1e293b' }}>

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

            {/* 저장 피드백 메시지 */}
            {saveMsg && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2" style={{ zIndex: 10 }}>
                <div style={{
                  padding: '6px 16px', borderRadius: 6, fontSize: 13,
                  backgroundColor: saveMsg.includes('완료') ? '#22c55e' : saveMsg.includes('실패') ? '#ef4444' : (themeVars?.surface2 ?? '#333'),
                  color: '#fff',
                }}>
                  {saveMsg}
                </div>
              </div>
            )}

            {/* 줌 컨트롤 */}
            <div className="absolute top-4 right-4 flex items-center gap-1" style={{ zIndex: 10 }}>
              <button onClick={zoomOut} title="축소 (Ctrl+-)" style={zoomBtnStyle}>
                <ZoomOut size={13} />
              </button>
              <input
                value={zoomInput}
                onChange={e => setZoomInput(e.target.value)}
                onKeyDown={handleZoomInputKeyDown}
                onBlur={() => { const v = parseInt(zoomInput, 10); if (!isNaN(v) && v > 0) zoomTo(v); }}
                style={{
                  width: 48, height: 24, textAlign: 'center', fontSize: 11, borderRadius: 4,
                  border: `1px solid ${themeVars?.border ?? '#444'}`,
                  backgroundColor: themeVars?.surface2 ?? '#252540',
                  color: themeVars?.text ?? '#e5e7eb', outline: 'none',
                }}
              />
              <span style={{ color: themeVars?.muted ?? '#888', fontSize: 10 }}>%</span>
              <button onClick={zoomIn} title="확대 (Ctrl+=)" style={zoomBtnStyle}>
                <ZoomIn size={13} />
              </button>
              <button onClick={zoomFit} title="화면에 맞춤" style={zoomBtnStyle}>
                <Maximize size={13} />
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
