# 파일 탐색기 개선 7가지 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 파일 탐색기 UX를 개선하는 7가지 변경사항 구현 (드롭다운, 툴바 이동, 썸네일 비율, 시스템 단축키, 줌, 방향키, 뷰 모드)

**Architecture:** App.tsx의 SortableShortcutItem 리팩토링, 좌측 패널 헤더 재구성, FileExplorer 컴포넌트 확장 (viewMode, focusedIndex, 단축키), NavigationBar 뷰 전환 버튼 추가, Rust quick_look 커맨드 추가.

**Tech Stack:** React 19, TypeScript, TailwindCSS, Tauri 2.x (Rust), Lucide React

**검증 명령:** `npx tsc --noEmit` (TypeScript), `cargo check` (Rust)

---

## Task 1: SortableShortcutItem — 3 버튼 → MoreVertical 드롭다운

**Files:**
- Modify: `App.tsx:116-185` (SortableShortcutItem 컴포넌트)

현재 `Edit2`, `Copy`, `Trash2` 버튼 3개를 `MoreVertical` 아이콘 1개 + 드롭다운으로 교체한다.

**Step 1: SortableShortcutItem 함수 전체를 아래 코드로 교체**

`App.tsx`의 `function SortableShortcutItem(...)` 전체(94번 줄~185번 줄)를 다음으로 교체:

```tsx
function SortableShortcutItem({ shortcut, categoryId, handleOpenFolder, handleCopyPath, deleteShortcut, openEditFolderModal }: SortableShortcutItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: shortcut.id,
    data: {
      type: 'Shortcut',
      shortcut,
      categoryId
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // 외부 클릭 시 메뉴 닫기
  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group/item flex items-center justify-between p-2 rounded-lg transition-colors border border-transparent bg-[var(--qf-surface)] hover:bg-[var(--qf-surface-hover)] hover:border-[var(--qf-border)]"
      {...attributes}
      {...listeners}
    >
      <div
        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
        onClick={() => handleOpenFolder(shortcut.path)}
        title={`${shortcut.path} (클릭하여 탐색기에서 열기)`}
      >
        <div className="text-[var(--qf-accent)] transition-colors">
          <Folder size={16} />
        </div>
        <div className="min-w-0">
          <div
            className="text-sm font-medium group-hover/item:opacity-80 truncate"
            style={{
              color:
                shortcut.color?.startsWith('#')
                  ? shortcut.color
                  : (shortcut.color && LEGACY_TEXT_CLASS_TO_HEX[shortcut.color]) || undefined,
            }}
          >
            {shortcut.name}
          </div>
        </div>
      </div>

      {/* MoreVertical 드롭다운 */}
      <div
        className="relative opacity-0 group-hover/item:opacity-100 transition-opacity"
        ref={menuRef}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-1.5 text-[var(--qf-muted)] hover:text-[var(--qf-text)] hover:bg-[var(--qf-surface-hover)] rounded-md"
          title="더 보기"
        >
          <MoreVertical size={13} />
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-xl overflow-hidden min-w-[130px]"
            style={{
              backgroundColor: 'var(--qf-surface-2)',
              border: '1px solid var(--qf-border)',
            }}
          >
            {[
              {
                icon: <Edit2 size={12} />,
                label: '수정',
                onClick: () => { openEditFolderModal(categoryId, shortcut); setMenuOpen(false); },
              },
              {
                icon: <Copy size={12} />,
                label: '경로 복사',
                onClick: () => { handleCopyPath(shortcut.path); setMenuOpen(false); },
              },
              {
                icon: <Trash2 size={12} style={{ color: '#f87171' }} />,
                label: '삭제',
                onClick: () => { deleteShortcut(categoryId, shortcut.id); setMenuOpen(false); },
              },
            ].map(item => (
              <button
                key={item.label}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); item.onClick(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-[var(--qf-surface-hover)] text-[var(--qf-text)]"
              >
                <span className="text-[var(--qf-muted)]">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
```

**Step 2: TypeScript 확인**
```bash
npx tsc --noEmit
```
예상: 에러 없음

