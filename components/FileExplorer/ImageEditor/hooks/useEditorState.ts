import { useState, useCallback } from 'react';
import { ToolType } from '../types';

export function useEditorState() {
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [strokeColor, setStrokeColor] = useState('#ff0000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fontSize, setFontSize] = useState(20);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const resetTool = useCallback(() => {
    setActiveTool('select');
    setSelectedElementId(null);
  }, []);

  return {
    activeTool, setActiveTool,
    strokeColor, setStrokeColor,
    strokeWidth, setStrokeWidth,
    fontSize, setFontSize,
    selectedElementId, setSelectedElementId,
    resetTool,
  };
}
