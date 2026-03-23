# 이미지 편집기 + 마크다운 복사 버그 수정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PNG/JPG 파일을 Enter로 열어 이미지 위에 도형·텍스트·드로잉 어노테이션을 추가하고 저장하는 편집기 구현 + 마크다운 복사 시 터미널 먹통 버그 수정

**Architecture:** react-konva (Konva.js) 기반 캔버스 편집기. 레이어별 도형/텍스트/드로잉을 관리하고, 최종 저장 시 캔버스를 이미지로 내보내 `{파일명}_Desc.{확장자}`로 저장. 기존 ModalShell 미사용 — 전체 화면 에디터로 독립 구현 (MarkdownEditor 패턴).

**Tech Stack:** react-konva, konva (캔버스 엔진 + React 바인딩). ID 생성은 `crypto.randomUUID()` 내장 API 사용.

---

## 파일 구조

```
components/FileExplorer/
  ImageEditor/
    index.tsx              - 메인 에디터 컴포넌트 (모달 컨테이너, 툴바, 패널 레이아웃)
    EditorCanvas.tsx        - Konva Stage + 이미지 배경 + 레이어 렌더링
    tools/
      CropTool.tsx          - 크롭 오버레이 (드래그 핸들 4방향)
      ShapeTool.tsx         - 도형 아웃라인 (사각형, 원, 화살표)
      TextTool.tsx          - 텍스트 입력/편집
      DrawTool.tsx          - 프리핸드 드로잉 (펜)
      SelectTool.tsx        - 요소 선택/이동/리사이즈 (Transformer)
    panels/
      Toolbar.tsx           - 좌측 도구 버튼 패널
      LayerPanel.tsx        - 우측 레이어 목록 패널
      PropertyPanel.tsx     - 하단 속성 패널 (색상, 두께)
    hooks/
      useEditorState.ts     - 편집기 전역 상태 (현재 도구, 색상, 두께)
      useLayers.ts          - 레이어 CRUD + 요소 관리
      useHistory.ts         - 실행취소/다시실행 스택
      useCropMode.ts        - 크롭 모드 상태
    types.ts                - 편집기 전용 타입 (EditorElement, Layer, Tool 등)
    utils.ts                - 캔버스 내보내기, 이미지 로딩 유틸
```

## 주요 의존성

| 패키지 | 용도 |
|--------|------|
| `konva` | 캔버스 엔진 |
| `react-konva` | React 바인딩 |

---

## Task 0: 마크다운 복사 버그 수정

**Files:**
- Modify: `components/FileExplorer/MarkdownEditor.tsx:295-306`

**문제:** turndown이 HTML→마크다운 변환 시 제어 문자(zero-width space, null byte 등)를 보존하여 터미널에 붙여넣기 시 먹통 발생.

- [ ] **Step 1: 복사 버튼의 turndown 출력 정제 코드 추가**

`MarkdownEditor.tsx`의 복사 버튼 onClick 핸들러 (줄 296-306)에서 `turndown.turndown(html)` 결과를 정제:

```tsx
onClick={async () => {
  if (!editor) return;
  const html = editor.getHTML();
  let md = turndown.turndown(html);
  // 제어 문자 제거 (탭, 개행 제외) — 터미널 먹통 방지
  md = md.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // zero-width 유니코드 제거
  md = md.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
  try {
    await navigator.clipboard.writeText(md);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1500);
  } catch (e) {
    console.error('복사 실패:', e);
  }
}}
```

- [ ] **Step 2: 자동저장의 turndown 출력에도 동일 정제 적용**

`MarkdownEditor.tsx` 줄 96 부근의 `saveContent` 함수에서도 동일 정제:

```tsx
const md = turndown.turndown(html);
const cleaned = md.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
                  .replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
```

> **참고:** 저장 시에도 정제하여 파일 자체에 제어 문자가 남지 않도록 함.

- [ ] **Step 3: 개발 서버에서 .md 파일 열고 복사 → 터미널 붙여넣기 테스트**

Run: `npm run tauri dev`
검증: .md 파일 열기 → 텍스트 입력 → 복사 버튼 클릭 → 터미널에 붙여넣기 → 정상 출력 확인

- [ ] **Step 4: 커밋**

```bash
git add components/FileExplorer/MarkdownEditor.tsx
git commit -m "fix: 마크다운 복사 시 제어 문자 제거 — 터미널 먹통 방지"
```

---

## Task 1: 의존성 설치 + 타입 정의

**Files:**
- Modify: `package.json`
- Create: `components/FileExplorer/ImageEditor/types.ts`

- [ ] **Step 1: react-konva 및 관련 패키지 설치**

```bash
npm install konva react-konva
```

- [ ] **Step 2: 이미지 편집기 전용 타입 파일 생성**

`components/FileExplorer/ImageEditor/types.ts`:

```typescript
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
```

- [ ] **Step 3: 커밋**

```bash
git add package.json package-lock.json components/FileExplorer/ImageEditor/types.ts
git commit -m "feat: 이미지 편집기 의존성 설치 + 타입 정의"
```

---

## Task 2: 편집기 상태 훅 — useEditorState, useLayers, useHistory

**Files:**
- Create: `components/FileExplorer/ImageEditor/hooks/useEditorState.ts`
- Create: `components/FileExplorer/ImageEditor/hooks/useLayers.ts`
- Create: `components/FileExplorer/ImageEditor/hooks/useHistory.ts`

- [ ] **Step 1: useEditorState 훅 생성**

편집기 전역 상태 관리 (현재 도구, 색상, 두께, 선택 요소 등):

```typescript
// hooks/useEditorState.ts
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
```

- [ ] **Step 2: useLayers 훅 생성**

