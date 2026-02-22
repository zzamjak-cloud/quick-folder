# UI 개선사항 v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 7개 기능 개선 — DnD 버그 수정, 썸네일 확장, 이미지 규격 표시, PSD 미리보기, 외부 드래그, 탭 시스템

**Architecture:** 탭 시스템은 FileExplorer 내부에서 상태를 관리하며 localStorage에 영속. PSD 썸네일은 Rust `psd` 크레이트 + 디스크 캐시로 크로스플랫폼 지원. 외부 드래그는 `tauri-plugin-drag` 사용.

**Tech Stack:** Tauri 2.x, React 19, TypeScript, Rust (`psd`, `tauri-plugin-drag`)

---

### Task 1: 기본 zoom 80% + DnD 첫 번째 위치 버그 수정

**Files:**
- Modify: `App.tsx` (zoom default, handleDragOver, handleDragEnd)

**Step 1: zoom 기본값 변경**

`App.tsx:478` 수정:
```typescript
// Before
const [zoomPercent, setZoomPercent] = useState(100);
// After
const [zoomPercent, setZoomPercent] = useState(80);
```

**Step 2: DnD 버그 수정 — handleDragOver에 동일 카테고리 재정렬 추가**

현재 `handleDragOver`는 동일 카테고리 이동 시 early return. 이로 인해 `handleDragEnd`에서만 처리되는데, `over.id`가 카테고리 컨테이너 ID일 때 `arrayMove`가 `index = -1`로 잘못 처리됨.

`handleDragOver` 함수 전체 교체:
```typescript
const handleDragOver = (event: DragOverEvent) => {
  const { active, over } = event;
  if (!over) return;
  if (active.data.current?.type === 'Category') return;

  const activeSectionId = active.data.current?.categoryId as string | undefined;
  const overSectionId = (over.data.current?.categoryId ?? over.id) as string;
  if (!activeSectionId || !overSectionId) return;

  // 같은 카테고리 내 재정렬 (DragOver에서 즉시 반영 → 시각 피드백 + 정확한 위치 추적)
  if (activeSectionId === overSectionId) {
    if (over.id === overSectionId) return; // 컨테이너 위 → 무시
    setCategories(prev => {
      const catIdx = prev.findIndex(c => c.id === activeSectionId);
      if (catIdx === -1) return prev;
      const activeIdx = prev[catIdx].shortcuts.findIndex(s => s.id === active.id);
      const overIdx = prev[catIdx].shortcuts.findIndex(s => s.id === over.id);
      if (activeIdx === -1 || overIdx === -1 || activeIdx === overIdx) return prev;
      const updated = [...prev];
      updated[catIdx] = {
        ...updated[catIdx],
        shortcuts: arrayMove(updated[catIdx].shortcuts, activeIdx, overIdx),
      };
      return updated;
    });
    return;
  }

  // 카테고리 간 이동 (기존 로직 유지)
  setCategories(prev => {
    const activeCategory = prev.find(c => c.id === activeSectionId);
    const overCategory = prev.find(c => c.id === overSectionId);
    if (!activeCategory || !overCategory) return prev;

    const activeItems = activeCategory.shortcuts;
    const overItems = overCategory.shortcuts;
    const activeIndex = activeItems.findIndex(i => i.id === active.id);
    const overIndex = overItems.findIndex(i => i.id === over.id);

    let newIndex: number;
    if (over.id === overSectionId) {
      newIndex = overItems.length + 1;
    } else {
      const isBelowOverItem =
        over &&
        active.rect.current.translated &&
        active.rect.current.translated.top > over.rect.top + over.rect.height;
      const modifier = isBelowOverItem ? 1 : 0;
      newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
    }

    return prev.map(c => {
      if (c.id === activeSectionId) {
        return { ...c, shortcuts: c.shortcuts.filter(item => item.id !== active.id) };
      } else if (c.id === overSectionId) {
        return {
          ...c,
          shortcuts: [
            ...c.shortcuts.slice(0, newIndex),
            activeItems[activeIndex],
            ...c.shortcuts.slice(newIndex),
          ],
        };
      }
      return c;
    });
  });
};
```

**Step 3: handleDragEnd에서 동일 카테고리 재정렬 제거**

`handleDragEnd` 전체 교체 (동일 카테고리 로직 제거, DragOver에서 이미 처리):
```typescript
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over) { setActiveId(null); return; }

  const activeType = active.data.current?.type;
  const overType = over.data.current?.type;

  // 카테고리 재정렬
  if (activeType === 'Category' && overType === 'Category') {
    const activeIndex = categories.findIndex(c => c.id === active.id);
    const overIndex = categories.findIndex(c => c.id === over.id);
    if (activeIndex !== overIndex) {
      setCategories(prev => arrayMove(prev, activeIndex, overIndex));
    }
  }
  // 단축키 동일 카테고리 재정렬은 handleDragOver에서 이미 처리됨

  setActiveId(null);
};
```