**Step 3: 커밋**
```bash
git add App.tsx
git commit -m "refactor: SortableShortcutItem 버튼 3개를 MoreVertical 드롭다운으로 교체"
```

---

## Task 2: 툴바 → 좌측 패널 상단 헤더로 이동

**Files:**
- Modify: `App.tsx` (렌더 부분 — 툴바 div와 좌측 패널 div)

**Step 1: 상단 툴바 div 제거**

`App.tsx` 렌더 부분에서 다음 블록을 찾아 제거:

```tsx
      {/* Toolbar: [검색][돋보기(줌)][팔레트][+] */}
      <div className="flex-shrink-0 px-4 py-2 flex items-center gap-2 border-b border-[var(--qf-border)]">
        ...
      </div>
```

**Step 2: 좌측 패널 div에 헤더 추가**

```tsx
<div style={{ width: leftPanelWidth }} className="flex-shrink-0 overflow-y-auto">
```

를 다음으로 교체:

```tsx
<div style={{ width: leftPanelWidth }} className="flex-shrink-0 flex flex-col overflow-hidden">
  {/* 좌측 패널 상단 헤더 */}
  <div className="flex-shrink-0 px-3 pt-3 pb-2 flex flex-col gap-2 border-b border-[var(--qf-border)]">
    {/* 검색 */}
    <input
      type="text"
      placeholder="검색..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="bg-[var(--qf-surface)] border border-[var(--qf-border)] text-[var(--qf-text)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--qf-accent)] w-full transition-all placeholder:text-[var(--qf-muted)]"
    />
    {/* 줌/테마/카테고리 추가 */}
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--qf-muted)] font-medium">즐겨찾기</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setIsZoomModalOpen(true)}
          className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)]"
          title="확대/축소"
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          onClick={() => setIsBgModalOpen(true)}
          className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)]"
          title="테마 설정"
        >
          <Palette size={14} />
        </button>
        <button
          type="button"
          onClick={openAddCategoryModal}
          className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)]"
          title="카테고리 추가"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  </div>
  {/* 스크롤 가능한 카테고리 목록 */}
  <div className="flex-1 overflow-y-auto p-4">
```

그리고 DndContext 닫힘 직전에 `</div>` 추가 (스크롤 영역 닫기).

**Step 3: root div에서 `h-screen overflow-hidden flex flex-col` 유지 확인**

**Step 4: TypeScript 확인**
```bash
npx tsc --noEmit
```
예상: 에러 없음

**Step 5: 커밋**
```bash
git add App.tsx
git commit -m "refactor: 툴바를 좌측 사이드바 상단으로 이동"
```

---

## Task 3: 썸네일 object-contain으로 변경

**Files:**
- Modify: `components/FileExplorer/FileCard.tsx:184`

**Step 1: 한 줄 수정**

```tsx
// 변경 전
className="w-full h-full object-cover"

// 변경 후
className="w-full h-full object-contain"
```

**Step 2: TypeScript 확인**
```bash
npx tsc --noEmit
```

**Step 3: 커밋**
```bash
git add components/FileExplorer/FileCard.tsx
git commit -m "fix: 썸네일 이미지 object-contain으로 변경 (비율 유지)"
```

---

## Task 4: Quick Look Rust 커맨드 추가

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: quick_look 커맨드 추가**

`rename_item` 커맨드 다음에 추가:

```rust
// macOS Quick Look 실행 (qlmanage -p <path>)
#[tauri::command]
fn quick_look(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("qlmanage")
            .args(["-p", &path])
            .spawn()
            .map_err(|e| format!("Quick Look 실행 실패: {}", e))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        // macOS 외 플랫폼에서는 기본 앱으로 열기
        opener::open(&path).map_err(|e| format!("파일 열기 실패: {}", e))?;
    }
    Ok(())
}
```

**Step 2: invoke_handler에 등록**

```rust
    .invoke_handler(tauri::generate_handler![
        open_folder,
        copy_path,
        select_folder,
        list_directory,
        get_file_thumbnail,
        copy_items,
        move_items,
        delete_items,
        create_directory,
        rename_item,
        quick_look,  // 추가
    ])
```

