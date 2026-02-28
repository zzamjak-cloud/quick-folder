# 6가지 개선사항 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 썸네일 성능 완화, 시스템 파일 필터링, 라이트모드 컬러 프리셋, PSD 아이콘, 분할 뷰 아이콘, 탭 드래그 6가지 개선사항 구현

**Architecture:** 각 태스크는 독립적이므로 병렬 실행 가능. Rust 백엔드(lib.rs)와 프론트엔드(React 컴포넌트) 양쪽 수정 필요. 탭 드래그는 HTML5 Drag API 사용.

**Tech Stack:** Tauri 2.x (Rust), React 19, TypeScript, TailwindCSS

---

## Task 1: 썸네일 로딩 성능 완화

**Files:**
- Modify: `components/FileExplorer/hooks/invokeQueue.ts:12-13`
- Modify: `src-tauri/src/lib.rs:440`

**Step 1: invokeQueue.ts 동시성 한도 완화**

```typescript
// 기존: MAX_CONCURRENT = 6, MAX_QUEUE_SIZE = 50
// 변경:
const MAX_CONCURRENT = 12;
const MAX_QUEUE_SIZE = 200;
```

**Step 2: Rust 세마포어 한도 완화**

`src-tauri/src/lib.rs:440`:
```rust
// 기존: const MAX_HEAVY_OPS: usize = 4;
// 변경:
const MAX_HEAVY_OPS: usize = 8;
```

**Step 3: 빌드 확인**

Run: `cd src-tauri && cargo check`
Expected: 컴파일 성공

---

## Task 2: Desktop.xxx 시스템 파일 필터링

**Files:**
- Modify: `src-tauri/src/lib.rs:70-74`

**Step 1: Windows 시스템 파일 필터 확장**

기존 코드 (lib.rs:70-74):
```rust
let name_lower = name.to_lowercase();
if name_lower == "desktop.ini" || name_lower == "thumbs.db" || name_lower == "ntuser.dat" {
    continue;
}
```

변경:
```rust
let name_lower = name.to_lowercase();
if name_lower == "thumbs.db" || name_lower == "ntuser.dat"
    || name_lower.starts_with("desktop.") {
    continue;
}
```

`desktop.ini`, `desktop.xxx` 등 `desktop.`으로 시작하는 모든 파일을 필터링.

**Step 2: 빌드 확인**

Run: `cd src-tauri && cargo check`
Expected: 컴파일 성공

---

## Task 3: 라이트모드용 컬러 프리셋 추가

**Files:**
- Modify: `hooks/useThemeManagement.ts:30-51`

**Step 1: TEXT_COLOR_PRESETS 배열 앞쪽에 진한 색상 추가**

기존 밝은 색상을 유지하되, 라이트모드에서 잘 보이는 진한 계열 색상을 앞에 배치:

```typescript
export const TEXT_COLOR_PRESETS: TextColorPreset[] = [
  // === 진한 색상 (라이트모드 최적) ===
  { name: '블랙', value: '#0b0f19' },
  { name: '차콜', value: '#374151' },
  { name: '다크 레드', value: '#b91c1c' },
  { name: '다크 오렌지', value: '#c2410c' },
  { name: '다크 앰버', value: '#b45309' },
  { name: '다크 그린', value: '#15803d' },
  { name: '다크 틸', value: '#0f766e' },
  { name: '다크 블루', value: '#1d4ed8' },
  { name: '다크 인디고', value: '#4338ca' },
  { name: '다크 퍼플', value: '#7e22ce' },
  { name: '다크 핑크', value: '#be185d' },
  { name: '다크 브라운', value: '#92400e' },
  // === 밝은 색상 (다크모드 최적) ===
  { name: '화이트', value: '#ffffff' },
  { name: '라이트 그레이', value: '#e5e7eb' },
  { name: '그레이', value: '#94a3b8' },
  { name: '레드', value: '#f87171' },
  { name: '오렌지', value: '#fb923c' },
  { name: '앰버', value: '#fbbf24' },
  { name: '라임', value: '#a3e635' },
  { name: '그린', value: '#4ade80' },
  { name: '에메랄드', value: '#34d399' },
  { name: '틸', value: '#2dd4bf' },
  { name: '시안', value: '#22d3ee' },
  { name: '스카이', value: '#38bdf8' },
  { name: '블루', value: '#60a5fa' },
  { name: '인디고', value: '#818cf8' },
  { name: '바이올렛', value: '#a78bfa' },
  { name: '퍼플', value: '#c084fc' },
  { name: '핑크', value: '#fb7185' },
  { name: '로즈', value: '#f43f5e' },
  { name: '브라운', value: '#d97706' },
];
```

