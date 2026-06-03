# 미리보기 모달 목록

## 공용 모달 래퍼
`components/FileExplorer/ui/ModalShell.tsx` — 오버레이·헤더·푸터·ESC 닫기  
`components/FileExplorer/ui/modalStyles.ts` — 공용 스타일 상수

## 이미지·비디오 미리보기 (PreviewModals.tsx)

### 위치
`components/FileExplorer/PreviewModals.tsx`  
`components/FileExplorer/PreviewToolbar.tsx`

### 이미지 기능
- 줌 인/아웃
- 자르기 오버레이: `ImageCropOverlay.tsx`
- 드로잉 주석: `DrawingCanvas.tsx`

### 비디오 기능
- 재생·타임라인: `VideoPlayer.tsx`
- 자르기 오버레이: `VideoCropOverlay.tsx`
- 편집 도구: `VideoEditToolbar.tsx`

## 기타 미리보기 모달

| 컴포넌트 | 형식 | 주요 Rust 명령 |
|---------|------|--------------|
| `MarkdownPreviewModal.tsx` | `.md` | — (파일 읽기) |
| `CodePreviewModal.tsx` | 코드 파일 | `read_text_file` |
| `PdfPreviewModal.tsx` | `.pdf` | — |
| `FontPreviewModal.tsx` | `.ttf` `.otf` `.woff` | `read_font_bytes`, `get_font_info` |
| `AudioPreviewModal.tsx` | 오디오 | — |
| `JsonViewerModal.tsx` | `.json` | `read_text_file` |
| `HwpPreviewModal.tsx` | `.hwp` | `extract_hwp_text` |
| `FbxPreviewModal.tsx` | `.fbx` | — |
| `LaigterLitPreview.tsx` | `.laigter` | `laigter_maps_preview` |

## useModalStates.ts

### 위치
`components/FileExplorer/hooks/useModalStates.ts`

### 역할
모든 모달의 열림/닫힘 state와 토글 함수를 중앙 관리.  
새 모달 추가 시 이 훅에 state + 토글 함수 추가.

## 관련 위키
- [../special/drawing.md](../special/drawing.md)
- [../special/markdown-editor.md](../special/markdown-editor.md)
