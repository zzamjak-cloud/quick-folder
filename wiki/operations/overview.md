# 파일 조작 개요

## 담당 훅 (facade + 서브훅)

| 훅 | 파일 | 역할 |
|----|------|------|
| facade | `hooks/useFileOperations.ts` | public API·복제·그룹화·이름변경·픽셀화 등 |
| 삭제 | `hooks/useDeleteOperations.ts` | 삭제·영구삭제·elevated 확인 |
| 압축 | `hooks/useArchiveOperations.ts` | ZIP 압축/해제 |
| 용량 분석 | `hooks/useFolderSizeOperations.ts` | 폴더 용량 다이얼로그 |
| 폴더 로드 | `hooks/useDirectoryLoader.ts` | listDirectory·prefetch·캐시 |
| 선택 | `hooks/useExplorerSelection.ts` | Shift/Ctrl 다중 선택 |
| 미리보기 라우팅 | `hooks/usePreviewRouting.ts` | 더블클릭→미리보기/압축 |

## Frontend 호출

Rust 명령은 `tauriCommands.*` typed API로 호출한다.

```typescript
import { tauriCommands } from '../../../utils/tauriCommands';

await tauriCommands.deleteItems({ paths });
await tauriCommands.transferItemsWithProgress({ ... });
```

## Rust 명령 매핑

| 기능 | 명령 | Rust 구현 | 비고 |
|------|------|-----------|------|
| 삭제 | `delete_items` | `file_ops/mutation.rs` | 휴지통 이동 |
| 관리자 삭제 | `delete_items_elevated` | `file_ops/mutation.rs` | 권한 필요 시 |
| 복사 | `copy_items` | `file_ops/transfer/` | |
| 복사(진행률) | `copy_items_with_progress` | `file_ops/transfer/progress.rs` | 레거시 Channel API |
| 복사/이동(작업 큐) | `transfer_items_with_progress` | `file_ops/transfer/progress.rs` | [task-queue.md](task-queue.md) |
| 이동 | `move_items` | `file_ops/transfer/` | |
| 복제 | `duplicate_items` | `file_ops/transfer/duplicate.rs` | |
| 이름변경 | `rename_item` | `file_ops/mutation.rs` | 새 경로 반환 |
| 폴더 생성 | `create_directory` | `file_ops/mutation.rs` | |
| 파일 생성 | `create_text_file` | `file_ops/mutation.rs` | |
| 폴더 용량 분석 | `calculate_folder_size` | `file_ops/listing.rs` | |
| 휴지통 복원 | `restore_trash_items` | `file_ops/mutation.rs` | Undo용 |
| 중복 확인 | `check_duplicate_items` | `file_ops/transfer/` | 붙여넣기 전 |
| 스마트 폴더 병합 | `analyze_folder_merge`, `merge_folders` | `file_ops/transfer/folder_merge.rs` | |
| ZIP 압축 | `compress_to_zip` | `file_ops/archive.rs` | `Ctrl+Shift+Z` |
| ZIP 해제 | `extract_zip` | `file_ops/archive.rs` | `Ctrl+Shift+Alt+Z` |

## 압축 내부 제한
`useFileOperations.ts`는 archive virtual path를 읽기 전용으로 취급한다.

- 현재 경로가 압축 내부이거나, 선택 경로 중 하나라도 압축 내부면 쓰기 작업을 막는다.
- 차단 메시지: `압축 내부는 읽기 전용입니다. 파일을 밖으로 꺼내서 사용하세요.`
- 압축 내부 항목을 밖으로 꺼내는 흐름은 [drag-drop.md](drag-drop.md)와 [../explorer/archives.md](../explorer/archives.md)를 본다.

### ZIP 해제 회귀 방지 (Windows)

`extract_zip`(`src-tauri/src/modules/file_ops/archive.rs`)는 ZIP 항목명을 그대로 디스크 경로로 쓰면 안 된다.

- **경로 컴포넌트 끝의 공백·점은 반드시 제거**한다(`sanitize_zip_entry_component`). Windows 는 폴더 생성 시 끝 공백/점을 자동으로 잘라내지만, 그 컴포넌트가 하위 파일 경로의 *중간 요소*로 쓰일 때는 잘리지 않아 `ERROR_PATH_NOT_FOUND`(os error 3)가 난다.
- Windows 예약 문자·제어문자·예약 장치명도 치환한다.
- 항목별 실패는 `?`로 전체 중단하지 말고 `ExtractResult.failed`에 모아 계속 진행한다.

## 새 파일 조작 기능 추가 체크리스트

> **Ctrl+Z 실행취소는 필수다. 빠뜨리면 안 된다.**

1. `types.ts`의 `UndoAction` union에 variant 추가
2. 조작 성공 직후 `undoStack.push(action)` 호출
3. `FileExplorer/index.tsx`의 `handleUndo`에 복원 로직 추가
4. 복원 후 `loadDirectory(currentPath)` 호출
5. Rust 명령 → `tauriCommandDomains/fileCommands.ts`에 typed wrapper 추가

→ [undo.md](undo.md)

## 작업 큐 패널

복사·이동은 우측 하단 **Task Queue Panel**에서 파일별 진행률을 표시한다. 패널은 `components/AppModals.tsx`에 마운트된다.

→ [task-queue.md](task-queue.md)

## 관련 위키
- [useFileOperations.md](useFileOperations.md)
- [task-queue.md](task-queue.md)
- [useClipboard.md](useClipboard.md)
- [undo.md](undo.md)
- [drag-drop.md](drag-drop.md)
- [../explorer/archives.md](../explorer/archives.md)
- [../rust/overview.md](../rust/overview.md)
