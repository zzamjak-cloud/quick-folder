import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import EditorCanvas, { EditorCanvasRef } from './EditorCanvas';
import Toolbar from './panels/Toolbar';
import PropertyPanel from './panels/PropertyPanel';
import LayerPanel from './panels/LayerPanel';
import { ImageEditorProps, EditorElement } from './types';
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

export default function ImageEditor({ path, themeVars, onClose }: ImageEditorProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 1600, height: 1200 });
  const [imageOffset] = useState({ x: WORKSPACE_MARGIN, y: WORKSPACE_MARGIN });
  const [scale, setScale] = useState(1);
  const [zoomInput, setZoomInput] = useState('100');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<EditorCanvasRef>(null);

  // 에디터 상태 — useState를 직접 사용 (커스텀 훅 안 거침)
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [strokeColor, setStrokeColor] = useState('#ff0000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fontSize, setFontSize] = useState(20);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const layerMgr = useLayers();
  const history = useHistory(layerMgr.restoreLayers, layerMgr.getSnapshot);
  const cropMode = useCropMode();

  const prevToolRef = useRef<ToolType | null>(null);
  const fitScaleRef = useRef(1);

  // 줌 동기화
  useEffect(() => { setZoomInput(String(Math.round(scale * 100))); }, [scale]);

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

  const zoomTo = useCallback((pct: number) => setScale(Math.max(0.1, Math.min(3, pct / 100))), []);
  const zoomIn = useCallback(() => setScale(s => Math.min(3, +(s + 0.1).toFixed(1))), []);
  const zoomOut = useCallback(() => setScale(s => Math.max(0.1, +(s - 0.1).toFixed(1))), []);
  const zoomFit = useCallback(() => setScale(fitScaleRef.current), []);

  // 크롭 모드
  useEffect(() => {
    if (activeTool === 'crop' && !cropMode.isCropping && image) {
      cropMode.startCrop(imageOffset.x, imageOffset.y, image.width, image.height);
    } else if (activeTool !== 'crop' && cropMode.isCropping) {
      cropMode.cancelCrop();
    }
  }, [activeTool, image]);

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
    setActiveTool('select');
    fitToContainer(sw, sh);
  }, [cropMode.cropRect, image, scale, history, layerMgr, fitToContainer]);

  // ============================================================
  // #1: 키보드 — window.addEventListener, setState를 직접 호출
  // ============================================================
  useEffect(() => {
    // 클로저가 아닌, 함수형 업데이트로 최신 상태 접근
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
          e.stopImmediatePropagation();
        }
        return;
      }

      e.stopImmediatePropagation();

      if (e.key === 'Escape') { onClose(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); history.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); history.redo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) { e.preventDefault(); zoomOut(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); return; }

      // Ctrl 키 자체 → 임시 선택 도구
      if (e.key === 'Control' || e.key === 'Meta') {
        if (!prevToolRef.current) {
          // 함수형 업데이트로 현재 activeTool 읽기
          setActiveTool(cur => { prevToolRef.current = cur; return 'select'; });
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        history.pushSnapshot();
        layerMgr.removeActiveLayer();
        return;
      }
      if (e.key === '[') { setStrokeWidth(w => Math.max(1, w - 1)); return; }
      if (e.key === ']') { setStrokeWidth(w => Math.min(50, w + 1)); return; }

      // 도구 단축키 — setState 직접 호출
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const tool = TOOL_KEYS[e.key.toLowerCase()];
        if (tool) {
          prevToolRef.current = null;
          setActiveTool(tool);  // useState setter 직접 호출
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      e.stopImmediatePropagation();
      if (e.key === 'Control' || e.key === 'Meta') {
        if (prevToolRef.current) {
          setActiveTool(prevToolRef.current);
          prevToolRef.current = null;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
    // setActiveTool, setStrokeWidth는 useState setter (stable)
    // history, layerMgr는 매 렌더 새 객체이지만 내부 메서드는 useCallback
    // onClose는 prop
    // zoomIn, zoomOut은 useCallback (stable)
  }, [onClose, history.undo, history.redo, history.pushSnapshot,
      layerMgr.removeActiveLayer, zoomIn, zoomOut]);

  const handleReset = useCallback(() => {
    history.pushSnapshot();
    layerMgr.setLayers([{
      id: crypto.randomUUID(), name: '레이어 1',
      visible: true, locked: false, elements: [],
    }]);
  }, [history, layerMgr]);

  // #2: 저장 — 레이어 포함 전체 영역 + #4: 캔버스 테마 컬러 배경
  const handleSave = useCallback(async () => {
    const stage = canvasRef.current?.getStage();
    if (!stage || !image) return;
    setSaving(true);
    setSaveMsg('저장 중...');
    const s = scale;
    try {
      // 이미지 영역 + 모든 요소 바운딩 박스 계산
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
        mimeType: 'image/jpeg',
        quality: 0.92,
      });
      const base64Data = dataUrl.split(',')[1];
      const savePath = getSavePath(path).replace(/\.[^.]+$/, '.jpg');

      // #3: invoke를 await — 파일 쓰기 완료까지 대기
      await invoke('save_image_base64', { path: savePath, base64Data });

      setSaveMsg('저장 완료!');
      setTimeout(() => setSaveMsg(null), 1500);
    } catch (e) {
      console.error('저장 실패:', e);
      setSaveMsg('저장 실패');
      setTimeout(() => setSaveMsg(null), 2000);
    } finally {
      setSaving(false);
    }
  }, [image, imageOffset, path, scale, layerMgr.layers]);

  // 텍스트 정렬
  const selectedTextAlign = useMemo(() => {
    if (!selectedElementId) return null;
    for (const layer of layerMgr.layers) {
      for (const el of layer.elements) {
        if (el.id === selectedElementId && el.type === 'text') return el.align ?? 'left';
      }
    }
    return null;
  }, [selectedElementId, layerMgr.layers]);

  const handleTextAlignChange = useCallback((align: 'left' | 'center' | 'right') => {
    if (!selectedElementId) return;
    history.pushSnapshot();
    layerMgr.updateElement(selectedElementId, { align } as Partial<EditorElement>);
  }, [selectedElementId, history, layerMgr]);

  const handleZoomInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation(); // 도구 단축키 방지
    if (e.key === 'Enter') {
      const val = parseInt(zoomInput, 10);
      if (!isNaN(val) && val > 0) zoomTo(val);
    }
  };

  const zoomBtnStyle: React.CSSProperties = {
    width: 24, height: 24, borderRadius: 4, border: 'none', cursor: 'pointer',
    backgroundColor: themeVars?.surface2 ?? '#252540', color: themeVars?.text ?? '#e5e7eb',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  // 캔버스 배경색 (테마)
  const canvasBg = themeVars?.surface ?? '#1e293b';

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
          activeTool={activeTool}
          setActiveTool={setActiveTool}
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
            style={{ backgroundColor: canvasBg }}>

            {/* 저장 피드백 */}
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

            {/* 크롭 버튼 */}
            {cropMode.isCropping && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2" style={{ zIndex: 10 }}>
                <button onClick={applyCrop}
                  style={{ padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    backgroundColor: themeVars?.accent ?? '#3b82f6', color: '#fff', fontSize: 13 }}>
                  적용
                </button>
                <button onClick={() => { cropMode.cancelCrop(); setActiveTool('select'); }}
                  style={{ padding: '6px 16px', borderRadius: 6, border: `1px solid ${themeVars?.border ?? '#444'}`,
                    cursor: 'pointer', backgroundColor: 'transparent', color: themeVars?.text ?? '#e5e7eb', fontSize: 13 }}>
                  취소
                </button>
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
                activeTool={activeTool}
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
                fontSize={fontSize}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
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
                canvasBgColor={canvasBg}
              />
            ) : (
              <span style={{ color: themeVars?.muted ?? '#888' }}>이미지 로딩 중...</span>
            )}
          </div>

          <PropertyPanel
            strokeColor={strokeColor}
            setStrokeColor={setStrokeColor}
            strokeWidth={strokeWidth}
            setStrokeWidth={setStrokeWidth}
            fontSize={fontSize}
            setFontSize={setFontSize}
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