**Step 4: TypeScript 검증**
```bash
npx tsc --noEmit
```
Expected: 오류 없음

**Step 5: Commit**
```bash
git add App.tsx
git commit -m "fix: zoom 기본값 80%, 즐겨찾기 DnD 첫 번째 위치 버그 수정"
```

---

### Task 2: 썸네일 크기 프리셋 8단계 확장

**Files:**
- Modify: `types.ts`
- Modify: `components/FileExplorer/index.tsx`
- Modify: `components/FileExplorer/NavigationBar.tsx`
- Modify: `components/FileExplorer/FileGrid.tsx`
- Modify: `components/FileExplorer/FileCard.tsx`

**Step 1: types.ts에 ThumbnailSize 타입 추가**

`types.ts` 마지막에 추가:
```typescript
export type ThumbnailSize = 40 | 60 | 80 | 100 | 120 | 160 | 200 | 240;
```

**Step 2: FileExplorer/index.tsx — 타입 교체 + 줌 키보드 단축키 수정**

import 추가:
```typescript
import { FileEntry, ClipboardData, ThumbnailSize } from '../../types';
```

상태 타입 변경:
```typescript
// Before
const [thumbnailSize, setThumbnailSize] = useState<80 | 120 | 160>(120);
// After
const [thumbnailSize, setThumbnailSize] = useState<ThumbnailSize>(120);
```

키보드 핸들러에서 줌 부분 교체 (기존 3개 size 분기 → SIZES 배열 사용):
```typescript
const SIZES: ThumbnailSize[] = [40, 60, 80, 100, 120, 160, 200, 240];

// Ctrl+= 또는 Ctrl++
if (ctrl && (e.key === '=' || e.key === '+')) {
  e.preventDefault();
  setThumbnailSize(prev => {
    const idx = SIZES.indexOf(prev);
    return SIZES[Math.min(SIZES.length - 1, idx + 1)];
  });
  return;
}
// Ctrl+-
if (ctrl && e.key === '-') {
  e.preventDefault();
  setThumbnailSize(prev => {
    const idx = SIZES.indexOf(prev);
    return SIZES[Math.max(0, idx - 1)];
  });
  return;
}
// Ctrl+0
if (ctrl && e.key === '0') {
  e.preventDefault();
  setThumbnailSize(120);
  return;
}
```

주의: `SIZES` 상수는 useEffect 밖 (컴포넌트 외부 또는 useMemo 없이 컴포넌트 바깥)에 선언.

**Step 3: NavigationBar.tsx — 타입 + 레이블 + 드롭다운 업데이트**

import 추가:
```typescript
import { ThumbnailSize } from '../../types';
```

인터페이스 변경:
```typescript
// Before
thumbnailSize: 80 | 120 | 160;
onThumbnailSizeChange: (size: 80 | 120 | 160) => void;
// After
thumbnailSize: ThumbnailSize;
onThumbnailSizeChange: (size: ThumbnailSize) => void;
```

`sizeLabels` 교체:
```typescript
const sizeLabels: Record<ThumbnailSize, string> = {
  40: 'XS', 60: 'S', 80: 'M', 100: 'L', 120: 'XL', 160: '2X', 200: '3X', 240: '4X',
};
```

드롭다운 목록 교체 (`[80, 120, 160] as const` → `[40, 60, 80, 100, 120, 160, 200, 240] as const`):
```typescript
{([40, 60, 80, 100, 120, 160, 200, 240] as const).map(size => (
  <button
    key={size}
    className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--qf-surface-hover)]"
    style={{ color: thumbnailSize === size ? themeVars?.accent : themeVars?.text }}
    onClick={() => { onThumbnailSizeChange(size); setShowSizeMenu(false); }}
  >
    {sizeLabels[size]}
  </button>
))}
```

**Step 4: FileGrid.tsx, FileCard.tsx 타입 교체**

두 파일 모두:
```typescript
import { ThumbnailSize } from '../../types';
// 또는 상위에서 이미 import하는 경우 추가
```

`FileGridProps`, `FileCardProps` 인터페이스에서:
```typescript
// Before
thumbnailSize: 80 | 120 | 160;
// After
thumbnailSize: ThumbnailSize;
```

**Step 5: TypeScript 검증**
```bash
npx tsc --noEmit
```
Expected: 오류 없음

