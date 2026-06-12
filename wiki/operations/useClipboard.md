# useClipboard

## 역할
복사·잘라내기·붙여넣기 상태 관리. 두 패인 간 공유 클립보드와 OS 클립보드(파일·이미지) 연동을 담당한다.

## 위치
`components/FileExplorer/hooks/useClipboard.ts`

## ClipboardData 타입
```typescript
interface ClipboardData {
  paths: string[]
  action: 'copy' | 'cut'
}
```

## 내부 클립보드 (패인 간 공유)
```
App.tsx의 sharedClipboard state
  → Pane 0, Pane 1에 prop으로 전달
  → onClipboardChange로 업데이트
```

## 붙여넣기 흐름
```
Ctrl+V
  → check_duplicate_items(paths, destDir)
  → 중복 있으면 대화상자 (덮어쓰기 / 이름변경 / 취소)
  → action='copy' | 'cut' → runTransferWithProgress (작업 큐 패널)
  → loadDirectory(currentPath)
```

진행률 UI·자동 닫기: [task-queue.md](task-queue.md)

## 주요 함수
| 함수명 | 단축키 | 설명 |
|--------|--------|------|
| `copySelected()` | Ctrl+C | 내부 클립보드에 복사 등록 |
| `cutSelected()` | Ctrl+X | 내부 클립보드에 잘라내기 등록 |
| `paste(destDir)` | Ctrl+V | 클립보드 내용 붙여넣기 |
| `copyPathToClipboard(path)` | Ctrl+Alt+C | 경로 텍스트 복사 |
| `pasteImageFromClipboard(destDir)` | Ctrl+Shift+V | 클립보드 이미지 → PNG 저장 |

## OS 클립보드 Rust 명령
| 명령 | 설명 |
|------|------|
| `write_files_to_clipboard(paths)` | 파일을 OS 클립보드에 등록 |
| `read_files_from_clipboard()` | OS 클립보드 파일 목록 읽기 |
| `paste_image_from_clipboard(dest)` | 이미지 데이터 → PNG 파일 저장, 경로 반환 |
| `copy_path(path)` | 경로 텍스트 클립보드 복사 |

## 주의사항
- `cut` 후 붙여넣기 완료 시 클립보드 자동 초기화 (`sharedClipboard = null`)
- 중복 확인 대화상자는 `check_duplicate_items` 결과가 빈 배열이면 건너뜀
