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