**Step 6: Commit**
```bash
git add types.ts components/FileExplorer/
git commit -m "feat: 썸네일 크기 8단계 프리셋 확장 (XS~4X)"
```

---

### Task 3: Grid 썸네일 이미지 규격 표시

**Files:**
- Modify: `components/FileExplorer/FileCard.tsx`

**Step 1: imgDimensions 상태 추가**

기존 state 선언부 (thumbnail, isVisible, renameValue 아래에) 추가:
```typescript
const [imgDimensions, setImgDimensions] = useState<{ w: number; h: number } | null>(null);
```

**Step 2: img onLoad 핸들러로 규격 추출**

기존 `<img ... />` 교체:
```tsx
<img
  src={thumbnail}
  alt={entry.name}
  className="w-full h-full object-contain"
  loading="lazy"
  onLoad={(e) => {
    const img = e.currentTarget;
    setImgDimensions({ w: img.naturalWidth, h: img.naturalHeight });
  }}
/>
```

**Step 3: 파일 크기 표시 영역에 규격 추가**

기존 크기 표시 div 교체:
```tsx
{/* 크기 + 이미지 규격 */}
<div
  className="text-[10px] leading-none text-center"
  style={{ color: themeVars?.muted ?? '#94a3b8' }}
>
  {imgDimensions
    ? `${formatSize(entry.size, entry.is_dir)} · ${imgDimensions.w}×${imgDimensions.h}`
    : formatSize(entry.size, entry.is_dir)}
</div>
```

**Step 4: TypeScript 검증**
```bash
npx tsc --noEmit
```

**Step 5: Commit**
```bash
git add components/FileExplorer/FileCard.tsx
git commit -m "feat: Grid 썸네일에 이미지 규격(WxH) 표시"
```

---

### Task 4: PSD 썸네일 Rust 백엔드 + 디스크 캐싱

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Cargo.toml에 psd 크레이트 추가**

`src-tauri/Cargo.toml`의 `[dependencies]` 마지막 줄에 추가:
```toml
psd = "0.3"
```

**Step 2: classify_file에 psd 추가**

`src-tauri/src/lib.rs`의 `classify_file` 함수:
```rust
fn classify_file(name: &str) -> &str {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "ico" | "psd" => "image",
        "mp4" | "mov" | "avi" | "mkv" | "webm" => "video",
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" => "document",
        "rs" | "js" | "ts" | "tsx" | "jsx" | "py" | "go" | "java" | "c" | "cpp" | "h"
        | "css" | "html" | "json" | "toml" | "yaml" | "yml" => "code",
        "zip" | "tar" | "gz" | "7z" | "rar" | "dmg" | "pkg" => "archive",
        _ => "other",
    }
}
```

**Step 3: psd_cache_key 헬퍼 함수 추가**

`lib.rs`에서 `classify_file` 함수 아래에 추가:
```rust
// PSD 썸네일 캐시 키 생성 (경로 + 수정시각 + 크기의 해시)
fn psd_cache_key(path: &str, modified_ms: u64, size: u32) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    modified_ms.hash(&mut hasher);
    size.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}
```

**Step 4: get_psd_thumbnail 커맨드 추가**

`quick_look` 커맨드 아래에 추가:
```rust
// PSD 파일 썸네일 생성 (크로스플랫폼, 디스크 캐싱)
#[tauri::command]
fn get_psd_thumbnail(
    path: String,
    size: u32,
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    // 파일 메타데이터 (캐시 키용)
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let cache_key = psd_cache_key(&path, modified_ms, size);

    // 디스크 캐시 디렉토리
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("psd_thumbnails");
    let cache_file = cache_dir.join(format!("{}.png", cache_key));

    // 캐시 히트: 즉시 반환
    if cache_file.exists() {
        let data = std::fs::read(&cache_file).map_err(|e| e.to_string())?;
        use base64::Engine;
        return Ok(Some(
            base64::engine::general_purpose::STANDARD.encode(&data),
        ));
    }

    // PSD 파싱 + 썸네일 생성
    let psd_bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let psd = psd::Psd::from_bytes(&psd_bytes)
        .map_err(|e| format!("PSD 파싱 실패: {}", e))?;

    let rgba = psd.rgba();
    let width = psd.width();
    let height = psd.height();

    let img = image::RgbaImage::from_raw(width, height, rgba)
        .ok_or_else(|| "RgbaImage 생성 실패".to_string())?;
    let dyn_img = image::DynamicImage::ImageRgba8(img);
    let thumb = dyn_img.thumbnail(size, size);

    let mut buf = vec![];
    thumb
        .write_to(
            &mut std::io::Cursor::new(&mut buf),
            image::ImageFormat::Png,
        )
        .map_err(|e| e.to_string())?;

    // 디스크 캐시에 저장
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    std::fs::write(&cache_file, &buf).map_err(|e| e.to_string())?;

    use base64::Engine;
    Ok(Some(
        base64::engine::general_purpose::STANDARD.encode(&buf),
    ))
}
```