레이어 CRUD + 요소 추가/삭제/수정:

```typescript
// hooks/useLayers.ts
import { useState, useCallback } from 'react';
import { Layer, EditorElement } from '../types';

function createDefaultLayer(): Layer {
  return { id: crypto.randomUUID(), name: '레이어 1', visible: true, locked: false, elements: [] };
}

export function useLayers() {
  const [layers, setLayers] = useState<Layer[]>([createDefaultLayer()]);
  const [activeLayerId, setActiveLayerId] = useState(layers[0].id);

  // 레이어 추가
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

  // 레이어 삭제 (최소 1개 유지)
  const removeLayer = useCallback((layerId: string) => {
    setLayers(prev => {
      if (prev.length <= 1) return prev;
      const filtered = prev.filter(l => l.id !== layerId);
      if (activeLayerId === layerId) setActiveLayerId(filtered[0].id);
      return filtered;
    });
  }, [activeLayerId]);

  // 레이어 표시/숨기기 토글
  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, visible: !l.visible } : l));
  }, []);

  // 레이어 잠금 토글
  const toggleLayerLock = useCallback((layerId: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, locked: !l.locked } : l));
  }, []);

  // 레이어 이름 변경
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

  // 요소 수정
  const updateElement = useCallback((elementId: string, updates: Partial<EditorElement>) => {
    setLayers(prev => prev.map(l => ({
      ...l,
      elements: l.elements.map(el =>
        el.id === elementId ? { ...el, ...updates } as EditorElement : el
      ),
    })));
  }, []);

  // 요소 삭제
  const removeElement = useCallback((elementId: string) => {
    setLayers(prev => prev.map(l => ({
      ...l,
      elements: l.elements.filter(el => el.id !== elementId),
    })));
  }, []);

  // 전체 레이어 복원 (실행취소용)
  const restoreLayers = useCallback((snapshot: Layer[]) => {
    setLayers(snapshot);
  }, []);

  // 스냅샷 생성
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
```

- [ ] **Step 3: useHistory 훅 생성**

실행취소/다시실행 스택:

```typescript
// hooks/useHistory.ts
import { useState, useCallback, useRef } from 'react';
import { Layer } from '../types';

const MAX_HISTORY = 50;

export function useHistory(restoreLayers: (s: Layer[]) => void, getSnapshot: () => Layer[]) {
  const undoStack = useRef<Layer[][]>([]);
  const redoStack = useRef<Layer[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // 변경 전에 호출 — 현재 상태를 undo 스택에 저장
  const pushSnapshot = useCallback(() => {
    const snapshot = getSnapshot();
    undoStack.current.push(snapshot);
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [getSnapshot]);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const current = getSnapshot();
    redoStack.current.push(current);
    const prev = undoStack.current.pop()!;
    restoreLayers(prev);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  }, [getSnapshot, restoreLayers]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const current = getSnapshot();
    undoStack.current.push(current);
    const next = redoStack.current.pop()!;
    restoreLayers(next);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  }, [getSnapshot, restoreLayers]);

  return { pushSnapshot, undo, redo, canUndo, canRedo };
}
```

- [ ] **Step 4: 커밋**

```bash
git add components/FileExplorer/ImageEditor/hooks/
git commit -m "feat: 이미지 편집기 상태 훅 — useEditorState, useLayers, useHistory"
```

---

## Task 3: 메인 에디터 셸 + 이미지 캔버스

**Files:**
- Create: `components/FileExplorer/ImageEditor/index.tsx`
- Create: `components/FileExplorer/ImageEditor/EditorCanvas.tsx`
- Create: `components/FileExplorer/ImageEditor/utils.ts`
- Create: `components/FileExplorer/ImageEditor/panels/Toolbar.tsx`

- [ ] **Step 1: utils.ts 생성 — 이미지 로딩 + 캔버스 내보내기 유틸**

```typescript
// ImageEditor/utils.ts
import { invoke } from '@tauri-apps/api/core';

/** base64 이미지 데이터를 HTMLImageElement로 로딩 */
export function loadImageFromBase64(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = base64;
  });
}

/** 파일 경로에서 base64 이미지 데이터 가져오기 (원본 품질 유지를 위해 별도 커맨드 사용) */
export async function loadImageFromPath(path: string): Promise<string> {
  // read_image_base64는 원본 이미지를 base64 data URI로 반환 (Task 4에서 추가)
  const base64: string = await invoke('read_image_base64', { path });
  return base64;
}

/** 저장 경로 생성: {원본경로}/{파일명}_Desc.{확장자} */
export function getSavePath(originalPath: string): string {
  const sep = originalPath.includes('\\') ? '\\' : '/';
  const parts = originalPath.split(sep);
  const fileName = parts.pop()!;
  const dotIdx = fileName.lastIndexOf('.');
  const name = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName;
  const ext = dotIdx > 0 ? fileName.slice(dotIdx) : '.png';
  parts.push(`${name}_Desc${ext}`);
  return parts.join(sep);
}
```

- [ ] **Step 2: Toolbar.tsx 생성 — 좌측 도구 버튼 패널**

