# 6개 기능 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** PSB 미리보기, 버튼 순서 변경, macOS 권한 수정, 썸네일 크기 추가, 사이드바 폴딩, 일괄 이름변경 6개 기능을 구현한다.

**Architecture:** 각 기능은 독립적이므로 순서대로 구현. Rust 백엔드(lib.rs)와 React 프론트엔드(FileExplorer 컴포넌트)를 수정. 새 컴포넌트는 BulkRenameModal.tsx 하나만 생성.

**Tech Stack:** Tauri 2.x, React 19, TypeScript, Rust, TailwindCSS, Lucide React

---

### Task 1: PSB 파일 스페이스바 미리보기 지원

**Files:**
- Modify: `src-tauri/src/lib.rs:97-119` (get_image_dimensions에 psb 추가)
- Modify: `src-tauri/src/lib.rs:198` (get_psd_thumbnail에 psb 확장자 인식)
- Modify: `components/FileExplorer/index.tsx:576-593` (handlePreviewImage에서 .psb 인식)
- Modify: `components/FileExplorer/index.tsx:740-769` (스페이스바 핸들러에서 .psb 인식)
- Modify: `components/FileExplorer/ContextMenu.tsx:142-148` (우클릭 미리보기에서 .psb 인식)

**Step 1: Rust - get_image_dimensions에 PSB 지원 추가**

`src-tauri/src/lib.rs:101` - supported 배열에 "psb" 추가:
```rust
let supported = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "psd", "psb"];
```

`src-tauri/src/lib.rs:105` - PSB도 PSD와 동일한 헤더 구조 사용:
```rust
if ext == "psd" || ext == "psb" {
```

**Step 2: Rust - get_psd_thumbnail에서 PSB 파일도 처리하도록 수정**

`get_psd_thumbnail` 함수는 이미 `path`를 받아 `psd::Psd::from_bytes`로 파싱.
`psd` 크레이트 0.3은 PSB를 직접 지원하지 않을 수 있으므로, 함수 자체는 변경 불필요 (호출측에서 .psb 확장자를 인식하도록만 처리). 파싱 실패 시 `Ok(None)` 반환으로 안전.

**Step 3: 프론트엔드 - handlePreviewImage에서 .psb 인식**

`components/FileExplorer/index.tsx:581`:
```typescript
const isPsd = /\.(psd|psb)$/i.test(path);
```

**Step 4: 프론트엔드 - 스페이스바 핸들러에서 .psb 인식**

`components/FileExplorer/index.tsx:758`:
```typescript
} else if (entry.file_type === 'image' || /\.(psd|psb)$/i.test(entry.name)) {
```

**Step 5: 프론트엔드 - ContextMenu에서 .psb 미리보기 표시**

`components/FileExplorer/ContextMenu.tsx:143`:
```typescript
(singleEntry.name.toLowerCase().endsWith('.psd') || singleEntry.name.toLowerCase().endsWith('.psb') || singleEntry.file_type === 'image') &&
```

**Step 6: 빌드 확인**

Run: `cd /Users/woody/Desktop/AI/QuickFolder/quick-folder && npm run build`
Expected: 빌드 성공

**Step 7: 커밋**

```bash
git add src-tauri/src/lib.rs components/FileExplorer/index.tsx components/FileExplorer/ContextMenu.tsx
git commit -m "feat: PSB 파일 스페이스바/우클릭 미리보기 지원 추가"
```

---

### Task 2: 검색/폴더생성 버튼 위치 변경

**Files:**
- Modify: `components/FileExplorer/NavigationBar.tsx:264-302`

**Step 1: NavigationBar에서 검색 블록과 새 폴더 블록의 JSX 순서를 교체**

현재 순서 (264-302줄):
1. 새 폴더 (264-271)
2. 검색 (273-302)

변경: 검색을 먼저, 새 폴더를 나중에:

```tsx
      {/* 검색 */}
      {isSearchActive ? (
        <div className="flex items-center gap-1 rounded-md px-1.5 py-0.5" style={{ backgroundColor: themeVars?.surface ?? '#111827', border: `1px solid ${themeVars?.accent ?? '#3b82f6'}` }}>
          <Search size={13} style={{ color: themeVars?.muted, flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => onSearchQueryChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onSearchToggle(); } }}
            placeholder="파일명 검색..."
            className="bg-transparent text-xs outline-none w-28"
            style={{ color: themeVars?.text }}
          />
          <button
            className="p-0.5 rounded hover:bg-[var(--qf-surface-hover)]"
            onClick={onSearchToggle}
            title="검색 닫기"
          >
            <X size={12} style={{ color: themeVars?.muted }} />
          </button>
        </div>
      ) : (
        <button
          className={btnCls(false)}
          onClick={onSearchToggle}
          title="검색 (Ctrl+F)"
        >
          <Search size={15} />
        </button>
      )}

      {/* 새 폴더 */}
      <button
        className={btnCls(false)}
        onClick={onCreateDirectory}
        title="새 폴더 (Ctrl+Shift+N)"
      >
        <FolderPlus size={15} />
      </button>
```

