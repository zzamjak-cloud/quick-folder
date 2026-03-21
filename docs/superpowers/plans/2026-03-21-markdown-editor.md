# 마크다운 편집기 구현 계획

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 파일 탐색기에서 .md 파일을 생성하고 WYSIWYG로 편집할 수 있는 내장 마크다운 편집기 추가

**Architecture:** Rust 백엔드에 파일 생성/쓰기 커맨드 추가, React `contentEditable` 기반 편집기 모달 컴포넌트 신규 생성, marked/turndown으로 MD↔HTML 변환, 디바운스 자동 저장 + Ctrl+S 수동 저장

**Tech Stack:** Tauri 2.x (Rust), React 19, TypeScript, marked, turndown, TailwindCSS

**Spec:** `docs/superpowers/specs/2026-03-21-markdown-editor-design.md`

---

## Chunk 1: Rust 백엔드 + 타입 + 상태 기반

### Task 1: Rust 백엔드에 파일 생성/쓰기 커맨드 추가

**Files:**
- Modify: `src-tauri/src/lib.rs:820-823` (create_directory 근처에 추가)
- Modify: `src-tauri/src/lib.rs:2640-2678` (invoke_handler 등록)

- [ ] **Step 1: `create_text_file` 커맨드 추가**

`lib.rs`에서 `create_directory` 함수(820줄) 바로 아래에 추가:

```rust
#[tauri::command]
async fn create_text_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.exists() {
        return Err("이미 존재하는 파일입니다".to_string());
    }
    std::fs::write(&path, "").map_err(|e| format!("파일 생성 실패: {}", e))
}
```

- [ ] **Step 2: `write_text_file` 커맨드 추가**

`create_text_file` 바로 아래에 추가:

```rust
#[tauri::command]
async fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("파일 저장 실패: {}", e))
}
```

- [ ] **Step 3: invoke_handler에 등록**

`lib.rs:2640-2678`의 `generate_handler!` 매크로에 두 커맨드 추가:

```rust
create_text_file,
write_text_file,
```

`create_directory` 아래에 추가한다.

- [ ] **Step 4: 빌드 확인**

Run: `cd src-tauri && cargo check`
Expected: 컴파일 성공

- [ ] **Step 5: 커밋**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: Rust 백엔드에 create_text_file, write_text_file 커맨드 추가"
```

---

### Task 2: UndoAction 타입에 create_file 변형 추가

**Files:**
- Modify: `types.ts:64-67` (UndoAction 타입)

- [ ] **Step 1: UndoAction에 create_file 변형 추가**

`types.ts:67`의 `move_group` 변형 뒤에 추가:

```typescript
export type UndoAction =
  | { type: 'delete'; paths: string[]; directory: string; useTrash: boolean }
  | { type: 'rename'; oldPath: string; newPath: string }
  | { type: 'move_group'; sources: string[]; createdDir: string; parentDir: string }
  | { type: 'create_file'; path: string };