```tsx
// ImageEditor/panels/Toolbar.tsx
import React from 'react';
import {
  MousePointer2, Crop, Square, Circle, ArrowRight,
  Type, Pencil, Eraser, RotateCcw, Save
} from 'lucide-react';
import { ToolType } from '../types';
import { ThemeVars } from '../../../../types';

interface ToolbarProps {
  activeTool: ToolType;
  setActiveTool: (t: ToolType) => void;
  onReset: () => void;
  onSave: () => void;
  themeVars: ThemeVars | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const tools: { type: ToolType; icon: React.ElementType; label: string }[] = [
  { type: 'select', icon: MousePointer2, label: '선택' },
  { type: 'crop', icon: Crop, label: '크롭' },
  { type: 'rect', icon: Square, label: '사각형' },
  { type: 'circle', icon: Circle, label: '원' },
  { type: 'arrow', icon: ArrowRight, label: '화살표' },
  { type: 'text', icon: Type, label: '텍스트' },
  { type: 'draw', icon: Pencil, label: '펜' },
  { type: 'eraser', icon: Eraser, label: '지우개' },
];

export default function Toolbar({
  activeTool, setActiveTool, onReset, onSave, themeVars,
  canUndo, canRedo, onUndo, onRedo,
}: ToolbarProps) {
  const btnStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, borderRadius: 6, border: 'none', cursor: 'pointer',
    backgroundColor: active ? (themeVars?.accent ?? '#3b82f6') : 'transparent',
    color: active ? '#fff' : (themeVars?.text ?? '#e5e7eb'),
  });

  return (
    <div
      className="flex flex-col gap-1 p-2 shrink-0"
      style={{
        backgroundColor: themeVars?.surface2 ?? '#1e293b',
        borderRight: `1px solid ${themeVars?.border ?? '#334155'}`,
      }}
    >
      {tools.map(({ type, icon: Icon, label }) => (
        <button
          key={type}
          style={btnStyle(activeTool === type)}
          onClick={() => setActiveTool(type)}
          title={label}
        >
          <Icon size={18} />
        </button>
      ))}

      <div style={{ height: 1, backgroundColor: themeVars?.border ?? '#334155', margin: '4px 0' }} />

      <button style={btnStyle(false)} onClick={onUndo} disabled={!canUndo} title="실행취소 (Ctrl+Z)">
        <RotateCcw size={16} />
      </button>

      <div style={{ flex: 1 }} />

      <button style={btnStyle(false)} onClick={onReset} title="원본으로 초기화">
        <RotateCcw size={18} style={{ color: '#f59e0b' }} />
      </button>
      <button style={btnStyle(false)} onClick={onSave} title="저장 (_Desc)">
        <Save size={18} style={{ color: '#22c55e' }} />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: EditorCanvas.tsx 생성 — Konva Stage + 배경 이미지**

```tsx
// ImageEditor/EditorCanvas.tsx
import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Stage, Layer as KonvaLayer, Image as KonvaImage, Rect, Ellipse, Arrow, Text, Line, Transformer } from 'react-konva';
import Konva from 'konva';
import { Layer, EditorElement, ToolType, CropRect } from './types';

interface EditorCanvasProps {
  image: HTMLImageElement | null;
  layers: Layer[];
  activeTool: ToolType;
  strokeColor: string;
  strokeWidth: number;
  fontSize: number;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onAddElement: (el: EditorElement) => void;
  onUpdateElement: (id: string, updates: Partial<EditorElement>) => void;
  onRemoveElement: (id: string) => void;
  onPushSnapshot: () => void;
  cropRect: CropRect | null;
  onCropChange: (rect: CropRect) => void;
  stageWidth: number;
  stageHeight: number;
  scale: number;
}

export interface EditorCanvasRef {
  getStage: () => Konva.Stage | null;
}

// 이 컴포넌트는 Task 4~8에서 도구별 상호작용 로직을 점진적으로 추가함
const EditorCanvas = forwardRef<EditorCanvasRef, EditorCanvasProps>(
  function EditorCanvas(props, ref) {
    const stageRef = useRef<Konva.Stage>(null);
    const transformerRef = useRef<Konva.Transformer>(null);

    useImperativeHandle(ref, () => ({
      getStage: () => stageRef.current,
    }));

    // 선택 요소 변경 시 Transformer 업데이트
    useEffect(() => {
      if (!transformerRef.current || !stageRef.current) return;
      if (props.activeTool !== 'select' || !props.selectedElementId) {
        transformerRef.current.nodes([]);
        return;
      }
      const node = stageRef.current.findOne(`#${props.selectedElementId}`);
      if (node) transformerRef.current.nodes([node]);
      else transformerRef.current.nodes([]);
    }, [props.selectedElementId, props.activeTool]);

    // 요소 렌더링 함수
    const renderElement = (el: EditorElement) => {
      const commonProps = {
        id: el.id,
        key: el.id,
        x: el.x,
        y: el.y,
        draggable: props.activeTool === 'select',
        onClick: () => {
          if (props.activeTool === 'eraser') {
            props.onPushSnapshot();
            props.onRemoveElement(el.id);
          } else {
            props.onSelectElement(el.id);
          }
        },
        onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
          props.onPushSnapshot();
          props.onUpdateElement(el.id, { x: e.target.x(), y: e.target.y() });
        },
      };

      switch (el.type) {
        case 'rect':
          return <Rect {...commonProps} width={el.width} height={el.height}
            stroke={el.stroke} strokeWidth={el.strokeWidth} rotation={el.rotation} />;
        case 'circle':
          return <Ellipse {...commonProps} radiusX={el.radiusX} radiusY={el.radiusY}
            stroke={el.stroke} strokeWidth={el.strokeWidth} rotation={el.rotation} />;
        case 'arrow':
          return <Arrow {...commonProps} points={el.points}
            stroke={el.stroke} strokeWidth={el.strokeWidth} fill={el.stroke} />;
        case 'text':
          return <Text {...commonProps} text={el.text} fontSize={el.fontSize}
            fill={el.fill} width={el.width} rotation={el.rotation} />;
        case 'draw':
          return <Line {...commonProps} points={el.points}
            stroke={el.stroke} strokeWidth={el.strokeWidth}
            lineCap="round" lineJoin="round" tension={0.5} />;
      }
    };

    return (
      <Stage
        ref={stageRef}
        width={props.stageWidth}
        height={props.stageHeight}
        scaleX={props.scale}
        scaleY={props.scale}
        // 마우스 이벤트는 Task 4~8에서 도구별로 추가
      >
        {/* 배경 이미지 레이어 */}
        <KonvaLayer>
          {props.image && <KonvaImage image={props.image} />}
        </KonvaLayer>

        {/* 편집 레이어들 */}
        {props.layers.filter(l => l.visible).map(layer => (
          <KonvaLayer key={layer.id}>
            {layer.elements.filter(el => el.visible).map(renderElement)}
          </KonvaLayer>
        ))}

        {/* Transformer 레이어 (선택 도구용) */}
        <KonvaLayer>
          <Transformer ref={transformerRef} />
        </KonvaLayer>
      </Stage>
    );
  }
);