**Step 5: invoke_handler에 get_psd_thumbnail 등록**

`lib.rs`의 `tauri::generate_handler!` 배열에 `get_psd_thumbnail` 추가:
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
    quick_look,
    get_psd_thumbnail,  // 추가
])
```

**Step 6: Rust 컴파일 검증**
```bash
cd src-tauri && cargo check 2>&1
```
Expected: `Finished` (warning 있어도 됨, error 없어야 함)

**Step 7: Commit**
```bash
git add src-tauri/
git commit -m "feat: PSD 썸네일 Rust 백엔드 추가 (psd 크레이트 + 디스크 캐싱)"
```

---

### Task 5: PSD 미리보기 프론트엔드 토글

**Files:**
- Modify: `components/FileExplorer/types.ts`
- Modify: `components/FileExplorer/index.tsx`
- Modify: `components/FileExplorer/NavigationBar.tsx`
- Modify: `components/FileExplorer/FileGrid.tsx`
- Modify: `components/FileExplorer/FileCard.tsx`

**Step 1: FileExplorer/types.ts 확인 후 필요시 수정**

`components/FileExplorer/types.ts`를 읽어 `ThemeVars` 인터페이스 확인. (별도 수정 없음, 구조 확인용)

**Step 2: FileExplorer/index.tsx — showPsdPreview 상태 추가**

import에 `{ Image }` 아이콘 추가 (lucide-react):
```typescript
import { Image } from 'lucide-react'; // PSD 토글용
```

기존 상태 선언 아래에 추가:
```typescript
const PSD_PREVIEW_KEY = 'qf_show_psd_preview';
const [showPsdPreview, setShowPsdPreview] = useState<boolean>(() => {
  try { return JSON.parse(localStorage.getItem(PSD_PREVIEW_KEY) ?? 'false'); }
  catch { return false; }
});
```

localStorage 동기화 useEffect 추가 (기존 sortBy/sortDir 저장 useEffect 옆에):
```typescript
useEffect(() => {
  localStorage.setItem(PSD_PREVIEW_KEY, JSON.stringify(showPsdPreview));
}, [showPsdPreview]);
```

NavigationBar JSX에 props 추가:
```tsx
<NavigationBar
  // ... 기존 props ...
  showPsdPreview={showPsdPreview}
  onTogglePsdPreview={() => setShowPsdPreview(p => !p)}
/>
```

FileGrid JSX에 props 추가:
```tsx
<FileGrid
  // ... 기존 props ...
  showPsdPreview={showPsdPreview}
/>
```

**Step 3: NavigationBar.tsx — PSD 토글 버튼 추가**

import에 `FileImage` 아이콘 추가:
```typescript
import { ..., FileImage } from 'lucide-react';
```

인터페이스에 추가:
```typescript
showPsdPreview: boolean;
onTogglePsdPreview: () => void;
```

함수 시그니처 destructuring에 추가:
```typescript
showPsdPreview,
onTogglePsdPreview,
```

네비게이션 버튼들 뒤 (divider 앞)에 PSD 토글 버튼 추가:
```tsx
{/* PSD 미리보기 토글 */}
<button
  className={btnCls(showPsdPreview)}
  onClick={onTogglePsdPreview}
  title={`PSD 미리보기 ${showPsdPreview ? '끄기' : '켜기'}`}
>
  <FileImage size={15} />
</button>
```

**Step 4: FileGrid.tsx — showPsdPreview prop 전달**

`FileGridProps` 인터페이스에 추가:
```typescript
showPsdPreview: boolean;
```

FileCard에 전달:
```tsx
<FileCard
  // ... 기존 props ...
  showPsdPreview={showPsdPreview}