**Step 2: 빌드 확인 후 커밋**

```bash
git add components/FileExplorer/NavigationBar.tsx
git commit -m "feat: 검색 버튼과 신규 폴더 버튼 위치 변경 [검색][신규 폴더]"
```

---

### Task 3: macOS 보호 폴더 권한 팝업 반복 해결

**Files:**
- Create: `src-tauri/entitlements.plist`
- Modify: `src-tauri/tauri.conf.json:32-43`

**Step 1: entitlements.plist 생성**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <key>com.apple.security.files.downloads.read-write</key>
    <true/>
    <key>com.apple.security.files.bookmarks.app-scope</key>
    <true/>
</dict>
</plist>
```

**Step 2: tauri.conf.json에 macOS 번들 설정 추가**

`bundle` 섹션 안에 macOS entitlements 참조 추가:

```json
"bundle": {
    "publisher": "zzamjak-cloud",
    "active": true,
    "targets": ["app", "dmg", "nsis"],
    "createUpdaterArtifacts": true,
    "icon": [...],
    "macOS": {
      "entitlements": "entitlements.plist"
    }
}
```

**Step 3: 빌드 확인 후 커밋**

```bash
git add src-tauri/entitlements.plist src-tauri/tauri.conf.json
git commit -m "fix: macOS 보호 폴더 권한 팝업 반복 해결 - entitlements 설정"
```

---

### Task 4: 썸네일 확대 5X, 6X 추가 (총 10단계)

**Files:**
- Modify: `types.ts:35`
- Modify: `components/FileExplorer/index.tsx:45` (THUMBNAIL_SIZES)
- Modify: `components/FileExplorer/NavigationBar.tsx:167` (sizeLabels)
- Modify: `components/FileExplorer/NavigationBar.tsx:454` (드롭다운 배열)

**Step 1: types.ts - ThumbnailSize 타입 확장**

```typescript
export type ThumbnailSize = 40 | 60 | 80 | 100 | 120 | 160 | 200 | 240 | 280 | 320;
```

**Step 2: FileExplorer/index.tsx - THUMBNAIL_SIZES 배열 확장**

`index.tsx:45` 부근의 상수 배열 수정:
```typescript
const THUMBNAIL_SIZES: ThumbnailSize[] = [40, 60, 80, 100, 120, 160, 200, 240, 280, 320];
```

**Step 3: NavigationBar.tsx - sizeLabels 매핑 확장**

```typescript
const sizeLabels: Record<ThumbnailSize, string> = {
    40: 'XS', 60: 'S', 80: 'M', 100: 'L', 120: 'XL', 160: '2X', 200: '3X', 240: '4X', 280: '5X', 320: '6X',
};
```

**Step 4: NavigationBar.tsx - 드롭다운 배열 확장**

```typescript
{([40, 60, 80, 100, 120, 160, 200, 240, 280, 320] as const).map(size => (
```

**Step 5: 빌드 확인 후 커밋**

```bash
git add types.ts components/FileExplorer/index.tsx components/FileExplorer/NavigationBar.tsx
git commit -m "feat: 썸네일 확대 5X, 6X 추가 (총 10단계)"
```

---

### Task 5: 좌측 사이드바 폴딩 기능

**Files:**
- Modify: `App.tsx:1-16` (import에 PanelLeftClose, PanelLeftOpen 추가)
- Modify: `App.tsx:440-443` (sidebarCollapsed 상태 추가)
- Modify: `App.tsx:470-483` (Ctrl+B 단축키 추가)
- Modify: `App.tsx:837-987` (사이드바 레이아웃 수정)

**Step 1: App.tsx import에 아이콘 추가**

lucide-react import에 `PanelLeftClose`, `PanelLeftOpen` 추가:
```typescript
import {
  Plus,
  Settings,
  Folder,
  Copy,
  Trash2,
  Edit2,
  Palette,
  Search,
  ZoomIn,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
```

**Step 2: App.tsx - sidebarCollapsed 상태 추가**

`leftPanelWidth` 상태 근처 (440줄 부근)에 추가:
```typescript
const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('qf_sidebar_collapsed') === 'true';
});

useEffect(() => {
    localStorage.setItem('qf_sidebar_collapsed', String(sidebarCollapsed));
}, [sidebarCollapsed]);
```

**Step 3: App.tsx - Ctrl+B 단축키 추가**

기존 `handleSplitKeyDown` useEffect (470줄)에 Ctrl+B 핸들러 추가:
```typescript
useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl+\ → 분할 뷰 토글
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        setSplitMode(prev => {
          if (prev === 'single') return 'horizontal';
          if (prev === 'horizontal') return 'vertical';
          return 'single';
        });
      }
      // Ctrl+B → 사이드바 폴딩 토글
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
}, []);
```

**Step 4: App.tsx - 사이드바 레이아웃 수정**

837줄의 좌측 패널 div 수정:

```tsx
{/* Left: Favorites Panel */}
<div
  style={{ width: sidebarCollapsed ? 32 : leftPanelWidth }}
  className="flex-shrink-0 flex flex-col overflow-hidden transition-[width] duration-200"