export default EditorCanvas;
```

- [ ] **Step 4: index.tsx 생성 — 메인 에디터 셸 (이미지 로딩 + 레이아웃)**

```tsx
// ImageEditor/index.tsx
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

      {/* 우측 패널 영역 — Task 9에서 LayerPanel 추가 */}
    </div>
  );
}
```

- [ ] **Step 5: 빌드 확인**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: 커밋**

```bash
git add components/FileExplorer/ImageEditor/
git commit -m "feat: 이미지 편집기 셸 — 이미지 로딩, 캔버스, 툴바 레이아웃"
```

---

## Task 4: Rust 백엔드 — read_image_base64 + save_image_base64 커맨드

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: read_image_base64 Rust 커맨드 추가**

`lib.rs`에 이미지 파일을 원본 품질로 base64 data URI로 읽는 커맨드 추가.
기존 `get_file_thumbnail`은 리사이즈+PNG 재인코딩하므로 원본 품질이 손실됨. 편집기용으로 원본 그대로 읽는 커맨드가 필요:

```rust
#[tauri::command]
async fn read_image_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = std::fs::read(&path).map_err(|e| format!("이미지 읽기 실패: {}", e))?;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "gif" => "image/gif",
        _ => "image/png",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}
```

- [ ] **Step 2: save_image_base64 Rust 커맨드 추가**

```rust
#[tauri::command]
async fn save_image_base64(path: String, base64_data: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Base64 디코딩 실패: {}", e))?;
    std::fs::write(&path, &bytes).map_err(|e| format!("이미지 저장 실패: {}", e))
}
```

- [ ] **Step 3: invoke_handler에 두 커맨드 등록**

`lib.rs`의 `.invoke_handler(tauri::generate_handler![...])` 목록에 `read_image_base64`, `save_image_base64` 추가.

- [ ] **Step 4: 커밋**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: read_image_base64 + save_image_base64 Rust 커맨드"
```

---

## Task 5: FileExplorer 통합 — Enter 키로 이미지 편집기 열기

**Files:**
- Modify: `components/FileExplorer/hooks/useModalStates.ts` (imageEditorPath 상태 추가)
- Modify: `components/FileExplorer/hooks/useKeyboardShortcuts.ts` (Enter 키에 이미지 분기 추가)
- Modify: `components/FileExplorer/index.tsx` (ImageEditor 렌더링 + openEntry 분기)

- [ ] **Step 1: useModalStates에 imageEditorPath 상태 추가**

```typescript
// useModalStates.ts에 추가
const [imageEditorPath, setImageEditorPath] = useState<string | null>(null);
// return 객체에 추가: imageEditorPath, setImageEditorPath
```

- [ ] **Step 2: useKeyboardShortcuts.ts Enter 키 분기에 이미지 조건 추가**

줄 253 및 266 부근의 `.md` 분기 앞에 이미지 확장자 분기 추가:

```typescript
// 이미지 파일이면 편집기로 열기
const imageExts = /\.(png|jpe?g|webp|bmp|gif)$/i;
if (!entry.is_dir && imageExts.test(entry.name)) {
  setImageEditorPath(entry.path);
} else if (!entry.is_dir && /\.md$/i.test(entry.name)) {
  setMarkdownEditorPath(entry.path);
} else {
  openEntry(entry);
}
```

> 컬럼 뷰(줄 250)와 일반 뷰(줄 261) 양쪽 모두 동일 분기 적용.

- [ ] **Step 3: index.tsx에 ImageEditor import + 렌더링 추가**

```tsx
// import 추가
import ImageEditor from './ImageEditor';

// JSX에 추가 (MarkdownEditor 렌더링 근처, 줄 1265 부근)
{modals.imageEditorPath && (
  <ImageEditor
    path={modals.imageEditorPath}
    themeVars={themeVars}
    onClose={() => modals.setImageEditorPath(null)}
  />
)}
```

- [ ] **Step 4: useKeyboardShortcuts 호출부에 setImageEditorPath 전달**

`index.tsx`에서 `useKeyboardShortcuts` 호출 시 `setImageEditorPath: modals.setImageEditorPath` 추가.
`useKeyboardShortcuts.ts`의 파라미터 타입에도 해당 속성 추가.

- [ ] **Step 5: 빌드 확인 + 개발 서버에서 이미지 Enter 테스트**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: 커밋**

```bash
git add components/FileExplorer/hooks/useModalStates.ts components/FileExplorer/hooks/useKeyboardShortcuts.ts components/FileExplorer/index.tsx
git commit -m "feat: Enter 키로 이미지 편집기 열기 — FileExplorer 통합"
```

---

## Task 6: 도형 도구 — 사각형, 원, 화살표

