# useFileOperations

## 역할
파일·폴더 삭제, 복제, 이름변경, 그룹화(폴더로 묶기), 압축, 픽셀화 등 파일 조작 액션을 제공한다. 압축 내부 경로는 읽기 전용으로 차단한다.

## 위치
`components/FileExplorer/hooks/useFileOperations.ts`

## 주요 함수

| 함수명 | 단축키 | Rust 명령 | 설명 |
|--------|--------|-----------|------|
| `deleteSelected()` | Delete / Backspace | `delete_items` | 선택 항목 휴지통 이동 |
| `duplicateSelected()` | Ctrl+D | `duplicate_items` | 같은 위치에 복제 |
| `groupSelected(folderName)` | Ctrl+G | `create_directory` + `move_items` | 새 폴더로 그룹화 |
| `ungroupFolder(path)` | Ctrl+Alt+G | `move_items` | 폴더 내용 꺼내기 |
| `compressToZip(paths)` | Ctrl+Shift+Z | `compress_to_zip` | ZIP 압축 |
| `extractZip(path)` | Ctrl+Shift+Alt+Z | `extract_zip` | ZIP 해제 (부분 실패 시 토스트에 실패 개수 표시) |
| `compressVideo(paths)` | Ctrl+Shift+P | `compress_video` | 비디오 압축 |
| `createFolder()` | Ctrl+Shift+N | `create_directory` | 새 폴더 생성 |
| `createMarkdownFile()` | Ctrl+Shift+M | `create_text_file` | .md 파일 생성 |

## 압축 내부 읽기 전용
- `ensureWritableContext()`가 현재 경로와 선택 경로를 검사한다.
- 아래 조건이면 쓰기 작업을 중단한다.
  - `currentPath`가 archive virtual path
  - 선택한 `paths` 중 하나라도 archive virtual path
- 사용자 메시지: `압축 내부는 읽기 전용입니다. 파일을 밖으로 꺼내서 사용하세요.`
- 이 제약은 삭제, 복제, 그룹화, 새 폴더/파일 생성, 폴더 크기 계산 등 현재 훅이 담당하는 조작 전반에 공통 적용된다.

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
- `addToast` — 성공/실패 알림

## 관련 위키
- [undo.md](undo.md)
- [../rust/commands.md](../rust/commands.md)
- [../explorer/archives.md](../explorer/archives.md)
