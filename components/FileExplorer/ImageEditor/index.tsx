import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import EditorCanvas, { EditorCanvasRef } from './EditorCanvas';
import Toolbar from './panels/Toolbar';
import { ImageEditorProps, CropRect } from './types';
import { useEditorState } from './hooks/useEditorState';
import { useLayers } from './hooks/useLayers';
import { useHistory } from './hooks/useHistory';
import { loadImageFromPath, loadImageFromBase64, getSavePath } from './utils';

export default function ImageEditor({ path, themeVars, onClose }: ImageEditorProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<EditorCanvasRef>(null);

  const editorState = useEditorState();
  const layerMgr = useLayers();
  const history = useHistory(layerMgr.restoreLayers, layerMgr.getSnapshot);

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

      {/* 캔버스 영역 */}
      <div ref={containerRef} className="flex-1 overflow-hidden flex items-center justify-center"
        style={{ backgroundColor: '#1a1a2e' }}
      >
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
    </div>
  );
}