**Files:**
- Modify: `components/FileExplorer/ImageEditor/EditorCanvas.tsx` (마우스 이벤트 추가)

- [ ] **Step 1: EditorCanvas에 도형 그리기 마우스 이벤트 추가**

Stage의 `onMouseDown`, `onMouseMove`, `onMouseUp` 핸들러에 도형 도구 로직 추가:

```typescript
// 드로잉 중인 임시 요소
const [drawingElement, setDrawingElement] = useState<EditorElement | null>(null);

const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
  const pos = e.target.getStage()?.getPointerPosition();
  if (!pos) return;
  const scaledPos = { x: pos.x / props.scale, y: pos.y / props.scale };

  if (props.activeTool === 'select') {
    // 빈 영역 클릭 시 선택 해제
    if (e.target === e.target.getStage()) props.onSelectElement(null);
    return;
  }

  if (['rect', 'circle', 'arrow'].includes(props.activeTool)) {
    props.onPushSnapshot();
    const id = crypto.randomUUID();
    let el: EditorElement;
    if (props.activeTool === 'rect') {
      el = { id, type: 'rect', layerId: 'auto',  // addElement가 activeLayerId로 자동 설정 x: scaledPos.x, y: scaledPos.y,
        width: 0, height: 0, stroke: props.strokeColor, strokeWidth: props.strokeWidth,
        rotation: 0, visible: true };
    } else if (props.activeTool === 'circle') {
      el = { id, type: 'circle', layerId: 'auto',  // addElement가 activeLayerId로 자동 설정 x: scaledPos.x, y: scaledPos.y,
        radiusX: 0, radiusY: 0, stroke: props.strokeColor, strokeWidth: props.strokeWidth,
        rotation: 0, visible: true };
    } else {
      el = { id, type: 'arrow', layerId: 'auto',  // addElement가 activeLayerId로 자동 설정 x: 0, y: 0,
        points: [scaledPos.x, scaledPos.y, scaledPos.x, scaledPos.y],
        stroke: props.strokeColor, strokeWidth: props.strokeWidth, visible: true };
    }
    setDrawingElement(el);
  }
};

const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
  if (!drawingElement) return;
  const pos = e.target.getStage()?.getPointerPosition();
  if (!pos) return;
  const sp = { x: pos.x / props.scale, y: pos.y / props.scale };

  if (drawingElement.type === 'rect') {
    setDrawingElement({ ...drawingElement,
      width: sp.x - drawingElement.x, height: sp.y - drawingElement.y });
  } else if (drawingElement.type === 'circle') {
    setDrawingElement({ ...drawingElement,
      radiusX: Math.abs(sp.x - drawingElement.x),
      radiusY: Math.abs(sp.y - drawingElement.y) });
  } else if (drawingElement.type === 'arrow') {
    const pts = [...drawingElement.points];
    pts[2] = sp.x; pts[3] = sp.y;
    setDrawingElement({ ...drawingElement, points: pts });
  }
};

const handleMouseUp = () => {
  if (drawingElement) {
    props.onAddElement(drawingElement);
    setDrawingElement(null);
  }
};
```

- [ ] **Step 2: Stage에 이벤트 핸들러 연결 + 임시 요소 렌더링**

```tsx
<Stage ref={stageRef} onMouseDown={handleMouseDown}
  onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} ...>
  {/* ... 기존 레이어 ... */}
  {/* 그리기 중인 임시 요소 */}
  <KonvaLayer>
    {drawingElement && renderElement(drawingElement)}
  </KonvaLayer>
</Stage>
```

- [ ] **Step 3: 개발 서버에서 사각형/원/화살표 그리기 테스트**

- [ ] **Step 4: 커밋**

```bash
git add components/FileExplorer/ImageEditor/EditorCanvas.tsx
git commit -m "feat: 도형 도구 — 사각형, 원, 화살표 아웃라인 그리기"
```

---

## Task 7: 텍스트 도구

**Files:**
- Modify: `components/FileExplorer/ImageEditor/EditorCanvas.tsx`

- [ ] **Step 1: 텍스트 도구 — 클릭 시 텍스트 요소 추가**

`handleMouseDown`에 텍스트 도구 분기 추가:

```typescript
if (props.activeTool === 'text') {
  props.onPushSnapshot();
  const id = crypto.randomUUID();
  const el: TextElement = {
    id, type: 'text', layerId: 'auto',  // addElement가 activeLayerId로 자동 설정 x: scaledPos.x, y: scaledPos.y,
    text: '텍스트 입력', fontSize: props.fontSize, fill: props.strokeColor,
    width: 200, rotation: 0, visible: true,
  };
  props.onAddElement(el);
  props.onSelectElement(id);
  return;
}
```

- [ ] **Step 2: 텍스트 더블클릭 시 인라인 편집**

Text 요소의 `onDblClick` 핸들러에서 HTML textarea 오버레이로 편집:

```typescript
// renderElement의 text case에 추가
case 'text':
  return <Text {...commonProps} text={el.text} fontSize={el.fontSize}
    fill={el.fill} width={el.width} rotation={el.rotation}
    onDblClick={() => {
      // Konva 텍스트 인라인 편집 — textarea 오버레이
      const stage = stageRef.current;
      if (!stage) return;
      const textNode = stage.findOne(`#${el.id}`) as Konva.Text;
      if (!textNode) return;
      const textPosition = textNode.absolutePosition();
      const stageBox = stage.container().getBoundingClientRect();
      const textarea = document.createElement('textarea');
      textarea.value = el.text;
      textarea.style.position = 'absolute';
      textarea.style.top = `${stageBox.top + textPosition.y * props.scale}px`;
      textarea.style.left = `${stageBox.left + textPosition.x * props.scale}px`;
      textarea.style.fontSize = `${el.fontSize * props.scale}px`;
      textarea.style.color = el.fill;
      textarea.style.background = 'transparent';
      textarea.style.border = '1px solid #3b82f6';
      textarea.style.outline = 'none';
      textarea.style.resize = 'none';
      textarea.style.zIndex = '99999';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.addEventListener('blur', () => {
        props.onPushSnapshot();
        props.onUpdateElement(el.id, { text: textarea.value });
        document.body.removeChild(textarea);
      });
      textarea.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') textarea.blur();
      });
    }}
  />;