/>
```

ListRow, DetailsRow는 썸네일 없음 → 전달 불필요.

**Step 5: FileCard.tsx — PSD 조건부 썸네일 로딩**

`FileCardProps` 인터페이스에 추가:
```typescript
showPsdPreview: boolean;
```

함수 destructuring에 추가:
```typescript
showPsdPreview,
```

기존 썸네일 로딩 useEffect 교체:
```typescript
// 화면에 보일 때 썸네일 요청 (일반 이미지 또는 PSD)
useEffect(() => {
  if (!isVisible || thumbnail) return;
  const ext = entry.path.split('.').pop()?.toLowerCase();

  if (entry.file_type === 'image' && ext !== 'psd') {
    // 일반 이미지
    invoke<string | null>('get_file_thumbnail', { path: entry.path, size: thumbnailSize })
      .then(b64 => { if (b64) setThumbnail(`data:image/png;base64,${b64}`); })
      .catch(() => {});
  } else if (entry.file_type === 'image' && ext === 'psd' && showPsdPreview) {
    // PSD (토글 활성 시에만)
    invoke<string | null>('get_psd_thumbnail', { path: entry.path, size: thumbnailSize })
      .then(b64 => { if (b64) setThumbnail(`data:image/png;base64,${b64}`); })
      .catch(() => {});
  }
}, [isVisible, entry.file_type, entry.path, thumbnailSize, showPsdPreview]);
```

**Step 6: TypeScript + Rust 검증**
```bash
npx tsc --noEmit && cd src-tauri && cargo check 2>&1 | tail -3
```

**Step 7: Commit**
```bash
git add components/FileExplorer/ src-tauri/
git commit -m "feat: PSD 미리보기 토글 버튼 + FileCard PSD 썸네일 연동"
```

---

### Task 6: 외부 앱으로 파일 드래그 설정 + 구현

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `package.json`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/src/lib.rs`
- Modify: `components/FileExplorer/FileCard.tsx`
- Modify: `components/FileExplorer/FileGrid.tsx`

**Step 1: tauri-plugin-drag Cargo 의존성 추가**

`src-tauri/Cargo.toml` `[dependencies]`에 추가:
```toml
tauri-plugin-drag = "2"
```

**Step 2: npm 패키지 설치**
```bash
npm install @tauri-apps/plugin-drag
```

설치 후 `package.json`의 dependencies에 추가됐는지 확인.

**Step 3: capabilities/default.json에 drag 권한 추가**

`permissions` 배열에 추가:
```json
"drag:default"
```

결과:
```json
{
  "permissions": [
    "core:default",
    "core:window:allow-close",
    "core:window:allow-minimize",
    "opener:default",
    "clipboard-manager:default",
    "dialog:default",
    "updater:default",
    "updater:allow-check",
    "updater:allow-download",
    "updater:allow-install",
    "process:default",
    "process:allow-restart",
    "drag:default"
  ]
}
```

**Step 4: lib.rs에 drag 플러그인 등록**

`run()` 함수의 플러그인 체인에 추가:
```rust
.plugin(tauri_plugin_drag::init())
```

**Step 5: FileGrid.tsx에 dragPaths prop 추가**

`FileGridProps` 인터페이스에 추가:
```typescript
selectedPaths: string[]; // 이미 있음 — 확인만
```

FileCard JSX에 `dragPaths` prop 추가:
```tsx
<FileCard
  // ... 기존 props ...
  dragPaths={
    selectedPaths.includes(entry.path) && selectedPaths.length > 1
      ? selectedPaths
      : [entry.path]
  }
/>
```

**Step 6: FileCard.tsx에 외부 드래그 구현**

import 추가:
```typescript
import { drag } from '@tauri-apps/plugin-drag';
```

`FileCardProps` 인터페이스에 추가:
```typescript
dragPaths: string[];
```

함수 destructuring에 추가:
```typescript
dragPaths,
```

외부 드래그 핸들러 추가 (기존 handleClick 아래):
```typescript
const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
  if (e.button !== 0) return; // 좌클릭만
  const startX = e.clientX;
  const startY = e.clientY;

  const onMouseMove = async (moveEvent: MouseEvent) => {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    if (Math.sqrt(dx * dx + dy * dy) > 6) {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      try {
        await drag({ items: dragPaths });
      } catch {
        // 드래그 실패 무시 (앱 내부 클릭인 경우)
      }
    }
  };

  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
};
```

카드 div에 `onMouseDown={handleMouseDown}` 추가:
```tsx
<div
  ref={cardRef}
  className="flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer select-none transition-all"
  style={{ ... }}
  onClick={handleClick}
  onDoubleClick={handleDoubleClick}
  onContextMenu={handleContextMenu}
  onMouseDown={handleMouseDown}
  title={entry.path}
>
```

**Step 7: Rust + TypeScript 검증**
```bash
npx tsc --noEmit && cd src-tauri && cargo check 2>&1 | tail -3
```

만약 `tauri-plugin-drag`를 찾을 수 없다면:
- crates.io에서 정확한 버전 확인: `cargo search tauri-plugin-drag`
- npm에서 확인: `npm show @tauri-apps/plugin-drag version`

**Step 8: Commit**
```bash
git add src-tauri/ components/FileExplorer/FileCard.tsx components/FileExplorer/FileGrid.tsx package.json package-lock.json
git commit -m "feat: 탐색기 파일을 외부 앱으로 드래그 기능 추가"
```

