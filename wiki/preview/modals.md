# 미리보기 모달 목록

## 공용 모달 래퍼
`components/FileExplorer/ui/ModalShell.tsx` — 오버레이·헤더·푸터·ESC 닫기  
`components/FileExplorer/ui/modalStyles.ts` — 공용 스타일 상수

## lazy 로딩 (FileExplorerModalLayer.tsx)

대형 모달은 `FileExplorerModalLayer.tsx`에서 `React.lazy` + `Suspense`로 지연 로딩한다. `index.tsx`에 모달 import를 직접 추가하지 않는다.

```typescript
// FileExplorerModalLayer.tsx — lazy 선언 예시
const PreviewModals = lazy(() => import('./PreviewModals'));
const CodePreviewModal = lazy(() => import('./CodePreviewModal'));
```

## 미리보기 라우터 (PreviewModals.tsx)

형식별 모달을 조합하는 thin router. 실제 UI는 분리된 컴포넌트에 있다.

| 컴포넌트 | 형식 | 역할 |
|---------|------|------|
| `ImagePreviewModal.tsx` | 이미지 | 줌·자르기·드로잉 주석 |
| `VideoPreviewModal.tsx` | 비디오 | 재생·타임라인·자르기 |
| `TextPreviewModal.tsx` | 텍스트 | 텍스트 미리보기 |
| `MarkdownPreviewModalHost.tsx` | `.md` | MarkdownPreviewModal thin host |
| `JsonPreviewModalHost.tsx` | `.json` | JsonViewerModal thin host |
| `HwpPreviewModalHost.tsx` | `.hwp` | HwpPreviewModal thin host |

### 이미지·비디오 편집 서브컴포넌트
- `PreviewToolbar.tsx` — 공용 툴바
- `ImageCropOverlay.tsx`, `ImageEditPanels.tsx` — 이미지 자르기·편집
- `VideoPlayer.tsx`, `VideoCropOverlay.tsx`, `VideoEditToolbar.tsx` — 비디오 편집
- `DrawingCanvas.tsx` — 드로잉 주석

## 코드 편집기 (CodePreviewModal + codePreview/)

| 파일 | 역할 |
|------|------|
| `CodePreviewModal.tsx` | shell·상태 wiring |
| `codePreview/CodePreviewEditorSurface.tsx` | 에디터 surface |
| `codePreview/CodePreviewSearchBar.tsx` | 검색 UI |
| `codePreview/CodePreviewReadOnlyLines.tsx` | 읽기 전용 줄 |
| `codePreview/CodePreviewStatusBar.tsx` | 상태 바 |
| `codePreview/search.ts` | 검색 순수 로직 |
| `codePreview/syntax.ts` | syntax highlighting |
| `codePreview/styles.tsx` | 에디터 스타일 |

## 기타 미리보기·도구 모달

| 컴포넌트 | 형식 | 주요 Rust 명령 |
|---------|------|--------------|
| `MarkdownPreviewModal.tsx` | `.md` | — (파일 읽기) |
| `PdfPreviewModal.tsx` | `.pdf` | — |
| `FontPreviewModal.tsx` | `.ttf` `.otf` `.woff` | `read_font_bytes`, `get_font_info` |
| `AudioPreviewModal.tsx` | 오디오 | — |
| `JsonViewerModal.tsx` | `.json` | `read_text_file` |
| `HwpPreviewModal.tsx` | `.hwp` | `extract_hwp_text` |
| `FbxPreviewModal.tsx` | `.fbx` | — |
| `LaigterLitPreview.tsx` | `.laigter` | `laigter_maps_preview` |
| `DuplicateFilesModal.tsx` | — | `find_duplicate_files`, `delete_items` |
| `DiffViewerModal.tsx` | 텍스트·코드 | `read_text_file` (프론트 diff) |
| `GlobalSearchModal.tsx` | 파일명 검색 | `search_files` |

Rust 호출은 `tauriCommands.*` 사용.

## useModalStates.ts

### 위치
`components/FileExplorer/hooks/useModalStates.ts`

### 역할
모든 모달의 열림/닫힘 state와 토글 함수를 중앙 관리.  
새 모달 추가 시 이 훅에 state + 토글 함수 추가 → `FileExplorerModalLayer.tsx`에 lazy import 추가.

### 주요 state (탐색·비교)
| state | 타입 | 모달 |
|-------|------|------|
| `isGlobalSearchOpen` | `boolean` | GlobalSearchModal |
| `duplicateFinderPath` | `string \| null` | DuplicateFilesModal |
| `diffViewerPaths` | `[string, string] \| null` | DiffViewerModal |

## 관련 위키
- [../special/drawing.md](../special/drawing.md)
- [../special/markdown-editor.md](../special/markdown-editor.md)
- [../special/diff-viewer.md](../special/diff-viewer.md)
- [../explorer/duplicate-finder.md](../explorer/duplicate-finder.md)
- [../explorer/overview.md](../explorer/overview.md)