```

- [ ] **Step 3: 커밋**

```bash
git add components/FileExplorer/ImageEditor/EditorCanvas.tsx
git commit -m "feat: 텍스트 도구 — 클릭 추가 + 더블클릭 인라인 편집"
```

---

## Task 8: 펜(드로잉) 도구

**Files:**
- Modify: `components/FileExplorer/ImageEditor/EditorCanvas.tsx`

- [ ] **Step 1: handleMouseDown에 드로잉 도구 분기 추가**

```typescript
if (props.activeTool === 'draw') {
  props.onPushSnapshot();
  const id = crypto.randomUUID();
  const el: DrawElement = {
    id, type: 'draw', layerId: 'auto',  // addElement가 activeLayerId로 자동 설정 x: 0, y: 0,
    points: [scaledPos.x, scaledPos.y],
    stroke: props.strokeColor, strokeWidth: props.strokeWidth, visible: true,
  };
  setDrawingElement(el);
  return;
}
```

- [ ] **Step 2: handleMouseMove에 드로잉 분기 추가**

```typescript
if (drawingElement?.type === 'draw') {
  setDrawingElement({
    ...drawingElement,
    points: [...drawingElement.points, sp.x, sp.y],
  });
}
```

- [ ] **Step 3: 커밋**

```bash
git add components/FileExplorer/ImageEditor/EditorCanvas.tsx
git commit -m "feat: 펜 드로잉 도구 — 프리핸드 그리기"
```

---

## Task 9: 크롭 도구

**Files:**
- Create: `components/FileExplorer/ImageEditor/hooks/useCropMode.ts`
- Modify: `components/FileExplorer/ImageEditor/EditorCanvas.tsx`
- Modify: `components/FileExplorer/ImageEditor/index.tsx`

- [ ] **Step 1: useCropMode 훅 생성**

```typescript
// hooks/useCropMode.ts
import { useState, useCallback } from 'react';
import { CropRect } from '../types';

export function useCropMode(imageWidth: number, imageHeight: number) {
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  const startCrop = useCallback(() => {
    setCropRect({ x: imageWidth * 0.1, y: imageHeight * 0.1,
      width: imageWidth * 0.8, height: imageHeight * 0.8 });
    setIsCropping(true);
  }, [imageWidth, imageHeight]);

  const cancelCrop = useCallback(() => {
    setCropRect(null);
    setIsCropping(false);
  }, []);

  return { cropRect, setCropRect, isCropping, startCrop, cancelCrop };
}
```

- [ ] **Step 2: EditorCanvas에 크롭 오버레이 렌더링**

크롭 모드일 때 어두운 오버레이 + 밝은 크롭 영역 + 드래그 핸들:

```tsx
{/* 크롭 오버레이 */}
{props.cropRect && (
  <KonvaLayer>
    {/* 어두운 마스크 */}
    <Rect x={0} y={0} width={props.stageWidth} height={props.stageHeight}
      fill="rgba(0,0,0,0.5)" listening={false} />
    {/* 밝은 크롭 영역 (구멍) — Group + clipFunc 사용 */}
    <Rect x={props.cropRect.x} y={props.cropRect.y}
      width={props.cropRect.width} height={props.cropRect.height}
      fill="rgba(0,0,0,0)" stroke="#fff" strokeWidth={2}
      draggable
      onDragEnd={(e) => {
        props.onCropChange({ ...props.cropRect!, x: e.target.x(), y: e.target.y() });
      }}
    />
  </KonvaLayer>
)}
```

- [ ] **Step 3: index.tsx에 크롭 적용 버튼 + 이미지 크롭 로직 추가**

크롭 적용 시 캔버스에서 해당 영역만 잘라내어 새 이미지로 교체:

```typescript
const applyCrop = useCallback(async () => {
  if (!cropRect || !canvasRef.current || !image) return;
  const stage = canvasRef.current.getStage();
  if (!stage) return;
  // 크롭 영역 기준으로 캔버스 toDataURL
  const dataUrl = stage.toDataURL({
    x: cropRect.x, y: cropRect.y,
    width: cropRect.width, height: cropRect.height,
    pixelRatio: 1 / scale,
  });
  // 기존 레이어 요소 좌표를 크롭 오프셋만큼 보정
  layerMgr.setLayers(prev => prev.map(l => ({
    ...l,
    elements: l.elements.map(el => ({
      ...el,
      x: el.x - cropRect.x,
      y: el.y - cropRect.y,
    }) as EditorElement),
  })));
  const img = await loadImageFromBase64(dataUrl);
  setImage(img);
  setStageSize({ width: img.width, height: img.height });
  setCropRect(null);
  fitToContainer(img);
}, [cropRect, scale, image, fitToContainer]);
```

- [ ] **Step 4: 커밋**

```bash
git add components/FileExplorer/ImageEditor/hooks/useCropMode.ts components/FileExplorer/ImageEditor/EditorCanvas.tsx components/FileExplorer/ImageEditor/index.tsx
git commit -m "feat: 크롭 도구 — 드래그 영역 선택 + 적용"
```

---

## Task 10: 속성 패널 (색상, 두께, 폰트 크기)

**Files:**
- Create: `components/FileExplorer/ImageEditor/panels/PropertyPanel.tsx`
- Modify: `components/FileExplorer/ImageEditor/index.tsx`

- [ ] **Step 1: PropertyPanel.tsx 생성**

```tsx
// panels/PropertyPanel.tsx
import React from 'react';
import { ThemeVars } from '../../../../types';