---

### Task 7: 탭 타입 정의 + TabBar 컴포넌트

**Files:**
- Modify: `components/FileExplorer/types.ts`
- Create: `components/FileExplorer/TabBar.tsx`

**Step 1: types.ts에 Tab 인터페이스 추가**

`components/FileExplorer/types.ts` 마지막에 추가:
```typescript
export interface Tab {
  id: string;
  path: string;
  history: string[];
  historyIndex: number;
  title: string;
}
```

**Step 2: TabBar.tsx 생성**

`components/FileExplorer/TabBar.tsx` 신규 생성:
```typescript
import React from 'react';
import { X } from 'lucide-react';
import { Tab } from './types';
import { ThemeVars } from './types';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  themeVars: ThemeVars | null;
}

export default function TabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  themeVars,
}: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div
      className="flex items-center overflow-x-auto flex-shrink-0 border-b"
      style={{
        backgroundColor: themeVars?.surface2 ?? '#1f2937',
        borderColor: themeVars?.border ?? '#334155',
        scrollbarWidth: 'none',
      }}
    >
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className="flex items-center gap-1 px-3 py-1.5 border-r cursor-pointer flex-shrink-0 group"
            style={{
              maxWidth: 160,
              borderColor: themeVars?.border ?? '#334155',
              backgroundColor: isActive ? (themeVars?.bg ?? '#0f172a') : 'transparent',
              borderBottom: isActive
                ? `2px solid ${themeVars?.accent ?? '#3b82f6'}`
                : '2px solid transparent',
            }}
            onClick={() => onTabSelect(tab.id)}
            onAuxClick={(e) => {
              if (e.button === 1) { e.preventDefault(); onTabClose(tab.id); }
            }}
            title={tab.path}
          >
            <span
              className="text-xs truncate flex-1 min-w-0"
              style={{ color: isActive ? (themeVars?.text ?? '#e5e7eb') : (themeVars?.muted ?? '#94a3b8') }}
            >
              {tab.title || '새 탭'}
            </span>
            <button
              className="opacity-0 group-hover:opacity-100 flex-shrink-0 rounded p-0.5 transition-opacity hover:bg-[var(--qf-surface-hover)]"
              style={{ color: themeVars?.muted ?? '#94a3b8' }}
              onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
              title="탭 닫기"
            >
              <X size={10} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 3: TypeScript 검증**
```bash
npx tsc --noEmit
```

**Step 4: Commit**
```bash
git add components/FileExplorer/types.ts components/FileExplorer/TabBar.tsx
git commit -m "feat: Tab 타입 정의 + TabBar 컴포넌트 구현"
```

---

### Task 8: 탭 상태 관리 + FileExplorer 리팩토링

**Files:**
- Modify: `components/FileExplorer/index.tsx`

**Step 1: Tab import 추가**

`index.tsx` import 상단에:
```typescript
import { FileEntry, ClipboardData, ThumbnailSize } from '../../types';
import { ThemeVars, Tab } from './types';
import TabBar from './TabBar';
```

**Step 2: Props 인터페이스 수정 (currentPath → initialPath)**

```typescript
interface FileExplorerProps {
  initialPath: string;   // currentPath에서 이름 변경
  onPathChange: (path: string) => void;
  onAddToFavorites: (path: string, name: string) => void;
  themeVars: ThemeVars | null;
}