**Step 3: Rust 컴파일 확인**
```bash
cd src-tauri && cargo check
```
예상: Finished

**Step 4: 커밋**
```bash
git add src-tauri/src/lib.rs
git commit -m "feat: macOS Quick Look 커맨드 추가"
```

---

## Task 5: 시스템 단축키 + Ctrl+줌 + 방향키 — FileExplorer index.tsx

**Files:**
- Modify: `components/FileExplorer/index.tsx`

### 5-A: viewMode, focusedIndex 상태 추가

기존 `useState` 선언부 끝에 추가:

```typescript
const [viewMode, setViewMode] = useState<'grid' | 'list' | 'details'>('grid');
const [focusedIndex, setFocusedIndex] = useState<number>(-1);
const gridRef = useRef<HTMLDivElement>(null);
```

### 5-B: handleKeyDown 전체 교체

현재 `handleKeyDown` 함수(278번 줄~320번 줄)를 다음으로 교체:

```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  if (renamingPath) return;
  // 입력 필드 안에서는 무시 (단, Escape는 허용)
  const active = document.activeElement;
  const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  if (isInput && e.key !== 'Escape') return;

  const ctrl = e.ctrlKey || e.metaKey;
  const isMac = navigator.platform.startsWith('Mac');

  // --- 내비게이션 ---
  if (isMac) {
    // macOS 시스템 단축키
    if (ctrl && e.key === '[') { e.preventDefault(); goBack(); return; }
    if (ctrl && e.key === ']') { e.preventDefault(); goForward(); return; }
    if (ctrl && e.key === 'ArrowUp') { e.preventDefault(); goUp(); return; }
    if ((ctrl && e.key === 'ArrowDown') || e.key === 'Enter') {
      if (selectedPaths.length === 1) {
        const entry = entries.find(en => en.path === selectedPaths[0]);
        if (entry) { e.preventDefault(); openEntry(entry); return; }
      }
    }
  } else {
    // Windows/Linux
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); return; }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); return; }
    if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); goUp(); return; }
    if (e.key === 'Enter') {
      if (selectedPaths.length === 1) {
        const entry = entries.find(en => en.path === selectedPaths[0]);
        if (entry) { e.preventDefault(); openEntry(entry); return; }
      }
    }
  }

  if (e.key === 'Backspace') { e.preventDefault(); goBack(); return; }

  // --- Quick Look (Spacebar) ---
  if (e.key === ' ' && selectedPaths.length === 1) {
    e.preventDefault();
    invoke('quick_look', { path: selectedPaths[0] }).catch(console.error);
    return;
  }

  // --- 탐색기 줌 (Ctrl +/-) ---
  if (ctrl && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    setThumbnailSize(prev => prev === 80 ? 120 : prev === 120 ? 160 : 160);
    return;
  }
  if (ctrl && e.key === '-') {
    e.preventDefault();
    setThumbnailSize(prev => prev === 160 ? 120 : prev === 120 ? 80 : 80);
    return;
  }
  if (ctrl && e.key === '0') {
    e.preventDefault();
    setThumbnailSize(120);
    return;
  }

  // --- 파일 조작 ---
  if (ctrl && e.key === 'a') { e.preventDefault(); selectAll(); return; }
  if (ctrl && e.key === 'c') { handleCopy(); return; }
  if (ctrl && e.key === 'x') { handleCut(); return; }
  if (ctrl && e.key === 'v') { handlePaste(); return; }
  if (ctrl && e.shiftKey && e.key === 'N') { e.preventDefault(); handleCreateDirectory(); return; }

  if (e.key === 'F2') {
    if (selectedPaths.length === 1) handleRenameStart(selectedPaths[0]);
    return;
  }

  if (e.key === 'Delete' || (isMac && ctrl && e.key === 'Backspace')) {
    if (e.shiftKey) {
      handleDelete(selectedPaths, true);
    } else {
      handleDelete(selectedPaths, false);
    }
    return;
  }

  // --- 방향키 포커스 이동 ---
  if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
    e.preventDefault();
    if (entries.length === 0) return;

    // 그리드 너비 기반 열 수 계산
    const cols = (() => {
      if (!gridRef.current) return 4;
      const cardWidth = thumbnailSize + 16 + 8; // width + padding + gap
      return Math.max(1, Math.floor(gridRef.current.clientWidth / cardWidth));
    })();

    const current = focusedIndex < 0 ? -1 : focusedIndex;
    let next = current;

    if (e.key === 'ArrowRight') next = Math.min(entries.length - 1, current + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, current - 1);
    else if (e.key === 'ArrowDown') next = Math.min(entries.length - 1, current + cols);
    else if (e.key === 'ArrowUp') next = Math.max(0, current - cols);

    if (next < 0) next = 0;
    setFocusedIndex(next);
    setSelectedPaths([entries[next].path]);
    return;
  }
};
```