```

- [ ] **Step 2: 커밋**

```bash
git add types.ts
git commit -m "feat: UndoAction에 create_file 변형 추가"
```

---

### Task 3: useModalStates에 markdownEditorPath 상태 추가

**Files:**
- Modify: `components/FileExplorer/hooks/useModalStates.ts:23-35`

- [ ] **Step 1: 상태 변수 추가**

`renamingPath` 상태(23줄) 아래에 추가:

```typescript
// 마크다운 편집기 대상 경로
const [markdownEditorPath, setMarkdownEditorPath] = useState<string | null>(null);
```

- [ ] **Step 2: return 문에 추가**

return 객체(25-35줄)에 추가:

```typescript
markdownEditorPath, setMarkdownEditorPath,
```

`renamingPath, setRenamingPath,` 아래에 추가한다.

- [ ] **Step 3: 커밋**

```bash
git add components/FileExplorer/hooks/useModalStates.ts
git commit -m "feat: useModalStates에 markdownEditorPath 상태 추가"
```

---

### Task 4: useFileOperations에 handleCreateMarkdown 함수 추가

**Files:**
- Modify: `components/FileExplorer/hooks/useFileOperations.ts:94-115` (handleCreateDirectory 참고)
- Modify: `components/FileExplorer/hooks/useFileOperations.ts:345-374` (handleUndo)
- Modify: `components/FileExplorer/hooks/useFileOperations.ts:376-398` (return 문)

- [ ] **Step 1: handleCreateMarkdown 함수 추가**

`handleCreateDirectory` 함수(94-115줄) 아래에 추가. 동일한 패턴을 따른다:

```typescript
// --- 마크다운 파일 생성 ---
const handleCreateMarkdown = useCallback(async () => {
  if (!currentPath) return;
  const sep = getPathSeparator(currentPath);
  let base = '새 문서';
  let candidate = `${base}.md`;
  let counter = 2;
  const existingNames = new Set(entries.map(e => e.name));
  while (existingNames.has(candidate)) {
    candidate = `${base} ${counter++}.md`;
  }
  const newPath = `${currentPath}${sep}${candidate}`;
  try {
    await invoke('create_text_file', { path: newPath });
    undoStack.push({ type: 'create_file', path: newPath });
    await loadDirectory(currentPath);
    // 생성 후 바로 인라인 이름변경 시작
    setRenamingPath(newPath);
    setSelectedPaths([newPath]);
  } catch (e) {
    console.error('마크다운 파일 생성 실패:', e);
  }
}, [currentPath, loadDirectory, entries, undoStack, setRenamingPath, setSelectedPaths]);
```

- [ ] **Step 2: handleUndo에 create_file 처리 추가**

`handleUndo` 함수(345-374줄)의 `move_group` 분기(356-366줄) 아래에 추가:

```typescript
} else if (action.type === 'create_file') {
  await invoke('delete_items', { paths: [action.path], useTrash: true });
  showCopyToast('파일 생성 취소됨');
}
```

- [ ] **Step 3: return 문에 handleCreateMarkdown 추가**

return 객체(376-398줄)에서 `handleCreateDirectory,` 아래에 추가:

```typescript
handleCreateMarkdown,
```

- [ ] **Step 4: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 타입 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add components/FileExplorer/hooks/useFileOperations.ts
git commit -m "feat: handleCreateMarkdown + create_file Undo 지원 추가"
```

---

## Chunk 2: 컨텍스트 메뉴 + 키보드 단축키

### Task 5: 빈 공간 컨텍스트 메뉴에 "마크다운" 항목 추가

**Files:**
- Modify: `components/FileExplorer/index.tsx:559-754` (contextMenuSections 빌더)

- [ ] **Step 1: import에 FolderPlus, FileText 아이콘 추가**

index.tsx 상단의 lucide-react import에 `FolderPlus`, `FileText` 추가. 이미 있는지 확인 후 없으면 추가.

- [ ] **Step 2: 빈 공간 전용 섹션 추가**

`contextMenuSections` 빌더(559줄)에서, 섹션 5(infoSection) 아래, `return sections;`(745줄) 앞에 빈 공간 전용 항목을 추가:

```typescript
// 섹션 6: 빈 공간 전용 (새로 만들기)
if (paths.length === 0) {
  const createSection: ContextMenuSection = { id: 'create', items: [] };
  createSection.items.push({
    id: 'new-folder',
    icon: <FolderPlus size={13} />,
    label: '새 폴더',
    onClick: () => fileOps.handleCreateDirectory(),
    shortcut: '',
  });
  createSection.items.push({
    id: 'new-markdown',
    icon: <FileText size={13} />,
    label: '마크다운',
    onClick: () => fileOps.handleCreateMarkdown(),
  });
  sections.push(createSection);
}
```

- [ ] **Step 3: useMemo deps에 fileOps.handleCreateMarkdown 추가**

`contextMenuSections`의 의존성 배열(746-754줄)에 `fileOps.handleCreateMarkdown,` 추가:

```typescript
], [
    contextMenu, entries, clipboardHook.clipboard, folderTags,
    openEntry, openInOsExplorer, preview.handlePreviewImage,
    clipboardHook.handleCopy, clipboardHook.handleCut, clipboardHook.handlePaste, fileOps.handleDuplicate,
    fileOps.handleRenameStart, fileOps.handleBulkRename, fileOps.handleDelete,
    fileOps.handleCompressZip, fileOps.handleCompressVideo, fileOps.handleCopyPath,
    fileOps.handleSpritePack, fileOps.handleCreateDirectory, fileOps.handleCreateMarkdown,
    handleAddTag, handleRemoveTag,
    onAddToFavorites, modals.setPixelatePath, modals.setSheetUnpackPath,
  ]);
```