export default function FileExplorer({
  initialPath,    // currentPath에서 이름 변경
  onPathChange,
  onAddToFavorites,
  themeVars,
}: FileExplorerProps) {
```

**Step 3: 탭 상태 추가 + 기존 history 상태 제거**

기존 `history`, `historyIndex` 상태 제거 후 탭 상태로 교체:
```typescript
// 탭 상태 (localStorage 영속)
const TABS_KEY = 'qf_explorer_tabs';
const ACTIVE_TAB_KEY = 'qf_explorer_active_tab';

const [tabs, setTabs] = useState<Tab[]>(() => {
  try { return JSON.parse(localStorage.getItem(TABS_KEY) ?? '[]'); }
  catch { return []; }
});
const [activeTabId, setActiveTabId] = useState<string>(() => {
  return localStorage.getItem(ACTIVE_TAB_KEY) ?? '';
});

// 현재 활성 탭에서 파생된 값
const activeTab = tabs.find(t => t.id === activeTabId) ?? null;
const currentPath = activeTab?.path ?? '';
const canGoBack = !!(activeTab && activeTab.historyIndex > 0);
const canGoForward = !!(activeTab && activeTab.historyIndex < activeTab.history.length - 1);
```

탭 localStorage 동기화:
```typescript
useEffect(() => {
  localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
}, [tabs]);

useEffect(() => {
  localStorage.setItem(ACTIVE_TAB_KEY, activeTabId);
}, [activeTabId]);
```

**Step 4: initialPath 변경 감지 → 탭 생성/전환**

```typescript
// initialPath 변경 시 탭 생성 또는 기존 탭으로 전환
useEffect(() => {
  if (!initialPath) return;
  const existing = tabs.find(t => t.path === initialPath);
  if (existing) {
    setActiveTabId(existing.id);
    loadDirectory(initialPath);
  } else {
    const title = initialPath.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? initialPath;
    const newTab: Tab = {
      id: crypto.randomUUID(),
      path: initialPath,
      history: [initialPath],
      historyIndex: 0,
      title,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    loadDirectory(initialPath);
  }
}, [initialPath]);
```

**Step 5: navigateTo, goBack, goForward 탭 기반으로 교체**

기존 `navigateTo`, `goBack`, `goForward` 함수 교체:
```typescript
const navigateTo = useCallback((path: string) => {
  const title = path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? path;
  setTabs(prev => prev.map(tab => {
    if (tab.id !== activeTabId) return tab;
    const newHistory = tab.history.slice(0, tab.historyIndex + 1);
    return {
      ...tab,
      path,
      title,
      history: [...newHistory, path],
      historyIndex: newHistory.length,
    };
  }));
  onPathChange(path);
  loadDirectory(path);
}, [activeTabId, onPathChange, loadDirectory]);

const goBack = useCallback(() => {
  if (!activeTab || activeTab.historyIndex <= 0) return;
  const newPath = activeTab.history[activeTab.historyIndex - 1];
  const title = newPath.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? newPath;
  setTabs(prev => prev.map(t =>
    t.id === activeTabId ? { ...t, path: newPath, title, historyIndex: t.historyIndex - 1 } : t
  ));
  onPathChange(newPath);
  loadDirectory(newPath);
}, [activeTab, activeTabId, onPathChange, loadDirectory]);

const goForward = useCallback(() => {
  if (!activeTab || activeTab.historyIndex >= activeTab.history.length - 1) return;
  const newPath = activeTab.history[activeTab.historyIndex + 1];
  const title = newPath.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? newPath;
  setTabs(prev => prev.map(t =>
    t.id === activeTabId ? { ...t, path: newPath, title, historyIndex: t.historyIndex + 1 } : t
  ));
  onPathChange(newPath);
  loadDirectory(newPath);
}, [activeTab, activeTabId, onPathChange, loadDirectory]);
```

**Step 6: 탭 관리 핸들러 추가**

```typescript
const handleTabSelect = useCallback((tabId: string) => {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  setActiveTabId(tabId);
  loadDirectory(tab.path);
}, [tabs, loadDirectory]);

const handleTabClose = useCallback((tabId: string) => {
  setTabs(prev => {
    const newTabs = prev.filter(t => t.id !== tabId);
    if (tabId === activeTabId && newTabs.length > 0) {
      const closedIdx = prev.findIndex(t => t.id === tabId);
      const nextTab = newTabs[Math.min(closedIdx, newTabs.length - 1)];
      setActiveTabId(nextTab.id);
      loadDirectory(nextTab.path);
    } else if (newTabs.length === 0) {
      setActiveTabId('');
    }
    return newTabs;
  });
}, [activeTabId, loadDirectory]);
```

**Step 7: 렌더링에 TabBar 추가**

`return` 내 최상단 div 바로 안에 TabBar 추가:
```tsx
return (
  <div ref={containerRef} className="flex flex-col h-full overflow-hidden" ...>
    <TabBar
      tabs={tabs}
      activeTabId={activeTabId}
      onTabSelect={handleTabSelect}
      onTabClose={handleTabClose}
      themeVars={themeVars}
    />
    {currentPath ? (
      <>
        <NavigationBar ... />
        {/* 기존 FileGrid, ContextMenu, StatusBar 등 */}
      </>
    ) : (
      <div className="flex-1 flex items-center justify-center" style={{ color: themeVars?.muted }}>
        <p className="text-xs">즐겨찾기에서 폴더를 선택하세요</p>
      </div>
    )}
  </div>
);
```

**Step 8: TypeScript 검증**
```bash
npx tsc --noEmit
```

모든 오류 수정 후:

**Step 9: Commit**
```bash
git add components/FileExplorer/index.tsx
git commit -m "feat: 탭 상태 관리 (per-tab 히스토리, localStorage 영속, 탭 생성/닫기)"
```

---

### Task 9: 탭 키보드 단축키 (Ctrl+T, Tab, Shift+Tab)

**Files:**
- Modify: `components/FileExplorer/index.tsx`

**Step 1: 키보드 핸들러에 탭 단축키 추가**

기존 `handleKeyDown` 함수에서 `if (renamingPath) return;` 직후, 내비게이션 단축키 앞에 추가:

```typescript
// --- 탭 단축키 ---
// Ctrl+T: 현재 탭 복제
if (ctrl && e.key === 't') {
  e.preventDefault();
  if (!activeTab) return;
  const newTab: Tab = {
    id: crypto.randomUUID(),
    path: activeTab.path,
    history: [activeTab.path],
    historyIndex: 0,
    title: activeTab.title,
  };
  setTabs(prev => {
    const idx = prev.findIndex(t => t.id === activeTabId);
    return [...prev.slice(0, idx + 1), newTab, ...prev.slice(idx + 1)];
  });
  setActiveTabId(newTab.id);
  return;
}

// Tab / Shift+Tab: 탭 순환
if (e.key === 'Tab' && !isInput) {
  e.preventDefault();
  if (tabs.length <= 1) return;
  const currentIdx = tabs.findIndex(t => t.id === activeTabId);
  if (e.shiftKey) {
    // 왼쪽 순환
    const prevIdx = (currentIdx - 1 + tabs.length) % tabs.length;
    handleTabSelect(tabs[prevIdx].id);
  } else {
    // 오른쪽 순환
    const nextIdx = (currentIdx + 1) % tabs.length;
    handleTabSelect(tabs[nextIdx].id);
  }
  return;
}
```

**Step 2: useEffect 의존성 배열 업데이트**

키보드 useEffect deps에 추가:
```typescript
}, [
  renamingPath, selectAll, handleCopy, handleCut, handlePaste,
  handleCreateDirectory, handleRenameStart, handleDelete,
  goBack, goForward, goUp, selectedPaths, entries, openEntry,
  thumbnailSize, focusedIndex,
  // 탭 관련 추가
  tabs, activeTabId, activeTab, handleTabSelect,
]);
```

**Step 3: TypeScript 검증**
```bash
npx tsc --noEmit
```

**Step 4: Commit**
```bash
git add components/FileExplorer/index.tsx
git commit -m "feat: 탭 키보드 단축키 (Ctrl+T 복제, Tab/Shift+Tab 순환)"
```

---

### Task 10: 탭-즐겨찾기 연동 + App.tsx 업데이트

**Files:**
- Modify: `App.tsx`

**Step 1: FileExplorer currentPath → initialPath prop 이름 변경**

`App.tsx`에서 `<FileExplorer>` JSX prop 업데이트:
```tsx
<FileExplorer
  initialPath={explorerPath}    // currentPath → initialPath
  onPathChange={setExplorerPath}
  onAddToFavorites={handleAddFavoriteFromExplorer}
  themeVars={themeVars}
