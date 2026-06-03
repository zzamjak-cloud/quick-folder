# 드로잉 캔버스

## 역할
이미지 미리보기 위에 주석을 그리고 저장한다.

## 위치
`components/FileExplorer/DrawingCanvas.tsx`

## 타입 (types.ts)
```typescript
type DrawingTool = 'pen' | 'rect' | 'ellipse' | 'eraser'
type StrokeType  = 'pen' | 'rect' | 'ellipse'

interface Stroke {
  type: StrokeType
  points: { x: number; y: number }[]
  color: string
  width: number
}

type DrawingUndoAction =
  | { type: 'add_stroke'; stroke: Stroke }
  | { type: 'clear_all'; strokes: Stroke[] }
```

## 도구
| 도구 | 설명 |
|------|------|
| `pen` | 자유 곡선 |
| `rect` | 사각형 |
| `ellipse` | 타원 |
| `eraser` | 지우개 |

## 저장
```typescript
invoke('save_annotated_image', { path, strokes, dest })
// strokes: Stroke[] 직렬화해서 전달
// Rust에서 원본 이미지 위에 합성 후 저장
```

## UI 진입점
`PreviewToolbar.tsx` — 드로잉 모드 토글 버튼  
이미지 미리보기(`PreviewModals.tsx`) 내에 `DrawingCanvas` 레이어 렌더링.

## 실행취소
드로잉 전용 `DrawingUndoAction` 스택 — 파일 조작 `UndoStack`과 별개.
