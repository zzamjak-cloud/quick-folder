# 스마트 폴더 병합

## 개요

같은 이름의 폴더를 복사·이동·붙여넣기할 때, 단순 덮어쓰기 확인 대신 양쪽 내용을 비교한 뒤 병합한다.

## 트리거

- 단일 폴더가 대상 경로에 **같은 이름의 기존 폴더**와 충돌할 때
- 드래그 앤 드롭, OS 드롭, 클립보드 붙여넣기 공통

다중 항목·파일 단독 충돌은 기존 중복 확인 다이얼로그를 유지한다.

## UI

`components/FileExplorer/FolderMergeModal.tsx`

| 섹션 | 내용 |
|------|------|
| 양쪽에 모두 있는 파일 | 충돌 목록 (크기 표시) |
| 소스에만 있는 파일 | 병합 시 복사됨 |
| 대상에만 있는 파일 | 그대로 유지 |

### 충돌 처리 (3가지)

| 모드 | 동작 |
|------|------|
| `rename` | `file (1).txt` 형식으로 이름 변경 후 복사 |
| `overwrite_newer` | 수정 시각이 더 최근인 파일만 유지 |
| `skip` | 충돌 파일만 건너뛰고 나머지 병합 |

## Rust 명령

```rust
analyze_folder_merge(source, dest_parent) -> FolderMergeAnalysis
merge_folders(source, dest_parent, conflict_mode, is_move)
```

## 관련 파일

- `utils/folderMerge.ts` — 폴더 병합 시나리오 감지
- `components/FileExplorer/hooks/useClipboard.ts`
- `components/FileExplorer/hooks/useInternalDragDrop.ts`
- `src-tauri/src/modules/file_ops/transfer/folder_merge.rs`
