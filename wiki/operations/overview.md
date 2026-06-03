# 파일 조작 개요

## 담당 훅
`components/FileExplorer/hooks/useFileOperations.ts`

## Rust 명령 매핑

| 기능 | 명령 | 비고 |
|------|------|------|
| 삭제 | `delete_items` | 휴지통 이동 |
| 관리자 삭제 | `delete_items_elevated` | 권한 필요 시 |
| 복사 | `copy_items` | |
| 복사(진행률) | `copy_items_with_progress` | `runCopyWithProgress.ts` |
| 이동 | `move_items` | |
| 복제 | `duplicate_items` | 같은 위치에 복제 |
| 이름변경 | `rename_item` | 새 경로 반환 |
| 폴더 생성 | `create_directory` | |
| 파일 생성 | `create_text_file` | |
| 휴지통 복원 | `restore_trash_items` | Undo용 |
| 중복 확인 | `check_duplicate_items` | 붙여넣기 전 |
| ZIP 압축 | `compress_to_zip` | `Ctrl+Shift+Z` |
| ZIP 해제 | `extract_zip` | `Ctrl+Shift+Alt+Z` |

## 새 파일 조작 기능 추가 체크리스트

> **Ctrl+Z 실행취소는 필수다. 빠뜨리면 안 된다.**

1. `types.ts`의 `UndoAction` union에 variant 추가
2. 조작 성공 직후 `undoStack.push(action)` 호출
3. `FileExplorer/index.tsx`의 `handleUndo`에 복원 로직 추가
4. 복원 후 `loadDirectory(currentPath)` 호출

→ [undo.md](undo.md)

## 관련 위키
- [useFileOperations.md](useFileOperations.md)
- [useClipboard.md](useClipboard.md)
- [undo.md](undo.md)
- [drag-drop.md](drag-drop.md)
