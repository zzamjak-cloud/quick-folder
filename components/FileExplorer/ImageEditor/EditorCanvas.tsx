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

      // 텍스트 도구 — 클릭 시 textarea 직접 열기
      if (props.activeTool === 'text') {
        props.onPushSnapshot();
        const id = crypto.randomUUID();
        const stage = stageRef.current;
        if (!stage) return;
        const stageBox = stage.container().getBoundingClientRect();

        // 요소 먼저 추가
        const el: EditorElement = {
          id, type: 'text', layerId: 'auto', x: scaledPos.x, y: scaledPos.y,
          text: '', fontSize: props.fontSize, fill: props.strokeColor,
          width: 200, rotation: 0, visible: true,
        };
        props.onAddElement(el);
        props.onSelectElement(id);

        // 즉시 textarea 열기
        setTimeout(() => {
          const textarea = document.createElement('textarea');
          textarea.value = '';
          textarea.placeholder = '텍스트 입력...';
          textarea.style.position = 'absolute';
          textarea.style.top = `${stageBox.top + pos.y}px`;
          textarea.style.left = `${stageBox.left + pos.x}px`;
          textarea.style.fontSize = `${props.fontSize * props.scale}px`;
          textarea.style.color = props.strokeColor;
          textarea.style.background = 'rgba(0,0,0,0.5)';
          textarea.style.border = '1px solid #3b82f6';
          textarea.style.outline = 'none';
          textarea.style.resize = 'none';
          textarea.style.zIndex = '99999';
          textarea.style.minWidth = '100px';
          textarea.style.padding = '4px';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.addEventListener('blur', () => {
            const text = textarea.value || '텍스트';
            props.onUpdateElement(id, { text });
            document.body.removeChild(textarea);
          });
          textarea.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') textarea.blur();
            ev.stopPropagation();
          }, true);
        }, 50);
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
            stroke={el.stroke} strokeWidth={el.strokeWidth} rotation={el.rotation}
            // #5: Transformer로 리사이즈 후 크기 반영
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
          // #6: 화살표 — 양쪽 끝점 핸들 대신 Transformer 사용 + 끝점 드래그
          return <Arrow {...commonProps} points={el.points}
            stroke={el.stroke} strokeWidth={el.strokeWidth} fill={el.stroke}
            onTransformEnd={(e) => {
              const node = e.target;
              props.onPushSnapshot();
              // Arrow는 scale로 늘어나므로 points를 재계산
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
            // #7: 더블클릭으로 텍스트 편집
            onDblClick={() => {
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
              textarea.style.background = 'rgba(0,0,0,0.5)';
              textarea.style.border = '1px solid #3b82f6';
              textarea.style.outline = 'none';
              textarea.style.resize = 'none';
              textarea.style.zIndex = '99999';
              textarea.style.minWidth = '100px';
              textarea.style.padding = '4px';
              document.body.appendChild(textarea);
              textarea.focus();
              textarea.select();
              textarea.addEventListener('blur', () => {
                props.onPushSnapshot();
                props.onUpdateElement(el.id, { text: textarea.value || '텍스트' });
                document.body.removeChild(textarea);
              });
              textarea.addEventListener('keydown', (ev) => {
                if (ev.key === 'Escape') textarea.blur();
                ev.stopPropagation();
              }, true);
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

    // 크롭 핸들 드래그
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
        {/* #4: 캔버스 경계 표시 배경 */}
        <KonvaLayer>
          <Rect x={0} y={0} width={props.stageWidth} height={props.stageHeight}
            stroke="rgba(255,255,255,0.15)" strokeWidth={1} dash={[4, 4]}
            listening={false} />
        </KonvaLayer>

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

        {/* Transformer 레이어 — #5, #6: 사각형/화살표 리사이즈 핸들 */}
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

        {/* #1: 크롭 오버레이 + 리사이즈 핸들 */}
        {props.cropRect && (
          <KonvaLayer>
            {/* 어두운 마스크 */}
            <Rect x={0} y={0} width={props.stageWidth} height={props.stageHeight}
              fill="rgba(0,0,0,0.5)" listening={false} />
            {/* 밝은 크롭 영역 — 투명 구멍 */}
            <Rect
              x={props.cropRect.x} y={props.cropRect.y}
              width={props.cropRect.width} height={props.cropRect.height}
              fill="transparent" stroke="#fff" strokeWidth={2}
              globalCompositeOperation="destination-out"
              listening={false}
            />
            {/* 크롭 영역 테두리 + 드래그 가능 */}
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
            {/* 리사이즈 핸들 8개 */}
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

export default EditorCanvas;
