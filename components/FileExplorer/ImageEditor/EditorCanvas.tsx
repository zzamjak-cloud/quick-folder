import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Stage, Layer as KonvaLayer, Image as KonvaImage, Rect, Ellipse, Arrow, Text, Line, Transformer, Circle } from 'react-konva';
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
  onRemoveLayerByElement: (elementId: string) => void;  // #4: 지우개용
  onPushSnapshot: () => void;
  cropRect: CropRect | null;
  onCropChange: (rect: CropRect) => void;
  stageWidth: number;
  stageHeight: number;
  imageOffset: { x: number; y: number };  // #2: 이미지 오프셋
  scale: number;
}

export interface EditorCanvasRef {
  getStage: () => Konva.Stage | null;
}

/** 크롭 핸들 위치 계산 */
function getCropHandles(cr: CropRect) {
  const { x, y, width: w, height: h } = cr;
  return [
    { name: 'tl', cx: x, cy: y },
    { name: 'tm', cx: x + w / 2, cy: y },
    { name: 'tr', cx: x + w, cy: y },
    { name: 'ml', cx: x, cy: y + h / 2 },
    { name: 'mr', cx: x + w, cy: y + h / 2 },
    { name: 'bl', cx: x, cy: y + h },
    { name: 'bm', cx: x + w / 2, cy: y + h },
    { name: 'br', cx: x + w, cy: y + h },
  ];
}