---

## Task 4: PSD 시스템 아이콘 표시 보장

**Files:**
- Modify: `components/FileExplorer/hooks/useNativeIcon.ts:10-15,27-29`

**Step 1: PSD 전용 캐시 키 분리**

현재 PSD는 확장자 `psd`로 캐시됨. 문제는 `classify_file`에서 PSD가 `Other`로 분류되어 `skip = false`이므로 네이티브 아이콘을 요청해야 하지만, 아이콘이 없는 시스템에서 null로 캐시되면 이후 복구 불가.

수정: PSD의 `isPsd` 변수를 활용하여 null 캐시를 방지하고, 아이콘이 없으면 fallback 아이콘 제공.

```typescript
// getCacheKey 함수는 그대로 유지

// useNativeIcon 훅 내부:
const isPsd = entry.name.toLowerCase().endsWith('.psd');
// skip 조건에서 PSD는 이미 제외됨 (file_type !== 'image')
const skip = entry.file_type === 'image';
```

실제 문제는 PSD 확장자가 `classify_file`에서 `Other`로 분류되어 네이티브 아이콘이 정상 요청됨. Rust 백엔드의 `get_file_icon`은 확장자별 캐시를 사용하므로 PSD용 아이콘이 시스템에 없으면 null 반환.

**Fallback 해결**: `FileCard.tsx`에서 PSD 파일에 대해 네이티브 아이콘이 null이면 전용 fallback 아이콘(Lucide `FileImage`) 표시. 현재 `fileUtils.tsx`의 `FileTypeIcon` 컴포넌트에서 처리됨.

실제로 코드를 확인해보면 PSD는 `file_type: 'other'`이므로 `FileTypeIcon`에서 일반 `File` 아이콘이 표시됨. PSD 전용 아이콘으로 변경:

`components/FileExplorer/fileUtils.tsx` - `FileTypeIcon` 함수에서 PSD 분기 추가:
```typescript
// FileTypeIcon 내부에서 entry.name으로 PSD 판별 후 FileImage 아이콘 반환
```

---

## Task 5: 분할 화면 아이콘 양쪽 표시

**Files:**
- Modify: `App.tsx:940-947`

**Step 1: 두 번째 패널에 splitMode/onSplitModeChange 전달**

기존 (App.tsx:940-947):
```tsx
<FileExplorer
  instanceId="pane-1"
  isFocused={focusedPane === 1}
  initialPath={explorerPath2}
  onPathChange={setExplorerPath2}
  onAddToFavorites={handleAddFavoriteFromExplorer}
  themeVars={themeVars}
/>
```

변경:
```tsx
<FileExplorer
  instanceId="pane-1"
  isFocused={focusedPane === 1}
  splitMode={splitMode}
  onSplitModeChange={setSplitMode}
  initialPath={explorerPath2}
  onPathChange={setExplorerPath2}
  onAddToFavorites={handleAddFavoriteFromExplorer}
  themeVars={themeVars}
/>
```

---

## Task 6: 탭 드래그 (교차 패널 포함)

**Files:**
- Modify: `components/FileExplorer/TabBar.tsx` (전체 재작성)
- Modify: `components/FileExplorer/index.tsx` (탭 전달 콜백 추가)
- Modify: `components/FileExplorer/types.ts` (탭 전달 타입 추가)
- Modify: `App.tsx` (교차 패널 탭 전달 핸들러)

### Step 1: types.ts에 탭 전달 타입 추가

`components/FileExplorer/types.ts`에 추가:
```typescript
export interface TabTransferData {
  tab: Tab;
  sourceInstanceId: string;
}
```