### 5-C: useEffect 의존성 배열 업데이트

`handleKeyDown`을 등록하는 useEffect의 의존성 배열에 추가:
```typescript
  }, [
    renamingPath, selectAll, handleCopy, handleCut, handlePaste,
    handleCreateDirectory, handleRenameStart, handleDelete,
    goBack, goForward, goUp, selectedPaths, entries, openEntry,
    thumbnailSize, focusedIndex,  // 추가
  ]);
```

### 5-D: entries 변경 시 focusedIndex 초기화

```typescript
// loadDirectory 완료 시 focusedIndex 초기화
const loadDirectory = useCallback(async (path: string) => {
  // ... 기존 코드 ...
  setFocusedIndex(-1);  // 추가
}, [...]);
```

### 5-E: viewMode, focusedIndex, gridRef를 하위 컴포넌트에 전달

FileGrid 렌더링 부분 업데이트:
```tsx
<FileGrid
  entries={entries}
  selectedPaths={selectedPaths}
  renamingPath={renamingPath}
  thumbnailSize={thumbnailSize}
  viewMode={viewMode}           // 추가
  focusedIndex={focusedIndex}   // 추가
  gridRef={gridRef}             // 추가
  loading={loading}
  error={error}
  onSelect={selectEntry}
  onOpen={openEntry}
  onContextMenu={handleContextMenu}
  onRenameCommit={handleRenameCommit}
  themeVars={themeVars}
/>
```

NavigationBar에 viewMode 전달:
```tsx
<NavigationBar
  ...
  viewMode={viewMode}           // 추가
  onViewModeChange={setViewMode} // 추가
  ...
/>
```

**Step 2: TypeScript 확인**
```bash
npx tsc --noEmit
```

**Step 3: 커밋**
```bash
git add components/FileExplorer/index.tsx
git commit -m "feat: 시스템 단축키, Quick Look, Ctrl+줌, 방향키 포커스 이동 추가"
```

---

## Task 6: NavigationBar — 뷰 전환 버튼 추가

**Files:**
- Modify: `components/FileExplorer/NavigationBar.tsx`

**Step 1: Props 인터페이스 업데이트**

```typescript
interface NavigationBarProps {
  // ... 기존 props ...
  viewMode: 'grid' | 'list' | 'details';
  onViewModeChange: (mode: 'grid' | 'list' | 'details') => void;
}
```

**Step 2: 새 import 추가**

```typescript
import { ..., List, Table2 } from 'lucide-react';
```

**Step 3: 뷰 전환 버튼 추가**

정렬 드롭다운 앞에 추가:

```tsx
{/* 뷰 전환 버튼 */}
<div className="flex items-center gap-0.5 rounded-md overflow-hidden" style={{ border: `1px solid ${themeVars?.border ?? '#334155'}` }}>
  {([
    { mode: 'grid' as const, icon: <LayoutGrid size={13} />, title: '그리드 뷰' },
    { mode: 'list' as const, icon: <List size={13} />, title: '리스트 뷰' },
    { mode: 'details' as const, icon: <Table2 size={13} />, title: '세부사항 뷰' },
  ]).map(({ mode, icon, title }) => (
    <button
      key={mode}
      className="p-1.5 transition-colors"
      style={{
        backgroundColor: viewMode === mode ? themeVars?.accent20 : 'transparent',
        color: viewMode === mode ? themeVars?.accent : themeVars?.muted,
      }}
      onClick={() => onViewModeChange(mode)}
      title={title}
    >
      {icon}
    </button>
  ))}
</div>
```

