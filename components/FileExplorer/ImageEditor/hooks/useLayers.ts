import { useState, useCallback } from 'react';
import { Layer, EditorElement } from '../types';

function createDefaultLayer(): Layer {
  return { id: crypto.randomUUID(), name: '레이어 1', visible: true, locked: false, elements: [] };
}

export function useLayers() {
  const [layers, setLayers] = useState<Layer[]>([createDefaultLayer()]);
  const [activeLayerId, setActiveLayerId] = useState(layers[0].id);

  const addLayer = useCallback(() => {
    const newLayer: Layer = {
      id: crypto.randomUUID(),
      name: `레이어 ${layers.length + 1}`,
      visible: true,
      locked: false,
      elements: [],
    };
    setLayers(prev => [...prev, newLayer]);
    setActiveLayerId(newLayer.id);
  }, [layers.length]);

  const removeLayer = useCallback((layerId: string) => {
    setLayers(prev => {
      if (prev.length <= 1) return prev;
      const filtered = prev.filter(l => l.id !== layerId);
      if (activeLayerId === layerId) setActiveLayerId(filtered[0].id);
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

  // 요소 추가 (활성 레이어에 — layerId 자동 설정)
  const addElement = useCallback((element: EditorElement) => {
    const el = { ...element, layerId: activeLayerId };
    setLayers(prev => prev.map(l =>
      l.id === activeLayerId ? { ...l, elements: [...l.elements, el] } : l
    ));
  }, [activeLayerId]);

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
    addLayer, removeLayer, toggleLayerVisibility, toggleLayerLock, renameLayer,
    addElement, updateElement, removeElement,
    restoreLayers, getSnapshot,
  };
}