/>
```

**Step 2: TypeScript 검증**
```bash
npx tsc --noEmit
```
Expected: 오류 없음

**Step 3: 전체 기능 통합 검증**
```bash
npx tsc --noEmit && cd src-tauri && cargo check 2>&1 | tail -5
```

**Step 4: 최종 Commit**
```bash
git add App.tsx
git commit -m "feat: 즐겨찾기 클릭 → 탐색기 탭 자동 생성/전환 연동"
```

---

## 검증 체크리스트

앱 실행 후 (`npm run tauri dev`) 확인:

| # | 기능 | 확인 방법 |
|---|------|-----------|
| 1 | zoom 기본값 80% | 앱 첫 실행 시 즐겨찾기 크기 확인 |
| 2 | DnD 첫 위치 이동 | 2번째 항목을 1번째로, 1번째를 2번째로 드래그 |
| 3 | 썸네일 8단계 | NavigationBar 크기 드롭다운 XS~4X 확인 |
| 4 | 이미지 규격 표시 | 이미지 파일 그리드 뷰에서 `1.2 MB · 1920×1080` 확인 |
| 5 | PSD 토글 | PSD 파일 있는 폴더에서 NavigationBar PSD 버튼 토글 |
| 6 | 외부 드래그 | 이미지 파일을 Photoshop에 드래그 |
| 7 | 탭 생성 | 즐겨찾기 클릭 시 탭 생성 확인 |
| 8 | 탭 전환 | Tab / Shift+Tab으로 탭 순환 |
| 9 | 탭 복제 | Ctrl+T로 탭 복제 |
| 10 | 탭 닫기 | X 버튼 또는 가운데 클릭 |
| 11 | 탭 영속 | 앱 재시작 후 탭 복원 확인 |
