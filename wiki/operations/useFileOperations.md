# useFileOperations

## 역할
파일·폴더 조작의 **facade 훅**. 삭제·압축·용량 분석 등은 서브훅에 위임하고, 복제·그룹화·이름변경·픽셀화 등 나머지 조작을 직접 제공한다.

## 위치
`components/FileExplorer/hooks/useFileOperations.ts`

## 아키텍처

```
useFileOperations.ts (facade)
├── useDeleteOperations.ts      ← deleteSelected·elevated 삭제
├── useArchiveOperations.ts     ← compressToZip·extractZip
├── useFolderSizeOperations.ts  ← handleInspectFolderSize
├── useDirectoryLoader.ts       ← loadDirectory (index.tsx에서 사용)
├── useExplorerSelection.ts     ← handleSelection (index.tsx에서 사용)
└── usePreviewRouting.ts        ← openArchiveEntry (index.tsx에서 사용)
```

Rust 호출은 `tauriCommands.*` typed API를 사용한다.

## 주요 함수

| 함수명 | 단축키 | Rust 명령 | 설명 |
|--------|--------|-----------|------|
| `deleteSelected()` | Delete / Backspace | `delete_items` | 선택 항목 휴지통 이동 → `useDeleteOperations` |
| `duplicateSelected()` | Ctrl+D | `duplicate_items` | 같은 위치에 복제 |
| `groupSelected(folderName)` | Ctrl+G | `create_directory` + `move_items` | 새 폴더로 그룹화 |
| `ungroupFolder(path)` | Ctrl+Alt+G | `move_items` | 폴더 내용 꺼내기 |
| `compressToZip(paths)` | Ctrl+Shift+Z | `compress_to_zip` | ZIP 압축 → `useArchiveOperations` |
| `extractZip(path)` | Ctrl+Shift+Alt+Z | `extract_zip` | ZIP 해제 → `useArchiveOperations` |
| `compressVideo(paths)` | Ctrl+Shift+P | `compress_video` | 비디오 압축 |
| `createFolder()` | Ctrl+Shift+N | `create_directory` | 새 폴더 생성 |
| `createMarkdownFile()` | Ctrl+Shift+M | `create_text_file` | .md 파일 생성 |
| `handleInspectFolderSize(path)` | 컨텍스트 메뉴 | `calculate_folder_size` | → `useFolderSizeOperations` |

## 압축 내부 읽기 전용
- `ensureWritableContext()`가 현재 경로와 선택 경로를 검사한다.
- `currentPath` 또는 선택 `paths` 중 archive virtual path가 있으면 쓰기 작업을 중단한다.
- 사용자 메시지: `압축 내부는 읽기 전용입니다. 파일을 밖으로 꺼내서 사용하세요.`

## 폴더 용량 분석
→ `useFolderSizeOperations.ts` 참조. `calculate_folder_size` 응답을 바 차트로 표시한다.

## Undo 지원 현황

| 액션 | UndoAction 타입 | 복원 방법 |
|------|----------------|----------|
| 삭제 | `delete` | `restore_trash_items(paths)` |
| 이름변경 | `rename` | `rename_item(newPath, oldName)` |
| 그룹화 | `move_group` | `move_items(movedPaths, originalDir)` |
| 파일 생성 | `create_file` | `delete_items([path])` |

## 의존 관계
- `useUndoStack` — 모든 조작 후 `undoStack.push()` 호출
- `useTabManagement` — 폴더 이름변경·삭제 시 `qf-tab-rename` / `qf-tab-delete` 이벤트 발송
- `tauriCommands` — Rust 명령 typed 호출
- `addToast` — 성공/실패 알림

## 관련 위키
- [overview.md](overview.md)
- [undo.md](undo.md)
- [../rust/commands.md](../rust/commands.md)
- [../explorer/archives.md](../explorer/archives.md)