- [ ] **Step 4: 커밋**

```bash
git add components/FileExplorer/index.tsx
git commit -m "feat: 빈 공간 우클릭 메뉴에 마크다운 파일 생성 항목 추가"
```

---

### Task 6: Enter 키로 .md 파일 열기

**Files:**
- Modify: `components/FileExplorer/hooks/useKeyboardShortcuts.ts:240-253` (Enter 키 핸들러)

- [ ] **Step 1: Enter 키 핸들러에 .md 분기 추가**

기존 Enter 핸들러(240-253줄)를 수정. `openEntry(entry)` 호출 전에 .md 파일 체크 분기를 추가:

```typescript
if (e.key === 'Enter') {
  if (viewMode === 'columns') {
    const col = columnView.columns[columnView.focusedCol];
    if (col) {
      const entry = col.entries[columnView.focusedRow];
      if (entry) {
        e.preventDefault();
        // .md 파일이면 편집기로 열기
        if (!entry.is_dir && /\.md$/i.test(entry.name)) {
          modals.setMarkdownEditorPath(entry.path);
        } else {
          openEntry(entry);
        }
        return;
      }
    }
  } else if (selectedPaths.length === 1) {
    const entry = entries.find(en => en.path === selectedPaths[0]);
    if (entry) {
      e.preventDefault();
      // .md 파일이면 편집기로 열기
      if (!entry.is_dir && /\.md$/i.test(entry.name)) {
        modals.setMarkdownEditorPath(entry.path);
      } else {
        openEntry(entry);
      }
      return;
    }
  }
  return;
}
```

- [ ] **Step 2: useKeyboardShortcuts에 setMarkdownEditorPath 인자 추가**

`UseKeyboardShortcutsConfig` 인터페이스에 추가:
```typescript
setMarkdownEditorPath: (path: string | null) => void;
```

훅 내부 구조분해에 `setMarkdownEditorPath` 추가.

`index.tsx`의 `useKeyboardShortcuts()` 호출 사이트에 전달:
```typescript
setMarkdownEditorPath: modals.setMarkdownEditorPath,
```

Enter 핸들러 내부에서 `modals.setMarkdownEditorPath` 대신 `setMarkdownEditorPath`로 호출.

- [ ] **Step 3: 커밋**

```bash
git add components/FileExplorer/hooks/useKeyboardShortcuts.ts
git commit -m "feat: Enter 키로 .md 파일을 마크다운 편집기로 열기"
```

---

## Chunk 3: 마크다운 편집기 컴포넌트

### Task 7: 라이브러리 설치

**Files:**
- Modify: `package.json`

- [ ] **Step 1: marked, turndown 설치**

```bash
npm install marked turndown
npm install -D @types/turndown
```

`marked`는 자체 타입 포함이므로 `@types/marked` 불필요.

- [ ] **Step 2: 커밋**

```bash
git add package.json package-lock.json
git commit -m "deps: marked, turndown 라이브러리 설치"
```

---

### Task 8: MarkdownEditor.tsx 컴포넌트 구현

**Files:**
- Create: `components/FileExplorer/MarkdownEditor.tsx`

이 파일은 독립 모달로 구현한다 (ModalShell 미사용 — ESC 차단 + 푸터 불필요).

- [ ] **Step 1: 컴포넌트 기본 골격 작성**

