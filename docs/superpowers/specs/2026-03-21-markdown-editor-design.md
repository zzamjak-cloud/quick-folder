# 마크다운 편집기 디자인

## 개요

QuickFolder 파일 탐색기에 내장 마크다운 편집기를 추가한다. 사용자가 탐색기 내에서 .md 파일을 생성하고, WYSIWYG 방식으로 편집할 수 있다. 주 용도는 AI에게 제공할 계획 문서를 간편하게 작성하는 것이다.

## 기능 흐름

### 파일 생성

1. 탐색기 빈 공간에서 우클릭 → 컨텍스트 메뉴에 "마크다운" 항목
2. 클릭 시 현재 디렉토리에 "새 문서.md" 파일 생성
3. 중복 시 "새 문서 2.md", "새 문서 3.md" 등 자동 번호 부여
4. 생성 즉시 인라인 이름변경 모드 진입 (기존 폴더 생성 패턴과 동일)
5. Undo 스택에 `create_file` 액션 push → Ctrl+Z로 생성 취소 가능 (휴지통으로 이동)

### 파일 열기

- .md 파일 선택 후 **Enter** → 편집기 팝업 열림
- .md 파일 선택 후 **Space** → 기존 텍스트 미리보기 (읽기 전용, 변경 없음)
- .md 파일 **더블클릭** → 기존 동작 유지 (OS 기본 앱으로 열기). `openEntry` 함수는 변경하지 않음.

### 편집기 팝업

- **크기**: 화면 90% (너비, 높이 모두)
- **닫기 동작**: 외부 클릭으로 닫히지 않음. ESC로도 닫히지 않음. 오직 닫기 버튼(✕)으로만 닫기.
- **닫기 시 저장 보장**: 닫기 버튼 클릭 시 pending 디바운스 타이머가 있으면 즉시 flush하여 저장 완료 후 닫기.
- **헤더**: 파일명 표시 + 저장 상태 ("저장됨" / "저장 중...") + 닫기 버튼
- **서식 툴바**: Bold, Italic | H1, H2, H3 | UL, OL, Checklist | Code, 구분선
- **편집 영역**: `contentEditable` 기반 기본 리치 텍스트 WYSIWYG
- **자동 저장**: 타이핑 멈춘 후 1.5초 디바운스 자동 저장
- **수동 저장**: Ctrl+S(macOS: Cmd+S) 즉시 저장

## 기술 구조

### Rust 백엔드 (lib.rs)

신규 커맨드 2개:

```rust
#[tauri::command]
async fn create_text_file(path: String) -> Result<(), String>
```
- 빈 텍스트 파일 생성
- 이미 존재하면 에러 반환

```rust
#[tauri::command]
async fn write_text_file(path: String, content: String) -> Result<(), String>
```
- 텍스트 파일에 내용 쓰기 (덮어쓰기)
- 편집기 저장 시 호출

### 프론트엔드 신규 파일

**`components/FileExplorer/MarkdownEditor.tsx`**

독립 모달 컴포넌트 (ModalShell 미사용). ModalShell은 ESC 닫기가 내장되어 있고 하단 취소/저장 푸터가 고정이므로, 편집기의 "ESC 차단 + 자동 저장" 요구사항과 맞지 않아 독립 구현한다. (PreviewModals.tsx와 동일한 패턴)

Props:
- `path: string` — 편집 대상 .md 파일 경로
- `themeVars: ThemeVars` — 테마 변수
- `onClose: () => void` — 닫기 콜백

내부 동작:
1. 마운트 시 `read_text_file(path, 1048576)`로 파일 내용 로드 (최대 1MB)
2. `marked` 라이브러리로 MD → HTML 변환 후 `contentEditable` div에 렌더링
3. 서식 버튼 클릭 시 Selection API + `document.execCommand()` 조합으로 서식 적용
4. 내용 변경 시 1.5초 디바운스 후 `turndown`으로 HTML → MD 변환, `write_text_file`로 저장
5. Ctrl+S/Cmd+S 시 즉시 저장
6. 디바운스 타이머는 `useRef`로 추적하여 닫기 시 flush 가능

### 서식 적용 방식

