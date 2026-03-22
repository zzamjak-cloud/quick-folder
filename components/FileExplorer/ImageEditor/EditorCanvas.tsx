import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
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

const EditorCanvas = forwardRef<EditorCanvasRef, EditorCanvasProps>(
  function EditorCanvas(props, ref) {
    const stageRef = useRef<Konva.Stage>(null);
    const transformerRef = useRef<Konva.Transformer>(null);

    // 드로잉 중인 임시 요소
    const [drawingElement, setDrawingElement] = useState<EditorElement | null>(null);

    useImperativeHandle(ref, () => ({
      getStage: () => stageRef.current,
    }));

    // 마우스 다운 — 도형·텍스트·펜 도구 시작
    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      const pos = e.target.getStage()?.getPointerPosition();
      if (!pos) return;
      const scaledPos = { x: pos.x / props.scale, y: pos.y / props.scale };

      // 선택 도구 — 빈 영역 클릭 시 선택 해제
      if (props.activeTool === 'select') {
        if (e.target === e.target.getStage()) props.onSelectElement(null);
        return;
      }

      // 도형 도구 (사각형, 원, 화살표)
      if (['rect', 'circle', 'arrow'].includes(props.activeTool)) {
        props.onPushSnapshot();
        const id = crypto.randomUUID();
        let el: EditorElement;
        if (props.activeTool === 'rect') {
          el = { id, type: 'rect', layerId: 'auto', x: scaledPos.x, y: scaledPos.y,
            width: 0, height: 0, stroke: props.strokeColor, strokeWidth: props.strokeWidth,
            rotation: 0, visible: true };
        } else if (props.activeTool === 'circle') {
          el = { id, type: 'circle', layerId: 'auto', x: scaledPos.x, y: scaledPos.y,
            radiusX: 0, radiusY: 0, stroke: props.strokeColor, strokeWidth: props.strokeWidth,
            rotation: 0, visible: true };
        } else {
          el = { id, type: 'arrow', layerId: 'auto', x: 0, y: 0,
            points: [scaledPos.x, scaledPos.y, scaledPos.x, scaledPos.y],
            stroke: props.strokeColor, strokeWidth: props.strokeWidth, visible: true };
        }
        setDrawingElement(el);
        return;
      }

      // 텍스트 도구 — 클릭 시 텍스트 요소 추가
      if (props.activeTool === 'text') {
        props.onPushSnapshot();
        const id = crypto.randomUUID();
        const el: EditorElement = {
          id, type: 'text', layerId: 'auto', x: scaledPos.x, y: scaledPos.y,
          text: '텍스트 입력', fontSize: props.fontSize, fill: props.strokeColor,
          width: 200, rotation: 0, visible: true,
        };
        props.onAddElement(el);
        props.onSelectElement(id);
        return;
      }

      // 펜 도구 — 프리핸드 드로잉 시작
      if (props.activeTool === 'draw') {
        props.onPushSnapshot();
        const id = crypto.randomUUID();
        const el: EditorElement = {
          id, type: 'draw', layerId: 'auto', x: 0, y: 0,
          points: [scaledPos.x, scaledPos.y],
          stroke: props.strokeColor, strokeWidth: props.strokeWidth, visible: true,
        };
        setDrawingElement(el);
        return;
      }
    };

    // 마우스 이동 — 드래그 중 임시 요소 업데이트
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
      } else if (drawingElement.type === 'draw') {
        setDrawingElement({
          ...drawingElement,
          points: [...drawingElement.points, sp.x, sp.y],
        });
      }
    };

    // 마우스 업 — 임시 요소를 확정하여 레이어에 추가
    const handleMouseUp = () => {
      if (drawingElement) {
        props.onAddElement(drawingElement);
        setDrawingElement(null);
      }
    };

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
            fill={el.fill} width={el.width} rotation={el.rotation}
            onDblClick={() => {
              // 인라인 텍스트 편집 — textarea 오버레이
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
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ cursor: props.activeTool === 'eraser' ? 'crosshair' :
          ['rect','circle','arrow','draw','text','crop'].includes(props.activeTool) ? 'crosshair' : 'default' }}
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

        {/* 그리기 중인 임시 요소 */}
        <KonvaLayer>
          {drawingElement && renderElement(drawingElement)}
        </KonvaLayer>

        {/* Transformer 레이어 (선택 도구용) */}
        <KonvaLayer>
          <Transformer ref={transformerRef} />
        </KonvaLayer>
      </Stage>
    );
  }
);

export default EditorCanvas;