그리고 기존 `thumbnailSize` 드롭다운은 Grid 뷰일 때만 표시:
```tsx
{viewMode === 'grid' && (
  <div className="relative" ref={sizeMenuRef}>
    ...
  </div>
)}
```

**Step 4: TypeScript 확인**
```bash
npx tsc --noEmit
```

**Step 5: 커밋**
```bash
git add components/FileExplorer/NavigationBar.tsx
git commit -m "feat: NavigationBar에 그리드/리스트/세부사항 뷰 전환 버튼 추가"
```

---

## Task 7: FileGrid — viewMode 분기 렌더링

**Files:**
- Modify: `components/FileExplorer/FileGrid.tsx`
- Modify: `components/FileExplorer/FileCard.tsx`

### 7-A: FileGrid Props 업데이트

```typescript
interface FileGridProps {
  // ... 기존 ...
  viewMode: 'grid' | 'list' | 'details';
  focusedIndex: number;
  gridRef: React.RefObject<HTMLDivElement>;
}
```

### 7-B: FileGrid 렌더링 분기

파일 목록 렌더링 부분을 다음으로 교체:

```tsx
return (
  <div
    ref={gridRef}
    className="flex-1 overflow-y-auto p-3"
    style={{ backgroundColor: themeVars?.bg ?? '#0f172a' }}
  >
    {viewMode === 'grid' && (
      <div className="flex flex-wrap gap-2 content-start">
        {entries.map((entry, idx) => (
          <React.Fragment key={entry.path}>
            <FileCard
              entry={entry}
              isSelected={selectedPaths.includes(entry.path)}
              isFocused={focusedIndex === idx}
              isRenaming={renamingPath === entry.path}
              thumbnailSize={thumbnailSize}
              onSelect={onSelect}
              onOpen={onOpen}
              onContextMenu={onContextMenu}
              onRenameCommit={onRenameCommit}
              themeVars={themeVars}
            />
          </React.Fragment>
        ))}
      </div>
    )}

    {viewMode === 'list' && (
      <div className="flex flex-col gap-0.5">
        {entries.map((entry, idx) => (
          <ListRow
            key={entry.path}
            entry={entry}
            isSelected={selectedPaths.includes(entry.path)}
            isFocused={focusedIndex === idx}
            isRenaming={renamingPath === entry.path}
            onSelect={onSelect}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
            onRenameCommit={onRenameCommit}
            themeVars={themeVars}
          />
        ))}
      </div>
    )}

    {viewMode === 'details' && (
      <DetailsTable
        entries={entries}
        selectedPaths={selectedPaths}
        focusedIndex={focusedIndex}
        renamingPath={renamingPath}
        onSelect={onSelect}
        onOpen={onOpen}
        onContextMenu={onContextMenu}
        onRenameCommit={onRenameCommit}
        themeVars={themeVars}
      />
    )}
  </div>
);
```

### 7-C: ListRow 컴포넌트 (FileGrid.tsx 내부)

FileGrid.tsx에 인라인으로 추가 (import 불필요):