### Step 2: TabBar.tsx에 HTML5 Drag 기능 추가

핵심 요구사항:
- **클릭 vs 드래그 분기**: `dragStart` 이벤트의 기본 동작 활용. 5px 이상 이동해야 드래그 시작.
- **같은 패널 내 순서 변경**: `onDragOver`에서 drop 위치 계산, `onDrop`에서 탭 재정렬
- **다른 패널로 이동**: `dataTransfer`에 탭 JSON 설정, `onTabReceive` 콜백으로 수신

```tsx
// TabBar props에 추가:
interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabReorder: (fromIndex: number, toIndex: number) => void;  // NEW
  onTabReceive?: (tab: Tab, insertIndex: number) => void;       // NEW (교차 패널)
  instanceId: string;                                            // NEW
  themeVars: ThemeVars | null;
}
```

각 탭에 `draggable={true}` 설정:
- `onDragStart`: `e.dataTransfer.setData('application/qf-tab', JSON.stringify({ tab, sourceInstanceId, fromIndex }))`
- `onDragOver`: 드롭 위치 표시 (좌측/우측 인디케이터)
- `onDrop`: 같은 인스턴스면 `onTabReorder`, 다른 인스턴스면 `onTabReceive`
- `onClick`은 기존 그대로 (HTML5 Drag API는 클릭과 자동 분리됨)

TabBar 전체에도 `onDragOver`/`onDrop` 적용 (빈 영역에 드롭 가능하도록).

### Step 3: FileExplorer/index.tsx에 탭 관리 콜백 추가

```typescript
// 탭 순서 변경
const handleTabReorder = useCallback((fromIndex: number, toIndex: number) => {
  setTabs(prev => {
    const next = [...prev];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  });
}, []);

// 다른 패널에서 탭 수신
const handleTabReceive = useCallback((tab: Tab, insertIndex: number) => {
  setTabs(prev => {
    const next = [...prev];
    next.splice(insertIndex, 0, tab);
    return next;
  });
  setActiveTabId(tab.id);
  loadDirectory(tab.path);
}, [loadDirectory]);

// 외부로 탭 전달 시 제거
const handleTabRemove = useCallback((tabId: string) => {
  setTabs(prev => {
    const next = prev.filter(t => t.id !== tabId);
    // 활성 탭이 제거되면 마지막 탭 활성화
    if (activeTabId === tabId && next.length > 0) {
      const newActive = next[next.length - 1];
      setActiveTabId(newActive.id);
      loadDirectory(newActive.path);
    }
    return next;
  });
}, [activeTabId, loadDirectory]);
```

FileExplorerProps에 추가:
```typescript
onTabTransferOut?: (tab: Tab) => void;  // 탭이 다른 패널로 이동 시 호출
```

### Step 4: App.tsx에 교차 패널 탭 전달 처리

탭 전달을 위해 FileExplorer 인스턴스 간 통신이 필요. `App.tsx`에서:
```typescript
// FileExplorer에 onTabTransferOut 콜백 전달
// 이 콜백은 탭이 드래그아웃될 때 호출되어 원본 패널에서 탭 제거
```

단, HTML5 Drag API의 `dataTransfer`로 탭 데이터가 전달되므로, 수신 측에서 `onTabReceive`로 처리하면 됨.
전송 측에서는 `onDragEnd`에서 `dropEffect`가 'move'이면 원본에서 탭 제거.

### Step 5: 빌드 및 동작 확인

Run: `npm run build`
Expected: 컴파일 성공

수동 테스트:
1. 탭 클릭 → 정상적으로 탭 전환 (드래그 오동작 없음)
2. 탭 드래그 → 같은 패널 내 순서 변경
3. 분할 뷰에서 탭을 다른 패널로 드래그 → 이동 성공

---

## 실행 순서 (의존성 기준)

Task 1-5는 완전 독립 → 병렬 실행 가능
Task 6은 독립이지만 가장 복잡 → 별도 집중 처리 권장

추천 순서: 1,2 (Rust) → 3,4,5 (프론트) → 6 (탭 드래그)