interface PropertyPanelProps {
  strokeColor: string;
  setStrokeColor: (c: string) => void;
  strokeWidth: number;
  setStrokeWidth: (w: number) => void;
  fontSize: number;
  setFontSize: (s: number) => void;
  themeVars: ThemeVars | null;
}

const PRESET_COLORS = ['#ff0000', '#ff6600', '#ffcc00', '#00cc00', '#0066ff', '#9933ff', '#ffffff', '#000000'];

export default function PropertyPanel({
  strokeColor, setStrokeColor, strokeWidth, setStrokeWidth,
  fontSize, setFontSize, themeVars,
}: PropertyPanelProps) {
  const labelStyle: React.CSSProperties = {
    color: themeVars?.muted ?? '#888', fontSize: 11, marginBottom: 4,
  };

  return (
    <div
      className="flex items-center gap-4 px-4 py-2 shrink-0"
      style={{
        backgroundColor: themeVars?.surface2 ?? '#1e293b',
        borderTop: `1px solid ${themeVars?.border ?? '#334155'}`,
      }}
    >
      {/* 색상 프리셋 */}
      <div>
        <div style={labelStyle}>색상</div>
        <div className="flex gap-1">
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => setStrokeColor(c)}
              style={{
                width: 20, height: 20, borderRadius: 4, border: strokeColor === c ? '2px solid #fff' : '1px solid #555',
                backgroundColor: c, cursor: 'pointer',
              }}
            />
          ))}
          <input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)}
            style={{ width: 20, height: 20, border: 'none', cursor: 'pointer', padding: 0 }}
          />
        </div>
      </div>

      {/* 두께 */}
      <div>
        <div style={labelStyle}>두께 ({strokeWidth}px)</div>
        <input type="range" min={1} max={20} value={strokeWidth}
          onChange={e => setStrokeWidth(Number(e.target.value))}
          style={{ width: 100 }}
        />
      </div>

      {/* 폰트 크기 */}
      <div>
        <div style={labelStyle}>글자 ({fontSize}px)</div>
        <input type="range" min={10} max={72} value={fontSize}
          onChange={e => setFontSize(Number(e.target.value))}
          style={{ width: 100 }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: index.tsx에 PropertyPanel 렌더링 추가**

캔버스 아래에 PropertyPanel 배치:

```tsx
{/* 캔버스 + 속성패널 감싸는 div */}
<div className="flex-1 flex flex-col overflow-hidden">
  <div ref={containerRef} className="flex-1 overflow-hidden flex items-center justify-center" ...>
    {/* 캔버스 */}
  </div>
  <PropertyPanel
    strokeColor={editorState.strokeColor} setStrokeColor={editorState.setStrokeColor}
    strokeWidth={editorState.strokeWidth} setStrokeWidth={editorState.setStrokeWidth}
    fontSize={editorState.fontSize} setFontSize={editorState.setFontSize}
    themeVars={themeVars}
  />
</div>
```

- [ ] **Step 3: 커밋**

```bash
git add components/FileExplorer/ImageEditor/panels/PropertyPanel.tsx components/FileExplorer/ImageEditor/index.tsx
git commit -m "feat: 속성 패널 — 색상 프리셋, 두께, 폰트 크기 조절"
```

---

## Task 11: 레이어 패널

**Files:**
- Create: `components/FileExplorer/ImageEditor/panels/LayerPanel.tsx`
- Modify: `components/FileExplorer/ImageEditor/index.tsx`

- [ ] **Step 1: LayerPanel.tsx 생성**

```tsx
// panels/LayerPanel.tsx
import React from 'react';
import { Plus, Trash2, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { Layer } from '../types';
import { ThemeVars } from '../../../../types';

interface LayerPanelProps {
  layers: Layer[];
  activeLayerId: string;
  setActiveLayerId: (id: string) => void;
  addLayer: () => void;
  removeLayer: (id: string) => void;
  toggleVisibility: (id: string) => void;
  toggleLock: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  themeVars: ThemeVars | null;
}

export default function LayerPanel({
  layers, activeLayerId, setActiveLayerId, addLayer, removeLayer,
  toggleVisibility, toggleLock, renameLayer, themeVars,
}: LayerPanelProps) {
  return (
    <div
      className="flex flex-col shrink-0"
      style={{
        width: 200,
        backgroundColor: themeVars?.surface2 ?? '#1e293b',
        borderLeft: `1px solid ${themeVars?.border ?? '#334155'}`,
      }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}
      >
        <span style={{ color: themeVars?.text ?? '#e5e7eb', fontSize: 12, fontWeight: 600 }}>
          레이어
        </span>
        <button onClick={addLayer}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: themeVars?.muted ?? '#888' }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* 레이어 목록 (역순 — 위가 최상위) */}
      <div className="flex-1 overflow-y-auto">
        {[...layers].reverse().map(layer => (
          <div
            key={layer.id}
            className="flex items-center gap-1 px-2 py-1.5 cursor-pointer"
            style={{
              backgroundColor: layer.id === activeLayerId
                ? (themeVars?.accent20 ?? 'rgba(59,130,246,0.2)') : 'transparent',
              borderBottom: `1px solid ${themeVars?.border ?? '#334155'}`,
            }}
            onClick={() => setActiveLayerId(layer.id)}
          >
            <button onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: layer.visible ? (themeVars?.text ?? '#e5e7eb') : (themeVars?.muted ?? '#555') }}
            >
              {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); toggleLock(layer.id); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: layer.locked ? '#f59e0b' : (themeVars?.muted ?? '#555') }}
            >
              {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
            <span
              className="flex-1 truncate text-xs"
              style={{ color: themeVars?.text ?? '#e5e7eb' }}
              onDoubleClick={(e) => {
                const span = e.currentTarget;
                const input = document.createElement('input');
                input.value = layer.name;
                input.className = 'text-xs';
                input.style.cssText = 'background:transparent;border:1px solid #3b82f6;color:white;width:100%;outline:none;padding:0 2px;';
                span.replaceWith(input);
                input.focus();
                input.select();
                const finish = () => { renameLayer(layer.id, input.value || layer.name); };
                input.addEventListener('blur', finish, { once: true });
                input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') input.blur(); });
              }}
            >
              {layer.name}
            </span>
            <button onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: themeVars?.muted ?? '#555' }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: index.tsx에 LayerPanel 렌더링 추가**

캔버스 우측에 LayerPanel 배치:

```tsx
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
```

- [ ] **Step 3: 커밋**

```bash
git add components/FileExplorer/ImageEditor/panels/LayerPanel.tsx components/FileExplorer/ImageEditor/index.tsx
git commit -m "feat: 레이어 패널 — 추가/삭제/표시/잠금/이름변경"
```

---

## Task 12: 지우개 도구 + 요소 삭제 키보드 단축키

**Files:**
- Modify: `components/FileExplorer/ImageEditor/EditorCanvas.tsx`

- [ ] **Step 1: 지우개 도구 커서 변경**

지우개 도구 선택 시 Stage의 CSS 커서를 변경:

```typescript
// Stage의 style 속성에 추가
style={{ cursor: props.activeTool === 'eraser' ? 'crosshair' : 'default' }}
```

지우개 동작은 이미 Task 6에서 구현됨 (renderElement의 onClick에서 `eraser` 분기로 `removeElement` 호출).

- [ ] **Step 2: 커밋**

```bash
git add components/FileExplorer/ImageEditor/EditorCanvas.tsx
git commit -m "feat: 지우개 도구 커서 + 요소 클릭 삭제"
```

---

## Task 13: 최종 통합 + CLAUDE.md 업데이트

**Files:**
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CLAUDE.md에 이미지 편집기 아키텍처 문서 추가**

Architecture 섹션에 추가:

```markdown
### 이미지 편집기 (`components/FileExplorer/ImageEditor/`)

react-konva(Konva.js) 기반 이미지 어노테이션 편집기. 전체 화면 모달로 구현.
- **도구**: 선택, 크롭, 사각형, 원, 화살표, 텍스트, 펜, 지우개
- **레이어 시스템**: 포토샵 스타일 레이어 추가/삭제/표시/잠금
- **저장**: `{파일명}_Desc.{확장자}`로 별도 저장 (Rust `save_image_base64` 커맨드)
- **열기**: 이미지 파일 선택 후 Enter 키
```

- [ ] **Step 2: Rust 커맨드 문서에 save_image_base64 추가**

```markdown
- `save_image_base64` - Saves base64-encoded image data to file
```

- [ ] **Step 3: CHANGELOG.md 업데이트**

- [ ] **Step 4: 빌드 + 전체 기능 테스트**

```bash
npx tsc --noEmit && npm run tauri dev
```

테스트 항목:
1. 이미지 파일 Enter → 편집기 열림
2. 사각형/원/화살표 그리기
3. 텍스트 추가 + 더블클릭 편집
4. 펜 드로잉
5. 지우개로 요소 삭제
6. 레이어 추가/삭제/표시/잠금
7. Ctrl+Z 실행취소
8. 초기화 버튼
9. 저장 → `_Desc` 파일 생성 확인
10. 크롭 도구
11. ESC로 편집기 닫기
12. 마크다운 복사 → 터미널 붙여넣기 정상 동작

- [ ] **Step 5: 커밋**

```bash
git add CLAUDE.md CHANGELOG.md
git commit -m "docs: 이미지 편집기 아키텍처 문서 + CHANGELOG 업데이트"
```

---

## 의존성 그래프

```
Task 0 (마크다운 버그) ─────────────────────── 독립, 즉시 실행

Task 1 (의존성+타입) ──┐
Task 4 (Rust 커맨드) ──┼──→ Task 2 (상태 훅) ──→ Task 3 (셸+캔버스)
                       │                              │
                       │    Task 5 (FileExplorer 통합) ←┘
                       │                              │
                       │    Task 6 (도형) ←────────────┘
                       │         │
                       │    Task 7 (텍스트)   ← 동일 파일 순차
                       │         │
                       │    Task 8 (펜)       ← 동일 파일 순차
                       │         │
                       │    Task 9 (크롭)
                       │         │
                       │    Task 10 (속성패널)  ← 독립 파일
                       │    Task 11 (레이어)    ← 독립 파일
                       │         │
                       │    Task 12 (지우개)
                       │         │
                       └───→ Task 13 (통합+문서)
```

**병렬 실행 가능 그룹:**
- Task 0 (마크다운 버그) — 완전 독립, 즉시 실행 가능
- Task 1 + Task 4 (의존성 설치 + Rust 커맨드) — 동시 실행 가능
- Task 6 → 7 → 8 — 동일 파일(`EditorCanvas.tsx`) 수정이므로 **순차 실행 필수**
- Task 10 + Task 11 (속성패널 + 레이어패널) — 독립 파일이므로 동시 실행 가능
