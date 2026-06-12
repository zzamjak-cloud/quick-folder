# 특수 기능 개요

## 목록

| 기능 | 컴포넌트 | 위키 |
|------|---------|------|
| 마크다운 편집기 | `MarkdownEditor.tsx` | [markdown-editor.md](markdown-editor.md) |
| 스프라이트 시트 패킹 | `SheetPackerModal.tsx` | [sprite-sheet.md](sprite-sheet.md) |
| 스프라이트 시트 언패킹 | `SheetUnpackModal.tsx` | [sprite-sheet.md](sprite-sheet.md) |
| 맵메이커 (Laigter) | `MapMakerModal.tsx` | [sprite-sheet.md](sprite-sheet.md) |
| 드로잉 캔버스 | `DrawingCanvas.tsx` | [drawing.md](drawing.md) |
| 폰트 미리보기 | `FontPreviewModal.tsx` | — |
| 폰트 병합 | `FontMergeModal.tsx` | — |
| HWP 미리보기 | `HwpPreviewModal.tsx` | — |
| FBX 미리보기 | `FbxPreviewModal.tsx` | — |
| JSON 뷰어 | `JsonViewerModal.tsx` | — |
| Diff Viewer | `DiffViewerModal.tsx` | [diff-viewer.md](diff-viewer.md) |
| 중복 파일 찾기 | `DuplicateFilesModal.tsx` | [../explorer/duplicate-finder.md](../explorer/duplicate-finder.md) |
| 자동 업데이트 | `useAutoUpdate.ts` | — |
| Google Drive 연동 | `system_ops/google_drive.rs` | — |

## 폰트 기능

### FontPreviewModal.tsx
```typescript
invoke('read_font_bytes', { path })   // 폰트 데이터 로드
invoke('get_font_info', { path })     // 메타데이터
// Space 키로 폰트 테스트 팝업 열기
```

### FontMergeModal.tsx
```typescript
invoke('merge_fonts', { paths, dest })  // FontTools 필요
// 단축키: Ctrl+Shift+Alt+F (폰트 2개 선택 시)
```

## 자동 업데이트 (useAutoUpdate.ts)

### 위치
`hooks/useAutoUpdate.ts`

### 흐름
```
앱 시작 → checkAndNotifyUpdate()
  → GitHub Releases latest.json 조회
  → 신규 버전 있으면 UpdateModal.tsx 표시
  → 다운로드 → 설치 → 재시작
```

### 관련 컴포넌트
`components/UpdateModal.tsx` — 업데이트 알림·진행률  
`components/UpdateFailedModal.tsx` — 실패 안내

## Google Drive 연동
```typescript
invoke('get_google_drive_file_id', { path })        // Drive 파일 ID
invoke('set_google_drive_offline', { fileId, offline })  // 오프라인 설정
```