>
  {/* 폴딩 아이콘 */}
  <div className="flex-shrink-0 flex items-center border-b border-[var(--qf-border)]"
    style={{ height: 36, justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? 0 : '0 12px' }}>
    <button
      onClick={() => setSidebarCollapsed(prev => !prev)}
      className="p-1 text-[var(--qf-muted)] hover:text-[var(--qf-text)] transition-colors rounded-md hover:bg-[var(--qf-surface-hover)]"
      title={sidebarCollapsed ? '사이드바 펼치기 (Ctrl+B)' : '사이드바 접기 (Ctrl+B)'}
    >
      {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
    </button>
  </div>

  {/* 사이드바 콘텐츠 (접힌 상태에서 숨김) */}
  {!sidebarCollapsed && (
    <>
      <div className="flex-shrink-0 px-3 pt-2 pb-2 flex flex-col gap-2 border-b border-[var(--qf-border)]">
        {/* 검색 입력 */}
        <input ... />
        <div className="flex items-center justify-between">
          {/* "즐겨찾기" 텍스트 제거, 나머지 버튼(줌, 테마, 카테고리 추가)만 유지 */}
          <div />
          <div className="flex items-center gap-1">
            <button onClick={() => setIsZoomModalOpen(true)} ...>
              <ZoomIn size={14} />
            </button>
            <button onClick={() => setIsBgModalOpen(true)} ...>
              <Palette size={14} />
            </button>
            <button onClick={catMgmt.openAddCategoryModal} ...>
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {/* 기존 DndContext + 카테고리 렌더링 코드 그대로 */}
      </div>
    </>
  )}
</div>
```

**Step 5: 드래그 구분선도 접힌 상태에서는 숨기거나 유지**

접힌 상태에서 구분선은 유지 (32px 뒤에 구분선이 자연스럽게 위치).

**Step 6: 빌드 확인 후 커밋**

```bash
git add App.tsx
git commit -m "feat: 좌측 사이드바 폴딩 기능 - Ctrl+B 토글, 32px 접힌 상태"
```

---

### Task 6: 일괄 이름변경 팝업

**Files:**
- Create: `components/FileExplorer/BulkRenameModal.tsx`
- Modify: `components/FileExplorer/ContextMenu.tsx:17,37,57,167-168`
- Modify: `components/FileExplorer/index.tsx:63,494,1152-1180`

**Step 1: BulkRenameModal.tsx 생성**

새 파일 `components/FileExplorer/BulkRenameModal.tsx`:

```tsx
import React, { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { ThemeVars } from './types';

interface BulkRenameModalProps {
  paths: string[];
  onClose: () => void;
  onApply: (renames: { oldPath: string; newPath: string }[]) => Promise<void>;
  themeVars: ThemeVars | null;
}

export default function BulkRenameModal({ paths, onClose, onApply, themeVars }: BulkRenameModalProps) {
  const [inputName, setInputName] = useState('');
  const [replaceName, setReplaceName] = useState('');
  const [numberDigits, setNumberDigits] = useState(1);
  const [warning, setWarning] = useState('');
  const [applying, setApplying] = useState(false);

  // 원본 파일 정보 파싱
  const originalFiles = paths.map(p => {
    const sep = p.includes('/') ? '/' : '\\';
    const parts = p.split(sep);
    const fullName = parts.pop()!;
    const dir = parts.join(sep);
    const dotIdx = fullName.lastIndexOf('.');
    const baseName = dotIdx > 0 ? fullName.substring(0, dotIdx) : fullName;
    const ext = dotIdx > 0 ? fullName.substring(dotIdx) : '';
    return { path: p, dir, fullName, baseName, ext, sep };
  });

  // 미리보기 이름 (확장자 제외한 베이스네임만 변환)
  const [previewNames, setPreviewNames] = useState<string[]>(
    originalFiles.map(f => f.baseName)
  );

  const updatePreview = useCallback((newNames: string[]) => {
    setPreviewNames(newNames);
    setWarning('');
  }, []);

  // Rename: 변경할 이름으로 전체 교체
  const handleRename = () => {
    if (!inputName) { setWarning('변경할 이름을 입력하세요'); return; }
    updatePreview(previewNames.map(() => inputName));
  };

  // Replace: 현재 미리보기 이름에서 문자열 치환
  const handleReplace = () => {
    if (!inputName || !replaceName) {
      setWarning('변경할 이름과 대체할 이름을 모두 입력하세요');
      return;
    }
    updatePreview(previewNames.map(n => n.replaceAll(inputName, replaceName)));
  };

  // Prefix: 접두사 추가
  const handlePrefix = () => {
    if (!inputName) { setWarning('변경할 이름을 입력하세요'); return; }
    updatePreview(previewNames.map(n => inputName + n));
  };

  // Suffix: 접미사 추가 (확장자 앞)
  const handleSuffix = () => {
    if (!inputName) { setWarning('변경할 이름을 입력하세요'); return; }
    updatePreview(previewNames.map(n => n + inputName));
  };

  // Number: 순번 추가
  const handleNumber = () => {
    updatePreview(previewNames.map((n, i) => {
      const num = String(i + 1).padStart(numberDigits, '0');
      return n + num;
    }));
  };

  // 적용
  const handleApply = async () => {
    setApplying(true);
    try {
      const renames = originalFiles.map((f, i) => ({
        oldPath: f.path,
        newPath: f.dir + f.sep + previewNames[i] + f.ext,
      }));
      await onApply(renames);
      onClose();
    } catch (e) {
      setWarning(`적용 실패: ${e}`);
    } finally {
      setApplying(false);
    }
  };

  // 리셋
  const handleReset = () => {
    updatePreview(originalFiles.map(f => f.baseName));
    setInputName('');
    setReplaceName('');
  };

  const btnStyle = {
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 6,
    border: `1px solid ${themeVars?.border ?? '#334155'}`,
    backgroundColor: themeVars?.surface ?? '#111827',
    color: themeVars?.text ?? '#e5e7eb',
    cursor: 'pointer',
  };

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-2xl flex flex-col"
        style={{
          backgroundColor: themeVars?.surface2 ?? '#1e293b',
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
          width: 560, maxHeight: '85vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}>
          <span className="text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
            이름 모두 바꾸기 ({paths.length}개 파일)
          </span>
          <button className="p-1 hover:opacity-70" style={{ color: themeVars?.muted }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* 입력 영역 */}
        <div className="px-4 py-3 flex flex-col gap-2" style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}>
          <div className="flex items-center gap-2">
            <label className="text-xs w-20 flex-shrink-0" style={{ color: themeVars?.muted }}>변경할 이름</label>
            <input
              value={inputName}
              onChange={e => setInputName(e.target.value)}
              className="flex-1 px-2 py-1 text-xs rounded-md outline-none"
              style={{
                backgroundColor: themeVars?.surface ?? '#111827',
                color: themeVars?.text ?? '#e5e7eb',
                border: `1px solid ${themeVars?.border ?? '#334155'}`,
              }}
              placeholder="입력..."
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs w-20 flex-shrink-0" style={{ color: themeVars?.muted }}>대체할 이름</label>
            <input
              value={replaceName}
              onChange={e => setReplaceName(e.target.value)}
              className="flex-1 px-2 py-1 text-xs rounded-md outline-none"
              style={{
                backgroundColor: themeVars?.surface ?? '#111827',
                color: themeVars?.text ?? '#e5e7eb',
                border: `1px solid ${themeVars?.border ?? '#334155'}`,
              }}
              placeholder="Replace 시 사용..."
            />
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <button style={btnStyle} onClick={handleRename}>Rename</button>
            <button style={btnStyle} onClick={handleReplace}>Replace</button>
            <button style={btnStyle} onClick={handlePrefix}>Prefix</button>
            <button style={btnStyle} onClick={handleSuffix}>Suffix</button>
            <button style={btnStyle} onClick={handleNumber}>Number</button>
            <div className="flex items-center gap-1 ml-1">
              <label className="text-[10px]" style={{ color: themeVars?.muted }}>자리수</label>
              <input
                type="number"
                min={1}
                max={6}
                value={numberDigits}
                onChange={e => setNumberDigits(Math.max(1, Math.min(6, Number(e.target.value))))}
                className="w-10 px-1 py-0.5 text-xs rounded-md outline-none text-center"
                style={{
                  backgroundColor: themeVars?.surface ?? '#111827',
                  color: themeVars?.text ?? '#e5e7eb',
                  border: `1px solid ${themeVars?.border ?? '#334155'}`,
                }}
              />
            </div>
            <button
              style={{ ...btnStyle, marginLeft: 'auto', opacity: 0.7 }}
              onClick={handleReset}
            >
              리셋
            </button>
          </div>

          {warning && (
            <div className="text-xs mt-1" style={{ color: '#f87171' }}>{warning}</div>
          )}
        </div>

        {/* 미리보기 */}
        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ maxHeight: 300 }}>
          <div className="text-[10px] mb-2" style={{ color: themeVars?.muted }}>미리보기</div>
          <div className="flex flex-col gap-1">
            {originalFiles.map((f, i) => (
              <div key={f.path} className="flex items-center gap-2 text-xs py-0.5">
                <span className="flex-1 truncate" style={{ color: themeVars?.muted }}>{f.baseName}{f.ext}</span>
                <span style={{ color: themeVars?.muted }}>→</span>
                <span
                  className="flex-1 truncate font-medium"
                  style={{ color: previewNames[i] !== f.baseName ? (themeVars?.accent ?? '#3b82f6') : themeVars?.text }}
                >
                  {previewNames[i]}{f.ext}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: `1px solid ${themeVars?.border ?? '#334155'}` }}>
          <button style={btnStyle} onClick={onClose}>취소</button>
          <button
            style={{
              ...btnStyle,
              backgroundColor: themeVars?.accent ?? '#3b82f6',
              color: '#fff',
              border: 'none',
              opacity: applying ? 0.5 : 1,
            }}
            onClick={handleApply}
            disabled={applying}
          >
            {applying ? '적용 중...' : '적용'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: ContextMenu.tsx에 "이름 모두 바꾸기" 메뉴 항목 추가**

Props 인터페이스에 추가:
```typescript
onBulkRename?: (paths: string[]) => void;
```

Props destructuring에 추가:
```typescript
onBulkRename,
```

167줄 "이름 바꾸기" 항목 아래에 추가:
```tsx
{/* 이름 모두 바꾸기 (복수 선택 시) */}
{!isSingle && paths.length > 1 && onBulkRename && item(
  <Edit2 size={13} />,
  '이름 모두 바꾸기',
  () => onBulkRename(paths),
)}
```

**Step 3: FileExplorer/index.tsx에 BulkRenameModal 상태 추가**

상태 추가 (63줄 부근):
```typescript
const [bulkRenamePaths, setBulkRenamePaths] = useState<string[] | null>(null);
```

일괄 이름변경 핸들러:
```typescript
const handleBulkRename = useCallback((paths: string[]) => {
  setBulkRenamePaths(paths);
  setContextMenu(null);
}, []);

const handleBulkRenameApply = useCallback(async (renames: { oldPath: string; newPath: string }[]) => {
  for (const { oldPath, newPath } of renames) {
    await invoke('rename_item', { oldPath, newPath });
  }
  if (currentPath) {
    const result = await invoke<FileEntry[]>('list_directory', { path: currentPath });
    setEntries(sortEntries(result, sortBy, sortDir));
  }
  setSelectedPaths([]);
  window.dispatchEvent(new Event('qf-files-changed'));
}, [currentPath, sortBy, sortDir]);
```

ContextMenu에 onBulkRename prop 전달 (1152줄 부근):
```tsx
onBulkRename={handleBulkRename}
```

BulkRenameModal 렌더링 (contextMenu 아래):
```tsx
{bulkRenamePaths && (
  <BulkRenameModal
    paths={bulkRenamePaths}
    onClose={() => setBulkRenamePaths(null)}
    onApply={handleBulkRenameApply}
    themeVars={themeVars}
  />
)}
```

**Step 4: 빌드 확인 후 커밋**

```bash
git add components/FileExplorer/BulkRenameModal.tsx components/FileExplorer/ContextMenu.tsx components/FileExplorer/index.tsx
git commit -m "feat: 여러 파일 일괄 이름변경 팝업 기능 추가"
```

---

### Task 7: 최종 빌드 및 전체 동작 확인

**Step 1: 전체 빌드**

```bash
npm run build
```

**Step 2: Rust 컴파일 (macOS entitlements 적용 확인)**

```bash
cd src-tauri && cargo check
```
