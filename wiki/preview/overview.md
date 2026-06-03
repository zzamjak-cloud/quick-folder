# 미리보기 시스템 개요

## 트리거
파일 선택 후 `Space` → 파일 확장자에 따라 해당 미리보기 모달 열기

## 미리보기 결정 흐름
```
Space 키
  → usePreview.ts: 확장자 판별
  → 해당 모달 state 활성화 (useModalStates.ts)
  → 모달 컴포넌트 렌더링
```

## 지원 형식별 모달

| 파일 형식 | 컴포넌트 | 비고 |
|---------|---------|------|
| 이미지 (jpg, png, gif, webp 등) | `PreviewModals.tsx` | 줌·자르기·드로잉 포함 |
| 비디오 (mp4, mov 등) | `PreviewModals.tsx` + `VideoPlayer.tsx` | 편집 도구 포함 |
| `.md` | `MarkdownPreviewModal.tsx` | 렌더링 미리보기 |
| `.pdf` | `PdfPreviewModal.tsx` | |
| `.ttf` `.otf` `.woff` | `FontPreviewModal.tsx` | Space: 폰트 테스트 팝업 |
| `.mp3` `.wav` `.flac` 등 | `AudioPreviewModal.tsx` | |
| `.json` | `JsonViewerModal.tsx` | 트리 뷰 |
| `.hwp` | `HwpPreviewModal.tsx` | 텍스트 추출 |
| `.fbx` | `FbxPreviewModal.tsx` | 3D 뷰어 |
| `.laigter` | `LaigterLitPreview.tsx` | |
| 코드 파일 | `CodePreviewModal.tsx` | `CODE_PREVIEW_EXTS` 집합 |
| 텍스트 파일 | `PreviewModals.tsx` | `TEXT_PREVIEW_EXTS` 집합 |

## 확장자 집합 (FileExplorer/index.tsx)
```typescript
TEXT_PREVIEW_EXTS   // .txt, .md 등 텍스트 파일
CODE_PREVIEW_EXTS   // .ts, .js, .py, .rs, .go 등 코드 파일
```

## 관련 위키
- [thumbnails.md](thumbnails.md)
- [modals.md](modals.md)
- [../special/drawing.md](../special/drawing.md)