```typescript
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { ThemeVars } from '../../types';
import { getFileName } from '../../utils/pathUtils';

interface MarkdownEditorProps {
  path: string;
  themeVars: ThemeVars;
  onClose: () => void;
}

type SaveStatus = 'saved' | 'saving' | 'unsaved';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ path, themeVars, onClose }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [loading, setLoading] = useState(true);
  const fileName = getFileName(path);

  // --- 파일 로드 ---
  useEffect(() => {
    (async () => {
      try {
        const content = await invoke<string>('read_text_file', { path, maxBytes: 1048576 });
        if (editorRef.current) {
          // marked는 비동기 가능하므로 Promise로 처리
          const html = await marked(content);
          editorRef.current.innerHTML = html || '<p><br></p>';
        }
      } catch {
        if (editorRef.current) {
          editorRef.current.innerHTML = '<p><br></p>';
        }
      }
      setLoading(false);
    })();
  }, [path]);

  // --- 저장 함수 ---
  const save = useCallback(async () => {
    if (!editorRef.current) return;
    setSaveStatus('saving');
    const html = editorRef.current.innerHTML;
    const md = turndown.turndown(html);
    try {
      await invoke('write_text_file', { path, content: md });
      setSaveStatus('saved');
    } catch (e) {
      console.error('저장 실패:', e);
      setSaveStatus('unsaved');
    }
  }, [path]);

  // --- 디바운스 자동 저장 ---
  const scheduleSave = useCallback(() => {
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(), 1500);
  }, [save]);

  // --- Ctrl+S 수동 저장 ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        save();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [save]);

  // --- 닫기 시 미저장 내용 flush ---
  const handleClose = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      // 저장 완료 후 닫기
      save().then(onClose);
    } else {
      onClose();
    }
  }, [save, onClose]);

  // --- 서식 명령 ---
  const execFormat = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    scheduleSave();
  }, [scheduleSave]);

  const insertChecklist = useCallback(() => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, '<ul><li><input type="checkbox" disabled> </li></ul>');
    scheduleSave();
  }, [scheduleSave]);

  const insertCodeBlock = useCallback(() => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, '<pre><code>코드</code></pre>');
    scheduleSave();
  }, [scheduleSave]);

  // --- 서식 버튼 정의 ---
  const toolbarButtons = [
    { label: 'B', title: '굵게', action: () => execFormat('bold'), style: { fontWeight: 'bold' } as React.CSSProperties },
    { label: 'I', title: '기울임', action: () => execFormat('italic'), style: { fontStyle: 'italic' } as React.CSSProperties },
    { type: 'separator' as const },
    { label: 'H1', title: '제목 1', action: () => execFormat('formatBlock', '<h1>') },
    { label: 'H2', title: '제목 2', action: () => execFormat('formatBlock', '<h2>') },
    { label: 'H3', title: '제목 3', action: () => execFormat('formatBlock', '<h3>') },
    { type: 'separator' as const },
    { label: '•', title: '순서 없는 목록', action: () => execFormat('insertUnorderedList') },
    { label: '1.', title: '순서 있는 목록', action: () => execFormat('insertOrderedList') },
    { label: '☐', title: '체크리스트', action: () => insertChecklist() },
    { type: 'separator' as const },
    { label: '</>', title: '코드 블록', action: () => insertCodeBlock() },
    { label: '──', title: '구분선', action: () => execFormat('insertHorizontalRule') },
  ];

  const statusText = saveStatus === 'saved' ? '저장됨' : saveStatus === 'saving' ? '저장 중...' : '미저장';
  const statusColor = saveStatus === 'saved' ? '#6b9' : saveStatus === 'saving' ? '#db8' : '#f87171';

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
    >
      <div
        className="flex flex-col rounded-lg shadow-2xl overflow-hidden"
        style={{
          width: '90vw',
          height: '90vh',
          backgroundColor: themeVars?.surface ?? '#1e1e2e',
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
        }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-4 py-2 shrink-0"
          style={{
            borderBottom: `1px solid ${themeVars?.border ?? '#334155'}`,
            backgroundColor: themeVars?.surface2 ?? '#252540',
          }}
        >
          <span style={{ color: themeVars?.textSecondary ?? '#aaa', fontSize: 13 }}>
            📄 {fileName}
          </span>
          <div className="flex items-center gap-3">
            <span style={{ color: statusColor, fontSize: 12 }}>
              {saveStatus === 'saved' ? '✓' : saveStatus === 'saving' ? '⟳' : '●'} {statusText}
            </span>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-white transition-colors"
              style={{ fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
              title="닫기"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 서식 툴바 */}
        <div
          className="flex items-center gap-1 px-4 py-1.5 shrink-0 flex-wrap"
          style={{
            borderBottom: `1px solid ${themeVars?.border ?? '#334155'}`,
            backgroundColor: themeVars?.surface2 ?? '#1e1e36',
          }}
        >
          {toolbarButtons.map((btn, i) =>
            'type' in btn && btn.type === 'separator' ? (
              <div key={i} style={{ width: 1, height: 20, backgroundColor: themeVars?.border ?? '#444', margin: '0 4px' }} />
            ) : (
              <button
                key={i}
                onMouseDown={(e) => { e.preventDefault(); (btn as any).action(); }}
                title={(btn as any).title}
                className="px-2 py-0.5 rounded text-xs hover:brightness-125 transition-all"
                style={{
                  backgroundColor: themeVars?.surface ?? '#333',
                  color: themeVars?.text ?? '#ccc',
                  border: `1px solid ${themeVars?.border ?? '#444'}`,
                  cursor: 'pointer',
                  ...((btn as any).style || {}),
                }}
              >
                {(btn as any).label}
              </button>
            )
          )}
        </div>

        {/* 편집 영역 */}
        <div
          ref={editorRef}
          contentEditable={!loading}
          suppressContentEditableWarning
          onInput={scheduleSave}
          className="flex-1 overflow-y-auto outline-none"
          style={{
            padding: '20px 24px',
            color: themeVars?.text ?? '#ddd',
            fontSize: 14,
            lineHeight: 1.8,
            minHeight: 0,
          }}
        />
      </div>
    </div>
  );
};

export default React.memo(MarkdownEditor);
```