```tsx
function ListRow({ entry, isSelected, isFocused, isRenaming, onSelect, onOpen, onContextMenu, onRenameCommit, themeVars }: {
  entry: FileEntry; isSelected: boolean; isFocused: boolean; isRenaming: boolean;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  themeVars: ThemeVars | null;
}) {
  const [renameValue, setRenameValue] = React.useState(entry.name);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { setRenameValue(entry.name); }, [entry.name]);
  React.useEffect(() => {
    if (isRenaming && inputRef.current) { inputRef.current.select(); }
  }, [isRenaming]);

  const bg = isSelected
    ? (themeVars?.accent20 ?? 'rgba(59,130,246,0.2)')
    : isFocused ? (themeVars?.surfaceHover ?? '#334155') : 'transparent';

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer select-none"
      style={{ backgroundColor: bg }}
      onClick={(e) => onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey)}
      onDoubleClick={() => onOpen(entry)}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e, [entry.path]); }}
    >
      {/* 아이콘 */}
      <span style={{ color: iconColor(entry.file_type), flexShrink: 0 }}>
        <FileTypeIcon fileType={entry.file_type} size={16} />
      </span>
      {/* 이름 */}
      {isRenaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onRenameCommit(entry.path, renameValue);
            if (e.key === 'Escape') onRenameCommit(entry.path, entry.name);
          }}
          onBlur={() => onRenameCommit(entry.path, renameValue)}
          onClick={e => e.stopPropagation()}
          className="flex-1 min-w-0 text-xs px-1 rounded outline-none"
          style={{ backgroundColor: themeVars?.surface2, color: themeVars?.text, border: `1px solid ${themeVars?.accent}` }}
        />
      ) : (
        <span className="flex-1 min-w-0 text-xs truncate" style={{ color: themeVars?.text }}>
          {entry.name}
        </span>
      )}
    </div>
  );
}
```

### 7-D: DetailsTable 컴포넌트 (FileGrid.tsx 내부)

```tsx
function DetailsTable({ entries, selectedPaths, focusedIndex, renamingPath, onSelect, onOpen, onContextMenu, onRenameCommit, themeVars }: {
  entries: FileEntry[]; selectedPaths: string[]; focusedIndex: number; renamingPath: string | null;
  onSelect: (path: string, multi: boolean, range: boolean) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRenameCommit: (oldPath: string, newName: string) => void;
  themeVars: ThemeVars | null;
}) {
  function fmt(bytes: number, isDir: boolean) {
    if (isDir) return '—';
    if (bytes === 0) return '0 B';
    const u = ['B','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
  }
  function fmtDate(ms: number) {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  const typeLabels: Record<string, string> = {
    directory: '폴더', image: '이미지', video: '비디오',
    document: '문서', code: '코드', archive: '압축', other: '기타',
  };

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr style={{ backgroundColor: themeVars?.surface2, color: themeVars?.muted }}>
          <th className="text-left px-3 py-1.5 font-medium">이름</th>
          <th className="text-right px-3 py-1.5 font-medium w-20">크기</th>
          <th className="text-left px-3 py-1.5 font-medium w-28">날짜</th>
          <th className="text-left px-3 py-1.5 font-medium w-16">형식</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, idx) => {
          const isSelected = selectedPaths.includes(entry.path);
          const isFocused = focusedIndex === idx;
          const [renameValue, setRenameValue] = React.useState(entry.name);
          const isRenaming = renamingPath === entry.path;
          const bg = isSelected ? themeVars?.accent20 : isFocused ? themeVars?.surfaceHover : 'transparent';
          return (
            <tr
              key={entry.path}
              style={{ backgroundColor: bg ?? undefined }}
              className="cursor-pointer hover:opacity-80"
              onClick={(e) => onSelect(entry.path, e.ctrlKey || e.metaKey, e.shiftKey)}
              onDoubleClick={() => onOpen(entry)}
              onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e, [entry.path]); }}
            >
              <td className="px-3 py-1 flex items-center gap-2">
                <span style={{ color: iconColor(entry.file_type), flexShrink: 0 }}>
                  <FileTypeIcon fileType={entry.file_type} size={14} />
                </span>
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') onRenameCommit(entry.path, renameValue);
                      if (e.key === 'Escape') onRenameCommit(entry.path, entry.name);
                    }}
                    onBlur={() => onRenameCommit(entry.path, renameValue)}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 min-w-0 px-1 rounded outline-none"
                    style={{ backgroundColor: themeVars?.surface2, color: themeVars?.text, border: `1px solid ${themeVars?.accent}` }}
                  />
                ) : (
                  <span className="truncate" style={{ color: themeVars?.text }}>{entry.name}</span>
                )}
              </td>
              <td className="px-3 py-1 text-right" style={{ color: themeVars?.muted }}>{fmt(entry.size, entry.is_dir)}</td>
              <td className="px-3 py-1" style={{ color: themeVars?.muted }}>{fmtDate(entry.modified)}</td>
              <td className="px-3 py-1" style={{ color: themeVars?.muted }}>{typeLabels[entry.file_type] ?? '기타'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

### 7-E: FileCard에 isFocused prop 추가

`FileCard.tsx` Props에 `isFocused: boolean` 추가, 포커스 스타일 적용:

```typescript
// Props 인터페이스에 추가
isFocused: boolean;
```

카드 border 스타일 업데이트:
```tsx
const border = isSelected
  ? (themeVars?.accent50 ?? 'rgba(59,130,246,0.5)')
  : isFocused
  ? (themeVars?.border ?? '#334155')
  : 'transparent';
