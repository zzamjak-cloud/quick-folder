# OS 파일 클립보드 + 박스 드래그 선택 + Enter 버그 수정

## 날짜: 2026-02-27

## 기능 1: OS 파일 클립보드 (양방향)

### Rust 커맨드
- `write_files_to_clipboard(paths: Vec<String>)`: OS 클립보드에 파일 경로 등록
  - macOS: NSPasteboard + NSURL 배열
  - Windows: CF_HDROP + DROPFILES 구조체
- `read_files_from_clipboard() -> Vec<String>`: OS 클립보드에서 파일 경로 읽기
  - macOS: NSPasteboard.readObjectsForClasses([NSURL])
  - Windows: GetClipboardData(CF_HDROP) + DragQueryFileW

### 프론트엔드
- handleCopy: 내부 상태 + invoke('write_files_to_clipboard')
- handleCut: 내부 상태 + invoke('write_files_to_clipboard')
- handlePaste: 내부 clipboard 우선 → 없으면 invoke('read_files_from_clipboard')

## 기능 2: 박스 드래그 선택

### 구현 위치: FileGrid.tsx
- 빈 영역 mousedown → mousemove 사각형 → mouseup 확정
- 파일 카드 위 mousedown은 기존 동작 유지
- 반투명 파란색 사각형 시각화
- 일부 겹침으로 선택 판정
- Ctrl+드래그 시 기존 선택에 추가
- 5px 이상 이동해야 박스 드래그 인식

## 기능 3: F2 이름변경 Enter 버그 수정

### 원인
useRenameInput.ts handleKeyDown에서 e.stopPropagation() 미호출
→ Enter가 window 리스너까지 버블링 → openEntry() 트리거

### 수정
useRenameInput.ts에서 Enter/Escape에 e.stopPropagation() 추가