- [ ] **Step 2: 커밋**

```bash
git add components/FileExplorer/MarkdownEditor.tsx
git commit -m "feat: MarkdownEditor WYSIWYG 편집기 컴포넌트 구현"
```

---

## Chunk 4: 통합 + 마무리

### Task 9: index.tsx에 MarkdownEditor 모달 렌더링 추가

**Files:**
- Modify: `components/FileExplorer/index.tsx:1214` (글로벌 검색 모달 아래)

- [ ] **Step 1: import 추가**

index.tsx 상단에 추가:

```typescript
import MarkdownEditor from './MarkdownEditor';
```

- [ ] **Step 2: 모달 렌더링 추가**

글로벌 검색 모달(1206-1214줄) 아래에 추가:

```tsx
{/* 마크다운 편집기 */}
{modals.markdownEditorPath && (
  <MarkdownEditor
    path={modals.markdownEditorPath}
    themeVars={themeVars}
    onClose={() => {
      modals.setMarkdownEditorPath(null);
      if (currentPath) loadDirectory(currentPath);
    }}
  />
)}
```

- [ ] **Step 3: 커밋**

```bash
git add components/FileExplorer/index.tsx
git commit -m "feat: 마크다운 편집기 모달 렌더링 통합"
```

---

### Task 10: 개발 빌드 확인 + 통합 테스트

- [ ] **Step 1: TypeScript 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 2: Rust 빌드 확인**

Run: `cd src-tauri && cargo check`
Expected: 컴파일 성공

- [ ] **Step 3: 개발 서버 실행**

Run: `npm run tauri dev`
Expected: 앱 정상 시작

- [ ] **Step 4: 기능 통합 테스트**

수동 테스트 체크리스트:
1. 빈 공간 우클릭 → "마크다운" 메뉴 표시 확인
2. 클릭 시 "새 문서.md" 파일 생성 + 인라인 이름변경 확인
3. 중복 생성 시 "새 문서 2.md" 번호 증가 확인
4. .md 파일 선택 후 Enter → 편집기 팝업 열림 확인
5. .md 파일 선택 후 Space → 기존 텍스트 미리보기 확인
6. .md 파일 더블클릭 → OS 앱으로 열기 확인
7. 편집기에서 텍스트 입력 후 1.5초 후 "저장됨" 상태 확인
8. Ctrl+S/Cmd+S → 즉시 저장 확인
9. 서식 버튼(Bold, H1, 목록 등) 동작 확인
10. 외부 클릭 시 팝업 닫히지 않음 확인
11. ESC 시 팝업 닫히지 않음 확인
12. ✕ 버튼으로만 닫기 확인
13. 닫기 후 .md 파일 내용이 마크다운으로 저장되었는지 확인
14. Ctrl+Z로 파일 생성 취소 (휴지통 이동) 확인

- [ ] **Step 5: 최종 커밋**

```bash
git add -A
git commit -m "feat: 마크다운 편집기 통합 완료"
```