```

### 7-F: FileGrid의 iconColor, FileTypeIcon를 파일 최상단으로 이동

ListRow, DetailsTable이 사용할 수 있도록 FileCard.tsx의 `iconColor`, `FileTypeIcon`를 FileGrid.tsx에도 복사하거나, 공통 유틸 파일 `components/FileExplorer/fileUtils.ts`로 추출 후 양쪽에서 import.

공통 유틸 파일 생성 (`components/FileExplorer/fileUtils.tsx`):
```tsx
import React from 'react';
import { Folder, File, FileImage, FileVideo, FileText, FileCode, Archive } from 'lucide-react';

export function FileTypeIcon({ fileType, size }: { fileType: string; size: number }) {
  const iconProps = { size, className: 'flex-shrink-0' };
  switch (fileType) {
    case 'directory': return <Folder {...iconProps} />;
    case 'image':     return <FileImage {...iconProps} />;
    case 'video':     return <FileVideo {...iconProps} />;
    case 'document':  return <FileText {...iconProps} />;
    case 'code':      return <FileCode {...iconProps} />;
    case 'archive':   return <Archive {...iconProps} />;
    default:          return <File {...iconProps} />;
  }
}

export function iconColor(fileType: string): string {
  switch (fileType) {
    case 'directory': return '#60a5fa';
    case 'image':     return '#34d399';
    case 'video':     return '#a78bfa';
    case 'document':  return '#fbbf24';
    case 'code':      return '#22d3ee';
    case 'archive':   return '#fb923c';
    default:          return '#94a3b8';
  }
}

export function formatSize(bytes: number, isDir: boolean): string {
  if (isDir) return '폴더';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
```

FileCard.tsx, FileGrid.tsx에서 import:
```typescript
import { FileTypeIcon, iconColor, formatSize } from './fileUtils';
```

**Step 2: TypeScript 확인**
```bash
npx tsc --noEmit
```
예상: 에러 없음

**Step 3: 커밋**
```bash
git add components/FileExplorer/
git commit -m "feat: 그리드/리스트/세부사항 뷰 모드 구현, 방향키 포커스 지원"
```

---

## 검증 체크리스트

1. `npm run tauri dev` 실행
2. **드롭다운**: 폴더 hover 시 MoreVertical 버튼 표시, 클릭 시 메뉴 3개 동작
3. **툴바**: 좌측 패널 상단에 검색/줌/테마/카테고리추가 버튼 배치 확인
4. **썸네일**: 세로로 긴 이미지 잘리지 않고 레터박스 표시
5. **단축키**: `Cmd+[` 뒤로, `Cmd+]` 앞으로, `Cmd+↑` 상위 폴더
6. **Quick Look**: 이미지 선택 후 Spacebar → macOS Quick Look 패널 오픈
7. **줌**: `Ctrl+=` 확대, `Ctrl+-` 축소
8. **방향키**: 파일 선택 후 화살표로 포커스 이동, 하이라이트 표시
9. **뷰 전환**: NavigationBar의 Grid/List/Details 버튼 클릭 시 뷰 전환