const EditorCanvas = forwardRef<EditorCanvasRef, EditorCanvasProps>(
  function EditorCanvas(props, ref) {
    const stageRef = useRef<Konva.Stage>(null);
    const transformerRef = useRef<Konva.Transformer>(null);
    const [drawingElement, setDrawingElement] = useState<EditorElement | null>(null);

    useImperativeHandle(ref, () => ({
      getStage: () => stageRef.current,
    }));

    // 마우스 다운
    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      const pos = e.target.getStage()?.getPointerPosition();
      if (!pos) return;
      // #2: 스케일 보정 — 워크스페이스 전체에서 그리기 가능
      const scaledPos = { x: pos.x / props.scale, y: pos.y / props.scale };

      if (props.activeTool === 'select') {
        if (e.target === e.target.getStage()) props.onSelectElement(null);
        return;
      }

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

      if (props.activeTool === 'text') {
        props.onPushSnapshot();
        const id = crypto.randomUUID();
        const stage = stageRef.current;
        if (!stage) return;
        const stageBox = stage.container().getBoundingClientRect();

        const el: EditorElement = {
          id, type: 'text', layerId: 'auto', x: scaledPos.x, y: scaledPos.y,
          text: '', fontSize: props.fontSize, fill: props.strokeColor,
          width: 200, rotation: 0, visible: true,
        };
        props.onAddElement(el);
        props.onSelectElement(id);

        setTimeout(() => {
          openTextEditor(id, '', stageBox.left + pos.x, stageBox.top + pos.y,
            props.fontSize * props.scale, props.strokeColor, props);
        }, 50);
        return;
      }

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

    const handleMouseUp = () => {
      if (drawingElement) {
        props.onAddElement(drawingElement);
        setDrawingElement(null);
      }
    };

    // Transformer 업데이트
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

    const renderElement = (el: EditorElement) => {
      const commonProps = {
        id: el.id,
        key: el.id,
        x: el.x,
        y: el.y,
        draggable: props.activeTool === 'select',
        onClick: () => {
          // #4: 지우개 — 레이어째 제거
          if (props.activeTool === 'eraser') {
            props.onPushSnapshot();
            props.onRemoveLayerByElement(el.id);
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
            stroke={el.stroke} strokeWidth={el.strokeWidth} rotation={el.rotation}
            onTransformEnd={(e) => {
              const node = e.target;
              props.onPushSnapshot();
              props.onUpdateElement(el.id, {
                x: node.x(), y: node.y(),
                width: Math.max(5, node.width() * node.scaleX()),
                height: Math.max(5, node.height() * node.scaleY()),
                rotation: node.rotation(),
              });
              node.scaleX(1);
              node.scaleY(1);
            }}
          />;
        case 'circle':
          return <Ellipse {...commonProps} radiusX={el.radiusX} radiusY={el.radiusY}
            stroke={el.stroke} strokeWidth={el.strokeWidth} rotation={el.rotation}
            onTransformEnd={(e) => {
              const node = e.target;
              props.onPushSnapshot();
              props.onUpdateElement(el.id, {
                x: node.x(), y: node.y(),
                radiusX: Math.max(5, el.radiusX * node.scaleX()),
                radiusY: Math.max(5, el.radiusY * node.scaleY()),
                rotation: node.rotation(),
              });
              node.scaleX(1);
              node.scaleY(1);
            }}
          />;
        case 'arrow':
          return <Arrow {...commonProps} points={el.points}
            stroke={el.stroke} strokeWidth={el.strokeWidth} fill={el.stroke}
            onTransformEnd={(e) => {
              const node = e.target;
              props.onPushSnapshot();
              const sx = node.scaleX();
              const sy = node.scaleY();
              props.onUpdateElement(el.id, {
                x: node.x(), y: node.y(),
                points: el.points.map((p, i) => i % 2 === 0 ? p * sx : p * sy),
              });
              node.scaleX(1);
              node.scaleY(1);
            }}
          />;
        case 'text':
          return <Text {...commonProps} text={el.text || '텍스트'} fontSize={el.fontSize}
            fill={el.fill} width={el.width} rotation={el.rotation}
            onDblClick={() => {
              const stage = stageRef.current;
              if (!stage) return;
              const textNode = stage.findOne(`#${el.id}`) as Konva.Text;
              if (!textNode) return;
              const textPosition = textNode.absolutePosition();
              const stageBox = stage.container().getBoundingClientRect();
              openTextEditor(el.id, el.text, stageBox.left + textPosition.y * props.scale,
                stageBox.top + textPosition.y * props.scale, el.fontSize * props.scale, el.fill, props);
              // 올바른 위치 계산
              const absPos = textNode.getClientRect();
              openTextEditor(el.id, el.text,
                stageBox.left + absPos.x,
                stageBox.top + absPos.y,
                el.fontSize * props.scale, el.fill, props);
            }}
            onTransformEnd={(e) => {
              const node = e.target;
              props.onPushSnapshot();
              props.onUpdateElement(el.id, {
                x: node.x(), y: node.y(),
                width: Math.max(20, node.width() * node.scaleX()),
                rotation: node.rotation(),
              });
              node.scaleX(1);
              node.scaleY(1);
            }}
          />;
        case 'draw':
          return <Line {...commonProps} points={el.points}
            stroke={el.stroke} strokeWidth={el.strokeWidth}
            lineCap="round" lineJoin="round" tension={0.5} />;
      }
    };

    // 크롭 핸들 드래그 — #6: 이미지 크기를 초과할 수 있음
    const handleCropHandleDrag = (name: string, newX: number, newY: number) => {
      if (!props.cropRect) return;
      const cr = { ...props.cropRect };
      const minSize = 20;

      if (name.includes('l')) { const dx = newX - cr.x; cr.x = newX; cr.width = Math.max(minSize, cr.width - dx); }
      if (name.includes('r')) { cr.width = Math.max(minSize, newX - cr.x); }
      if (name.includes('t')) { const dy = newY - cr.y; cr.y = newY; cr.height = Math.max(minSize, cr.height - dy); }
      if (name.includes('b')) { cr.height = Math.max(minSize, newY - cr.y); }

      props.onCropChange(cr);
    };

    return (
      <Stage
        ref={stageRef}
        width={props.stageWidth * props.scale}
        height={props.stageHeight * props.scale}
        scaleX={props.scale}
        scaleY={props.scale}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ cursor: props.activeTool === 'eraser' ? 'crosshair' :
          ['rect','circle','arrow','draw','text','crop'].includes(props.activeTool) ? 'crosshair' : 'default' }}
      >
        {/* #4: 이미지 영역 표시 테두리 */}
        <KonvaLayer>
          <Rect x={props.imageOffset.x} y={props.imageOffset.y}
            width={props.image ? props.image.width : 0}
            height={props.image ? props.image.height : 0}
            stroke="rgba(255,255,255,0.2)" strokeWidth={1} dash={[4, 4]}
            listening={false} />
        </KonvaLayer>

        {/* 배경 이미지 — #2: 오프셋 위치에 렌더링 */}
        <KonvaLayer>
          {props.image && <KonvaImage image={props.image}
            x={props.imageOffset.x} y={props.imageOffset.y} />}
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

        {/* Transformer */}
        <KonvaLayer>
          <Transformer ref={transformerRef}
            rotateEnabled={true}
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right',
              'top-center', 'bottom-center', 'middle-left', 'middle-right']}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 5 || newBox.height < 5) return oldBox;
              return newBox;
            }}
          />
        </KonvaLayer>

        {/* 크롭 오버레이 */}
        {props.cropRect && (
          <KonvaLayer>
            <Rect x={0} y={0} width={props.stageWidth} height={props.stageHeight}
              fill="rgba(0,0,0,0.5)" listening={false} />
            <Rect
              x={props.cropRect.x} y={props.cropRect.y}
              width={props.cropRect.width} height={props.cropRect.height}
              fill="transparent" stroke="#fff" strokeWidth={2}
              globalCompositeOperation="destination-out"
              listening={false}
            />
            <Rect
              x={props.cropRect.x} y={props.cropRect.y}
              width={props.cropRect.width} height={props.cropRect.height}
              fill="transparent" stroke="#fff" strokeWidth={1}
              dash={[6, 3]}
              draggable
              onDragEnd={(e) => {
                props.onCropChange({
                  ...props.cropRect!,
                  x: e.target.x(),
                  y: e.target.y(),
                });
              }}
            />
            {getCropHandles(props.cropRect).map(h => (
              <Circle
                key={h.name}
                x={h.cx} y={h.cy}
                radius={5}
                fill="#fff"
                stroke="#3b82f6"
                strokeWidth={1}
                draggable
                onDragMove={(e) => {
                  handleCropHandleDrag(h.name, e.target.x(), e.target.y());
                }}
                onDragEnd={() => {}}
              />
            ))}
          </KonvaLayer>
        )}
      </Stage>
    );
  }
);

