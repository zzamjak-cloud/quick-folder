# QuickFolder UI 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사이드바, 테마, 마크다운 편집기 등 8가지 UI/UX 개선 사항 구현

**Architecture:** 각 기능은 독립적이며 병렬 구현 가능. 사이드바 관련(1,2,3,4)은 App.tsx + CategoryColumn.tsx + SortableShortcutItem.tsx, 마크다운 관련(5,6,7)은 MarkdownEditor.tsx에 집중.

**Tech Stack:** React 19, TipTap/ProseMirror, Tauri API (`desktopDir`), HSL 색공간 변환

---

### Task 1: Ctrl(Cmd)+클릭 → 신규 탭 열기

**Files:**
- Modify: `App.tsx:232-238` (handleOpenInExplorer → 이벤트 분기)
- Modify: `components/SortableShortcutItem.tsx:87` (클릭 핸들러에 ctrlKey/metaKey 감지)
- Modify: `components/CategoryColumn.tsx:21,28` (handleOpenInNewTab prop 추가)
- Modify: `components/FileExplorer/hooks/useTabManagement.ts` (qf-open-new-tab 이벤트 수신)

- [ ] **Step 1: App.tsx에 handleOpenInNewTab 추가**

`App.tsx`의 `handleOpenInExplorer` 아래에 추가:
```typescript
const handleOpenInNewTab = useCallback((path: string) => {
  // 현재 포커스된 탐색기 패널에 새 탭으로 열기
  window.dispatchEvent(new CustomEvent('qf-open-new-tab', { detail: { path } }));
}, []);
```

- [ ] **Step 2: useTabManagement에서 qf-open-new-tab 이벤트 수신**

`useTabManagement.ts`의 기존 이벤트 리스너(`useEffect`) 안에 추가:
```typescript
// 신규 탭 열기 이벤트
const handleOpenNewTab = (e: Event) => {
  const { path } = (e as CustomEvent).detail;
  const newTab: Tab = {
    id: crypto.randomUUID(),
    path,
    history: [path],
    historyIndex: 0,
    title: pathTitle(path),
  };
  setTabs(prev => [...prev, newTab]);
  setActiveTabId(newTab.id);
  loadDirectory(path);
};
window.addEventListener('qf-open-new-tab', handleOpenNewTab);
// cleanup에도 추가
```

- [ ] **Step 3: CategoryColumn에 handleOpenInNewTab prop 추가**

`CategoryColumnProps`에 `handleOpenInNewTab: (path: string) => void` 추가.
`SortableShortcutItem`에 전달.

- [ ] **Step 4: SortableShortcutItem에서 Ctrl/Cmd+클릭 분기**

`SortableShortcutItem.tsx`의 onClick을:
```typescript
onClick={(e) => {
  if (e.ctrlKey || e.metaKey) {
    handleOpenInNewTab(shortcut.path);
  } else {
    handleOpenFolder(shortcut.path);
  }
}}
```

- [ ] **Step 5: App.tsx에서 CategoryColumn에 handleOpenInNewTab 전달**

`<CategoryColumn>` 렌더링 부분에 `handleOpenInNewTab={handleOpenInNewTab}` prop 추가.

---

### Task 2: "데스크탑" 기본 항목 추가

**Files:**
- Modify: `App.tsx:1,46,211-224,603-619` (import desktopDir, 상태/핸들러 추가, UI 추가)

- [ ] **Step 1: desktopDir import 추가**

`App.tsx` 라인 46의 import에 `desktopDir` 추가:
```typescript
import { downloadDir, desktopDir } from '@tauri-apps/api/path';
```

lucide-react import에 `Monitor` 추가.

- [ ] **Step 2: 데스크탑 경로 상태 + 핸들러 추가**

`downloadPath` 상태 옆에:
```typescript
const [desktopPath, setDesktopPath] = useState<string | null>(null);
useEffect(() => {
  desktopDir().then(setDesktopPath).catch(console.error);
}, []);

const handleOpenDesktop = useCallback(() => {
  if (!desktopPath) return;
  if (splitMode === 'single' || focusedPane === 0) {
    setExplorerPath(desktopPath);
  } else {
    setExplorerPath2(desktopPath);
  }
}, [splitMode, focusedPane, desktopPath]);
```

- [ ] **Step 3: UI에 데스크탑 버튼 추가**

