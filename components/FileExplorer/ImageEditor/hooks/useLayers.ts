import { useState, useCallback } from 'react';
import { Layer, EditorElement } from '../types';

/** 요소 타입에 따른 레이어 이름 */
const TOOL_NAMES: Record<string, string> = {
  rect: '사각형',
  circle: '원',
  arrow: '화살표',
  text: '텍스트',
  draw: '펜',
};

function createDefaultLayer(): Layer {
  return { id: crypto.randomUUID(), name: '레이어 1', visible: true, locked: false, elements: [] };
}

export function useLayers() {
  const [layers, setLayers] = useState<Layer[]>([createDefaultLayer()]);
  const [activeLayerId, setActiveLayerId] = useState(layers[0].id);

  // 레이어 추가
  const addLayer = useCallback((name?: string) => {
    const newLayer: Layer = {
      id: crypto.randomUUID(),
      name: name ?? `레이어 ${layers.length + 1}`,
      visible: true,
      locked: false,
      elements: [],
    };
    setLayers(prev => [...prev, newLayer]);
    setActiveLayerId(newLayer.id);
    return newLayer.id;
  }, [layers.length]);

  // 레이어 삭제 (최소 1개 유지)
  const removeLayer = useCallback((layerId: string) => {
    setLayers(prev => {
      if (prev.length <= 1) return prev;
      const filtered = prev.filter(l => l.id !== layerId);
      if (activeLayerId === layerId) setActiveLayerId(filtered[filtered.length - 1].id);
      return filtered;
    });
  }, [activeLayerId]);

  // 활성 레이어 삭제 (Delete/Backspace용)
  const removeActiveLayer = useCallback(() => {
    setLayers(prev => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex(l => l.id === activeLayerId);
      const filtered = prev.filter(l => l.id !== activeLayerId);
      // 삭제 후 이전 레이어 또는 마지막 레이어 활성화
      const newIdx = Math.min(idx, filtered.length - 1);
      setActiveLayerId(filtered[newIdx].id);
      return filtered;
    });
  }, [activeLayerId]);

  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, visible: !l.visible } : l));
  }, []);

  const toggleLayerLock = useCallback((layerId: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, locked: !l.locked } : l));
  }, []);

  const renameLayer = useCallback((layerId: string, name: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, name } : l));
  }, []);

  // 요소 추가 — 새 레이어를 자동 생성하여 요소 배치 (#8)
  const addElement = useCallback((element: EditorElement) => {
    const toolName = TOOL_NAMES[element.type] ?? element.type;
    const newLayer: Layer = {
      id: crypto.randomUUID(),
      name: toolName,
      visible: true,
      locked: false,
      elements: [{ ...element, layerId: '' }], // layerId는 레이어 내부이므로 빈값
    };
    newLayer.elements[0].layerId = newLayer.id;
    setLayers(prev => [...prev, newLayer]);
    setActiveLayerId(newLayer.id);
  }, []);

  const updateElement = useCallback((elementId: string, updates: Partial<EditorElement>) => {
    setLayers(prev => prev.map(l => ({
      ...l,
      elements: l.elements.map(el =>
        el.id === elementId ? { ...el, ...updates } as EditorElement : el
      ),
    })));
  }, []);

  const removeElement = useCallback((elementId: string) => {
    setLayers(prev => prev.map(l => ({
      ...l,
      elements: l.elements.filter(el => el.id !== elementId),
    })));
  }, []);

  const restoreLayers = useCallback((snapshot: Layer[]) => {
    setLayers(snapshot);
  }, []);

  const getSnapshot = useCallback(() => {
    return JSON.parse(JSON.stringify(layers)) as Layer[];
  }, [layers]);

  return {
    layers, setLayers, activeLayerId, setActiveLayerId,
    addLayer, removeLayer, removeActiveLayer,
    toggleLayerVisibility, toggleLayerLock, renameLayer,
    addElement, updateElement, removeElement,
    restoreLayers, getSnapshot,
  };
}
