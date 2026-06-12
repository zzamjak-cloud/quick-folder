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
| 폴더 용량 분석 | `calculate_folder_size` | 직계 하위 항목을 용량 내림차순으로 반환 |
| 휴지통 복원 | `restore_trash_items` | Undo용 |
| 중복 확인 | `check_duplicate_items` | 붙여넣기 전 |
| 스마트 폴더 병합 | `analyze_folder_merge`, `merge_folders` | 같은 이름 폴더 충돌 시 |
| ZIP 압축 | `compress_to_zip` | `Ctrl+Shift+Z` |
| ZIP 해제 | `extract_zip` | `Ctrl+Shift+Alt+Z` |

## 압축 내부 제한
`useFileOperations.ts`는 archive virtual path를 읽기 전용으로 취급한다.

- 현재 경로가 압축 내부이거나, 선택 경로 중 하나라도 압축 내부면 쓰기 작업을 막는다.
- 차단 메시지: `압축 내부는 읽기 전용입니다. 파일을 밖으로 꺼내서 사용하세요.`
- 압축 내부 항목을 밖으로 꺼내는 흐름은 [drag-drop.md](drag-drop.md)와 [../explorer/archives.md](../explorer/archives.md)를 본다.

### ZIP 해제 회귀 방지 (Windows)

`extract_zip`(`src-tauri/src/modules/file_ops.rs`)는 ZIP 항목명을 그대로 디스크 경로로 쓰면 안 된다.

- **경로 컴포넌트 끝의 공백·점은 반드시 제거**한다(`sanitize_zip_entry_component`). Windows 는 폴더 생성 시 끝 공백/점을 자동으로 잘라내지만, 그 컴포넌트가 하위 파일 경로의 *중간 요소*로 쓰일 때는 잘리지 않아 `ERROR_PATH_NOT_FOUND`(os error 3)가 난다. → Notion 내보내기처럼 제목이 공백으로 끝나는 폴더(`...for /a.png`)에서 일부 파일만 풀리던 버그의 원인.
- Windows 예약 문자(`< > : " | ? *`)·제어문자·예약 장치명(CON/PRN/NUL/COM1~9/LPT1~9)도 치환한다.
- 항목별 실패는 `?`로 전체 중단하지 말고 `ExtractResult.failed`에 모아 계속 진행한다. 프론트(`useFileOperations.ts`)는 부분 실패 시 토스트에 실패 개수를 표시한다.

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
- [../explorer/archives.md](../explorer/archives.md)