"최근항목"과 "다운로드" 사이에 삽입:
```tsx
{/* 데스크탑 버튼 */}
<div
  className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer select-none hover:bg-[var(--qf-surface-hover)] transition-colors"
  onClick={handleOpenDesktop}
>
  <Monitor size={14} className="text-[var(--qf-accent)]" />
  <span className="text-xs font-semibold text-[var(--qf-text)]">데스크탑</span>
</div>
```

---

### Task 3: 테마 전환 시 카테고리 색상 자동 조정

**Files:**
- Modify: `hooks/useThemeManagement.ts` (adjustColorForTheme 함수 + isDark 노출)
- Modify: `components/CategoryColumn.tsx:76-79` (렌더링 시 색상 조정 적용)
- Modify: `components/SortableShortcutItem.tsx:98-105` (렌더링 시 색상 조정 적용)
- Modify: `App.tsx` (isDark를 CategoryColumn + DragOverlay에 전달)

- [ ] **Step 1: HSL 변환 및 adjustColorForTheme 함수 구현**

`hooks/useThemeManagement.ts`에 추가:
```typescript
function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  if (s === 0) {
    const v = Math.round(l * 255);
    return rgbToHex(v, v, v);
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return rgbToHex(
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  );
}

export function adjustColorForTheme(hexColor: string, isDark: boolean): string {
  const hsl = hexToHsl(hexColor);
  if (!hsl) return hexColor;
  let { h, s, l } = hsl;
  if (isDark) {
    // 다크 배경: 너무 어두운 색상을 밝게
    if (l < 0.55) l = 0.55;
  } else {
    // 라이트 배경: 너무 밝은 색상을 어둡게
    if (l > 0.45) l = 0.45;
  }
  return hslToHex(h, s, l);
}
```

- [ ] **Step 2: useThemeManagement에서 isDark 노출**

`computeThemeVars` 호출 부분에서 `isDark` 값도 계산하여 반환:
```typescript
// 테마 변수 계산 useEffect 안에서
const isDarkComputed = relativeLuminance(hexToRgb(bg)!) < 0.35;
```

훅 반환값에 `isDark` 추가.

- [ ] **Step 3: CategoryColumn에 isDark prop 추가하여 색상 조정**

`CategoryColumnProps`에 `isDark: boolean` 추가.
`categoryTitleHex` 계산 후 `adjustColorForTheme` 적용:
```typescript
import { adjustColorForTheme } from '../../hooks/useThemeManagement';
const adjustedColor = categoryTitleHex ? adjustColorForTheme(categoryTitleHex, isDark) : '';
```
`<h2>` 태그의 `style={{ color: adjustedColor || undefined }}` 적용.

- [ ] **Step 4: SortableShortcutItem에 isDark prop 추가하여 색상 조정**

`SortableShortcutItemProps`에 `isDark: boolean` 추가.
폴더명 텍스트 컬러에 `adjustColorForTheme` 적용.

- [ ] **Step 5: App.tsx에서 isDark를 전달**

`theme` 객체에서 `isDark`를 받아 `CategoryColumn`과 `DragOverlay`에 전달.

---

### Task 4: 사이드바 검색 기능 제거

**Files:**
- Modify: `App.tsx:8,98,471-487,561-568,644,656,669,674-682` (searchQuery 상태, filteredCategories, input, 관련 참조 삭제)
- Modify: `components/CategoryColumn.tsx:32,47-49,64` (searchQuery prop 제거)

- [ ] **Step 1: App.tsx에서 검색 관련 코드 삭제**

1. `import { Search }` 제거 (lucide-react)
2. `const [searchQuery, setSearchQuery] = useState('')` 제거 (라인 98)
3. `filteredCategories` useMemo 전체 삭제 (라인 471-487)
4. 검색 input 삭제 (라인 561-568)
5. `filteredCategories` → `categories`로 교체 (라인 644, 656, 674)
6. `searchQuery={searchQuery}` prop 제거 (라인 669)
7. 빈 카테고리 메시지에서 "검색 결과가 없거나" 부분 수정

- [ ] **Step 2: CategoryColumn에서 searchQuery prop 제거**

`CategoryColumnProps`에서 `searchQuery: string` 삭제.
함수 매개변수에서 `searchQuery` 제거.
`isExpanded` 로직에서 `searchQuery.length > 0` 조건 제거:
```typescript
const isExpanded = !category.isCollapsed;
```

---

### Task 5: 마크다운 편집기 ESC/외부 클릭 닫기

**Files:**
- Modify: `components/FileExplorer/MarkdownEditor.tsx:96-122,201-206`

- [ ] **Step 1: ESC 키로 닫기**