`document.execCommand()`는 deprecated이지만, 기본 리치 텍스트 서식(bold, italic, heading, list)에는 여전히 안정적으로 동작한다. Tauri의 WebView(macOS Safari WebKit / Windows WebView2)에서 모두 지원된다.

단, `execCommand`가 동작하지 않는 경우를 대비하여:
- Selection API로 현재 선택 범위를 확인한 후 `execCommand` 호출
- 체크리스트와 코드 블록은 Selection API + `insertHTML`로 커스텀 구현
- 향후 문제 발생 시 Tiptap 같은 라이브러리로 교체 가능하도록 서식 로직을 분리

### 마크다운 변환 라이브러리

- **`marked`** (~20KB) — MD → HTML 변환 (파일 로드 시)
- **`turndown`** (~20KB) — HTML → MD 변환 (파일 저장 시)

### 모달 상태 관리 (useModalStates.ts)

```typescript
const [markdownEditorPath, setMarkdownEditorPath] = useState<string | null>(null);
```
- `null`: 편집기 닫힘
- `string`: 편집 대상 파일 경로 → 편집기 열림

### 컨텍스트 메뉴 변경 (index.tsx)

빈 공간 우클릭 시 (`paths.length === 0`) 섹션에 "마크다운" 항목 추가:
```typescript
{
  label: '마크다운',
  icon: FileText,  // lucide-react 아이콘
  action: handleCreateMarkdown,
}
```

### 키보드 단축키 변경 (useKeyboardShortcuts.ts)

Enter 키 핸들러에 .md 파일 분기 추가:
```
선택 파일이 .md → modals.setMarkdownEditorPath(path)
그 외 → 기존 동작 (폴더 진입 / 파일 실행)
```

더블클릭 경로(`FileCard.tsx`의 `onOpen` → `openEntry`)는 변경하지 않는다. 더블클릭은 항상 OS 기본 앱으로 열기.

### 파일 생성 로직 (useFileOperations.ts)

`handleCreateMarkdown` 함수 추가:
1. "새 문서.md" 후보명 결정 (중복 시 번호 증가)
2. `create_text_file` 호출
3. `undoStack.push({ type: 'create_file', path })` — Undo 지원
4. `loadDirectory()` 후 인라인 이름변경 모드 진입

`UseFileOperationsConfig` 인터페이스에 `setMarkdownEditorPath` 추가 불필요 — 파일 생성은 편집기를 열지 않고 인라인 이름변경만 시작하므로 기존 `setRenamingPath`만 사용.

### Undo 지원 (types.ts)

`UndoAction` 타입에 `create_file` 변형 추가:
```typescript
| { type: 'create_file'; path: string }
```
- 복원 시: `delete_items([path], true)` 호출 (휴지통으로 이동 — 기존 delete Undo 패턴과 일관)

### 렌더링 (index.tsx)

```jsx
{modals.markdownEditorPath && (
  <MarkdownEditor
    path={modals.markdownEditorPath}
    themeVars={themeVars}
    onClose={() => {
      modals.setMarkdownEditorPath(null);
      loadDirectory(currentPath);
    }}
  />
)}
```

## 서식 툴바 버튼

| 버튼 | 구현 방식 | 설명 |
|------|----------|------|
| **B** | `execCommand('bold')` | 굵게 |
| *I* | `execCommand('italic')` | 기울임 |
| H1 | `execCommand('formatBlock', '<h1>')` | 제목 1 |
| H2 | `execCommand('formatBlock', '<h2>')` | 제목 2 |
| H3 | `execCommand('formatBlock', '<h3>')` | 제목 3 |
| • | `execCommand('insertUnorderedList')` | 순서 없는 목록 |
| 1. | `execCommand('insertOrderedList')` | 순서 있는 목록 |
| ☐ | Selection API + insertHTML | 체크리스트 (커스텀) |
| `</>` | Selection API + insertHTML | 코드 블록 (커스텀) |
| ── | `execCommand('insertHorizontalRule')` | 구분선 |

## 범위 외 (미포함)

- 기호 버튼 프리셋 (제외됨)
- 마크다운 렌더링 미리보기 패널 (분할 뷰 없음)
- .md 외 다른 텍스트 파일 편집
- 이미지 삽입/첨부