/** 텍스트 편집 textarea 열기 */
function openTextEditor(
  elId: string, currentText: string,
  left: number, top: number, fontSize: number, color: string,
  props: { onPushSnapshot: () => void; onUpdateElement: (id: string, u: Partial<EditorElement>) => void }
) {
  // 기존 textarea 제거
  const existing = document.getElementById('konva-text-editor');
  if (existing) existing.remove();

  const textarea = document.createElement('textarea');
  textarea.id = 'konva-text-editor';
  textarea.value = currentText;
  textarea.placeholder = '텍스트 입력...';
  textarea.style.position = 'absolute';
  textarea.style.left = `${left}px`;
  textarea.style.top = `${top}px`;
  textarea.style.fontSize = `${fontSize}px`;
  textarea.style.color = color;
  textarea.style.background = 'rgba(0,0,0,0.6)';
  textarea.style.border = '1px solid #3b82f6';
  textarea.style.outline = 'none';
  textarea.style.resize = 'none';
  textarea.style.zIndex = '99999';
  textarea.style.minWidth = '120px';
  textarea.style.minHeight = '40px';
  textarea.style.padding = '4px 6px';
  textarea.style.borderRadius = '4px';
  document.body.appendChild(textarea);
  textarea.focus();
  if (currentText) textarea.select();
  textarea.addEventListener('blur', () => {
    props.onPushSnapshot();
    props.onUpdateElement(elId, { text: textarea.value || '텍스트' });
    textarea.remove();
  });
  textarea.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') textarea.blur();
    ev.stopPropagation();
  }, true);
}

export default EditorCanvas;