캡처 단계 키 리스너에 Escape 처리 추가 (Ctrl+S 분기 앞에):
```typescript
// Escape: 편집기 닫기
if (e.key === 'Escape') {
  e.preventDefault();
  e.stopImmediatePropagation();
  handleClose();
  return;
}
```

주의: `handleClose`를 ref로 감싸서 useEffect 안에서 최신 값 참조 가능하게 해야 함.

- [ ] **Step 2: 외부 클릭(오버레이)으로 닫기**

오버레이 `<div>`에 onClick 추가, 내부 컨텐츠에 stopPropagation:
```tsx
{/* 오버레이 */}
<div
  className="fixed inset-0 z-[10000] flex items-center justify-center"
  data-markdown-editor="true"
  style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
  onClick={handleClose}  // ← 추가
>
  <div
    className="flex flex-col rounded-lg shadow-2xl overflow-hidden"
    onClick={(e) => e.stopPropagation()}  // ← 추가
    ...
  >
```

---

### Task 6: 화살표 프리셋 + 자동 변환

**Files:**
- Modify: `components/FileExplorer/MarkdownEditor.tsx:1-10,33-51,135-196`

- [ ] **Step 1: TipTap InputRule 확장 추가**

파일 상단 import에 추가:
```typescript
import { InputRule } from '@tiptap/core';
import { Extension } from '@tiptap/core';
```

커스텀 Extension 생성:
```typescript
const ArrowReplace = Extension.create({
  name: 'arrowReplace',
  addInputRules() {
    return [
      new InputRule({ find: /<->(\s)$/, handler: ({ state, range, match }) => {
        const tr = state.tr.replaceWith(range.from - 1, range.to, state.schema.text('↔' + match[1]));
        return tr;
      }}),
      new InputRule({ find: /->(\s)$/, handler: ({ state, range, match }) => {
        // <-> 패턴이 아닌 경우만
        const before = state.doc.textBetween(Math.max(0, range.from - 2), range.from);
        if (before.endsWith('<')) return null;
        const tr = state.tr.replaceWith(range.from, range.to, state.schema.text('→' + match[1]));
        return tr;
      }}),
      new InputRule({ find: /<-(\s)$/, handler: ({ state, range, match }) => {
        // <-> 패턴이 아닌 경우만
        const after = state.doc.textBetween(range.from + 1, Math.min(state.doc.content.size, range.from + 3));
        if (after.startsWith('>')) return null;
        const tr = state.tr.replaceWith(range.from - 1, range.to, state.schema.text('←' + match[1]));
        return tr;
      }}),
    ];
  },
});
```

에디터 extensions에 `ArrowReplace` 추가.

- [ ] **Step 2: 툴바에 화살표 드롭다운 버튼 추가**

`toolbarButtons` 배열 끝(인용 뒤)에 separator + 화살표 버튼 3개 추가:
```typescript
{ type: 'separator' as const },
{
  label: '→', title: '오른쪽 화살표',
  action: () => editor?.chain().focus().insertContent('→').run(),
},
{
  label: '←', title: '왼쪽 화살표',
  action: () => editor?.chain().focus().insertContent('←').run(),
},
{
  label: '↔', title: '양방향 화살표',
  action: () => editor?.chain().focus().insertContent('↔').run(),
},
```

---

### Task 7: 마크다운 원본 복사 버튼

**Files:**
- Modify: `components/FileExplorer/MarkdownEditor.tsx:227-239` (헤더 영역)

- [ ] **Step 1: 헤더에 복사 버튼 추가**

저장 상태 표시와 닫기 버튼 사이에 복사 버튼 추가:
```tsx
<button
  onClick={async () => {
    if (!editor) return;
    const html = editor.getHTML();
    const md = turndown.turndown(html);
    try {
      await navigator.clipboard.writeText(md);
      // 토스트 대신 버튼 텍스트로 피드백
    } catch (e) {
      console.error('복사 실패:', e);
    }
  }}
  className="text-gray-400 hover:text-white transition-colors px-2 py-0.5 rounded text-xs"
  style={{
    background: themeVars?.surface ?? '#333',
    border: `1px solid ${themeVars?.border ?? '#444'}`,
    cursor: 'pointer',
  }}
  title="마크다운 원본 복사"
>
  복사
</button>
```

핵심: `navigator.clipboard.writeText(md)`로 **순수 텍스트**만 복사. 리치 텍스트/HTML 형식 없음.

---

### Task 8: 개발 빌드 실행

- [ ] **Step 1: npm run tauri dev 실행**

모든 구현 완료 후 개발 빌드를 실행하여 동작 확인.
