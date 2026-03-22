/** 편집 도구 종류 */
export type ToolType = 'select' | 'crop' | 'rect' | 'circle' | 'arrow' | 'text' | 'draw' | 'eraser';

/** 편집 요소 기본 인터페이스 */
export interface BaseElement {
  id: string;
  type: 'rect' | 'circle' | 'arrow' | 'text' | 'draw';
  layerId: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface RectElement extends BaseElement {
  type: 'rect';
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  rotation: number;
}

export interface CircleElement extends BaseElement {
  type: 'circle';
  radiusX: number;
  radiusY: number;
  stroke: string;
  strokeWidth: number;
  rotation: number;
}

export interface ArrowElement extends BaseElement {
  type: 'arrow';
  points: number[];  // [x1, y1, x2, y2]
  stroke: string;
  strokeWidth: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  fill: string;
  width: number;
  rotation: number;
}

export interface DrawElement extends BaseElement {
  type: 'draw';
  points: number[];   // [x1, y1, x2, y2, ...]
  stroke: string;
  strokeWidth: number;
}

export type EditorElement = RectElement | CircleElement | ArrowElement | TextElement | DrawElement;

/** 레이어 */
export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  elements: EditorElement[];
}

/** 편집기 상태 스냅샷 (실행취소용) */
export interface EditorSnapshot {
  layers: Layer[];
}

/** 크롭 영역 */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 편집기 Props */
export interface ImageEditorProps {
  path: string;
  themeVars: import('../../../types').ThemeVars | null;
  onClose: () => void;
}
