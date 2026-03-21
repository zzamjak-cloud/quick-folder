# QuickFolder UX 개선 5종 구현 계획

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 파일명 중복 검사, macOS 클립보드 호환, 다단계 실행취소(삭제/이름변경), 접힌 카테고리 시각적 약화

**Architecture:** Rust 백엔드에 rename 안전장치와 휴지통 복원 커맨드 추가. 프론트엔드에 UndoStack 관리 훅 신설. CategoryColumn 스타일 조건부 적용.

**Tech Stack:** Tauri 2.x, React 19, TypeScript, Rust (trash crate, objc crate)

---

## 파일 구조

| 파일 | 역할 | 작업 |
|------|------|------|
| `src-tauri/src/lib.rs` | Rust 백엔드 | 수정: rename_item 중복검사, restore_trash_items 추가, read_files_from_clipboard 수정 |
| `types.ts` | 타입 정의 | 수정: UndoAction 타입 추가 |
| `components/FileExplorer/hooks/useUndoStack.ts` | 실행취소 스택 | 신규 |
| `components/FileExplorer/index.tsx` | 메인 컨트롤러 | 수정: 중복검사, undo 통합, Ctrl+Z 단축키 |
| `components/CategoryColumn.tsx` | 카테고리 렌더링 | 수정: 접힌 상태 스타일 약화 |

---

## Task 1: 파일명 중복 검사 (Rust rename_item 안전장치)

**Files:**
- Modify: `src-tauri/src/lib.rs:727-731`

- [ ] **Step 1: rename_item에 대상 경로 존재 여부 검사 추가**

```rust
#[tauri::command]
async fn rename_item(old_path: String, new_path: String) -> Result<(), String> {
    // 같은 경로면 아무 것도 하지 않음
    if old_path == new_path { return Ok(()); }
    // 대상 경로에 이미 파일이 존재하면 에러
    if std::path::Path::new(&new_path).exists() {
        return Err("동일한 이름의 파일이 존재합니다.".to_string());
    }
    std::fs::rename(&old_path, &new_path)
        .map_err(|e| format!("이름 변경 실패: {}", e))
}
```

- [ ] **Step 2: 프론트엔드 handleRenameCommit에서 에러를 toast로 표시**

`components/FileExplorer/index.tsx` - handleRenameCommit의 catch 블록 수정:

```typescript
} catch (e) {
  const errMsg = String(e);
  if (errMsg.includes('동일한 이름의 파일이 존재합니다')) {
    showCopyToast('동일한 이름의 파일이 존재합니다.');
  } else {
    console.error('이름 변경 실패:', e);
  }
  // 실패 시 디렉토리 재로드하여 원래 이름 복원
  if (currentPath) {
    const result = await invoke<FileEntry[]>('list_directory', { path: currentPath });
    setEntries(sortEntries(result, sortBy, sortDir));
  }
}
```

- [ ] **Step 3: 동작 확인 — 같은 디렉토리에 동일 이름 파일이 있을 때 rename 시도**

예상: toast "동일한 이름의 파일이 존재합니다." 표시, 파일 유지

- [ ] **Step 4: 커밋**

```bash
git add src-tauri/src/lib.rs components/FileExplorer/index.tsx
git commit -m "fix: 파일명 변경 시 중복 이름 검사 추가"
```

---

## Task 2: macOS Finder 클립보드 읽기 수정

**Files:**
- Modify: `src-tauri/src/lib.rs:1826-1865`

- [ ] **Step 1: read_files_from_clipboard_native에 NSPasteboardReadingFileURLsOnlyKey 옵션 추가**

Finder는 Cmd+C 시 `com.apple.pasteboard.promised-file-url` 등을 사용할 수 있음. `readObjectsForClasses:options:`에 파일 URL 전용 옵션을 전달해야 정상 동작:

```rust
#[cfg(target_os = "macos")]
fn read_files_from_clipboard_native() -> Result<Vec<String>, String> {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};

    unsafe {
        let pb_class = Class::get("NSPasteboard").ok_or("NSPasteboard not found")?;
        let pb: *mut Object = msg_send![pb_class, generalPasteboard];
        if pb.is_null() { return Err("generalPasteboard is null".into()); }

        // 방법 1: readObjectsForClasses with fileURLsOnly 옵션
        let url_class = Class::get("NSURL").ok_or("NSURL not found")?;
        let arr_class = Class::get("NSArray").ok_or("NSArray not found")?;
        let dict_class = Class::get("NSDictionary").ok_or("NSDictionary not found")?;
        let nsnum_class = Class::get("NSNumber").ok_or("NSNumber not found")?;
        let nsstr_class = Class::get("NSString").ok_or("NSString not found")?;

        let classes: *mut Object = msg_send![arr_class, arrayWithObject: url_class];

        // NSPasteboardURLReadingFileURLsOnlyKey = @"NSPasteboardURLReadingFileURLsOnlyKey"
        let key_str = std::ffi::CString::new("NSPasteboardURLReadingFileURLsOnlyKey").unwrap();
        let key: *mut Object = msg_send![nsstr_class, stringWithUTF8String: key_str.as_ptr()];
        let yes_val: *mut Object = msg_send![nsnum_class, numberWithBool: true];
        let options: *mut Object = msg_send![dict_class, dictionaryWithObject: yes_val forKey: key];

        let urls: *mut Object = msg_send![pb, readObjectsForClasses: classes options: options];
        if urls.is_null() { return Ok(vec![]); }

        let count: usize = msg_send![urls, count];
        let mut result = Vec::with_capacity(count);

        for i in 0..count {
            let url: *mut Object = msg_send![urls, objectAtIndex: i];
            if url.is_null() { continue; }

            let is_file: i8 = msg_send![url, isFileURL];
            if is_file == 0 { continue; }

            let path: *mut Object = msg_send![url, path];
            if path.is_null() { continue; }

            let utf8: *const std::os::raw::c_char = msg_send![path, UTF8String];
            if utf8.is_null() { continue; }

            let path_str = std::ffi::CStr::from_ptr(utf8).to_string_lossy().to_string();
            result.push(path_str);
        }

        // 방법 1 실패 시 방법 2: NSFilenamesPboardType 폴백
        if result.is_empty() {
            let ptype_str = std::ffi::CString::new("NSFilenamesPboardType").unwrap();
            let ptype: *mut Object = msg_send![nsstr_class, stringWithUTF8String: ptype_str.as_ptr()];
            let plist: *mut Object = msg_send![pb, propertyListForType: ptype];
            if !plist.is_null() {
                let pcount: usize = msg_send![plist, count];
                for i in 0..pcount {
                    let item: *mut Object = msg_send![plist, objectAtIndex: i];
                    if item.is_null() { continue; }
                    let utf8: *const std::os::raw::c_char = msg_send![item, UTF8String];
                    if utf8.is_null() { continue; }
                    let s = std::ffi::CStr::from_ptr(utf8).to_string_lossy().to_string();
                    result.push(s);
                }
            }
        }

        Ok(result)
    }
}
```

- [ ] **Step 2: 동작 확인 — macOS Finder에서 Cmd+C → QuickFolder에서 Cmd+V**

예상: Finder에서 복사한 파일이 QuickFolder 현재 디렉토리에 붙여넣기됨

- [ ] **Step 3: 커밋**

```bash
git add src-tauri/src/lib.rs
git commit -m "fix: macOS Finder 클립보드 파일 읽기 호환성 개선"
```

---

## Task 3: UndoAction 타입 정의

**Files:**
- Modify: `types.ts`

- [ ] **Step 1: UndoAction 유니온 타입 추가**

`types.ts` 하단에 추가:

```typescript
// 실행취소 액션 타입
export type UndoAction =
  | { type: 'delete'; paths: string[]; directory: string; useTrash: boolean }
  | { type: 'rename'; oldPath: string; newPath: string };
```

- [ ] **Step 2: 커밋**

```bash
git add types.ts
git commit -m "feat: UndoAction 타입 정의 추가"
```

---

## Task 4: useUndoStack 훅 구현

**Files:**
- Create: `components/FileExplorer/hooks/useUndoStack.ts`

- [ ] **Step 1: useUndoStack 훅 작성**

```typescript
import { useState, useCallback } from 'react';
import { UndoAction } from '../../../types';

const MAX_UNDO = 10;

export function useUndoStack() {
  const [stack, setStack] = useState<UndoAction[]>([]);

  const push = useCallback((action: UndoAction) => {
    setStack(prev => [...prev.slice(-(MAX_UNDO - 1)), action]);
  }, []);

  const pop = useCallback((): UndoAction | undefined => {
    let action: UndoAction | undefined;
    setStack(prev => {
      if (prev.length === 0) return prev;
      action = prev[prev.length - 1];
      return prev.slice(0, -1);
    });
    return action;
  }, []);

  const canUndo = stack.length > 0;

  return { push, pop, canUndo };
}
```

- [ ] **Step 2: 커밋**

```bash
git add components/FileExplorer/hooks/useUndoStack.ts
git commit -m "feat: useUndoStack 훅 구현 (최대 10단계)"
```

---

## Task 5: Rust 휴지통 복원 커맨드 추가

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: restore_trash_items 커맨드 추가**

`delete_items` 함수 뒤에 추가:

```rust
// 휴지통에서 파일 복원 (원래 경로로)
#[tauri::command]
async fn restore_trash_items(original_paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        // 휴지통 전체 항목 조회
        let items = trash::os_limited::list()
            .map_err(|e| format!("휴지통 조회 실패: {}", e))?;

        for target_path in &original_paths {
            let target = std::path::Path::new(target_path);
            // 원래 경로와 일치하는 항목 찾기 (가장 최근 것)
            let mut matching: Vec<_> = items.iter()
                .filter(|item| item.original_parent == target.parent().unwrap_or(std::path::Path::new("")))
                .filter(|item| item.name == target.file_name().unwrap_or_default().to_string_lossy().as_ref())
                .collect();
            // 가장 최근에 삭제된 항목 선택 (time 기준 정렬)
            matching.sort_by(|a, b| b.time_deleted.cmp(&a.time_deleted));
            if let Some(item) = matching.first() {
                trash::os_limited::purge_all(std::iter::once(*item))
                    .map_err(|e| format!("복원 실패 {}: {}", target_path, e))?;
            }
        }
        Ok(())
    }).await.map_err(|e| format!("복원 작업 실패: {}", e))?
}
```

**참고:** `trash::os_limited::purge_all`은 영구 삭제. 복원에는 `trash::os_limited::restore_all`을 사용해야 함. 수정:

```rust
if let Some(item) = matching.first() {
    trash::os_limited::restore_all(std::iter::once(*item))
        .map_err(|e| format!("복원 실패 {}: {}", target_path, e))?;
}
```

- [ ] **Step 2: invoke_handler에 restore_trash_items 등록**

`lib.rs`의 `tauri::generate_handler![]`에 `restore_trash_items` 추가.

- [ ] **Step 3: 동작 확인 — 파일 삭제 후 복원 커맨드 호출**

예상: 휴지통에서 원래 위치로 파일 복원

- [ ] **Step 4: 커밋**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: 휴지통 복원 커맨드 (restore_trash_items) 추가"
```

---

## Task 6: FileExplorer에 실행취소 통합

**Files:**
- Modify: `components/FileExplorer/index.tsx`

- [ ] **Step 1: useUndoStack 임포트 및 초기화**

```typescript
import { useUndoStack } from './hooks/useUndoStack';
// ... 컴포넌트 내부:
const undoStack = useUndoStack();
```

- [ ] **Step 2: handleDelete를 수정하여 undo 스택에 push**

```typescript
const handleDelete = useCallback(async (paths: string[], permanent = false) => {
  if (paths.length === 0) return;
  try {
    await invoke('delete_items', { paths, useTrash: !permanent });
    // 휴지통 삭제만 실행취소 가능 (영구삭제는 복원 불가)
    if (!permanent) {
      undoStack.push({ type: 'delete', paths: [...paths], directory: currentPath, useTrash: true });
    }
    setSelectedPaths(prev => prev.filter(p => !paths.includes(p)));
    loadDirectory(currentPath);
  } catch (e) {
    console.error('삭제 실패:', e);
    setError(`삭제 실패: ${e}`);
  }
}, [currentPath, loadDirectory, undoStack]);
```

- [ ] **Step 3: handleRenameCommit를 수정하여 undo 스택에 push**

rename 성공 시 각 renamedPath에 대해 push:

```typescript
// renamedPaths 생성 루프 안에서 수집
const undoRenames: { oldPath: string; newPath: string }[] = [];
for (const p of batchPaths) {
  // ... 기존 rename 로직 ...
  if (targetPath !== p) {
    await invoke('rename_item', { oldPath: p, newPath: targetPath });
    undoRenames.push({ oldPath: p, newPath: targetPath });
  }
  renamedPaths.push(targetPath);
}
// undo 스택에 역순으로 push (가장 마지막 rename을 먼저 되돌리기 위해)
for (const r of undoRenames.reverse()) {
  undoStack.push({ type: 'rename', oldPath: r.newPath, newPath: r.oldPath });
}
```

- [ ] **Step 4: handleUndo 함수 구현**

```typescript
const handleUndo = useCallback(async () => {
  const action = undoStack.pop();
  if (!action) return;

  try {
    if (action.type === 'delete') {
      await invoke('restore_trash_items', { originalPaths: action.paths });
      showCopyToast('삭제 취소됨');
    } else if (action.type === 'rename') {
      // oldPath = 현재 이름 (undo 시 되돌릴 대상), newPath = 원래 이름
      await invoke('rename_item', { oldPath: action.oldPath, newPath: action.newPath });
      showCopyToast('이름 변경 취소됨');
    }
    if (currentPath) {
      loadDirectory(currentPath);
    }
  } catch (e) {
    console.error('실행취소 실패:', e);
    showCopyToast('실행취소 실패');
  }
}, [undoStack, currentPath, loadDirectory, showCopyToast]);
```

- [ ] **Step 5: Ctrl+Z (Cmd+Z) 키보드 단축키 등록**

키보드 핸들러에서 `ctrl && e.key === 'z'` 처리 추가 (기존 파일 조작 단축키 섹션에):

```typescript
if (ctrl && e.key === 'z') { e.preventDefault(); handleUndo(); return; }
```

`handleUndo`를 키보드 핸들러의 deps 배열에 추가.

- [ ] **Step 6: 동작 확인**

1. 파일 삭제 → Ctrl+Z → 파일 복원 확인
2. 파일 이름 변경 → Ctrl+Z → 원래 이름 복원 확인
3. 연속 3회 작업 후 Ctrl+Z 3회 → 모두 되돌리기 확인

- [ ] **Step 7: 커밋**

```bash
git add components/FileExplorer/index.tsx
git commit -m "feat: 다단계 실행취소 (Ctrl+Z) - 삭제, 이름변경 되돌리기"
```

---

## Task 7: 접힌 카테고리 시각적 약화

**Files:**
- Modify: `components/CategoryColumn.tsx:97-144`

- [ ] **Step 1: 접힌 상태일 때 외곽 컨테이너 스타일 분기**

현재 (line 101):
```tsx
className={`border rounded-2xl overflow-hidden backdrop-blur-sm transition-colors group flex flex-col w-full bg-[var(--qf-surface)] border-[var(--qf-border)] hover:border-[var(--qf-border)] ${isDragging ? '...' : ''}`}
```

변경:
```tsx
className={`overflow-hidden transition-all group flex flex-col w-full ${
  isExpanded
    ? `border rounded-2xl backdrop-blur-sm bg-[var(--qf-surface)] border-[var(--qf-border)] hover:border-[var(--qf-border)]`
    : `border border-transparent rounded-xl opacity-60 hover:opacity-80`
} ${isDragging ? 'shadow-2xl shadow-[var(--qf-accent-20)]' : ''}`}
```

- [ ] **Step 2: 접힌 상태일 때 헤더 스타일 약화**

현재 (line 104):
```tsx
className={`px-2.5 py-1.5 border-b flex items-center justify-between bg-[var(--qf-surface-2)] border-[var(--qf-border)] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
```

변경:
```tsx
className={`px-2.5 py-1.5 flex items-center justify-between ${
  isExpanded
    ? `border-b bg-[var(--qf-surface-2)] border-[var(--qf-border)]`
    : ``
} ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
```

- [ ] **Step 3: 접힌 상태 marginTop 축소**

style 객체 (line 69) 수정:

```typescript
const style: React.CSSProperties = {
  opacity: isDragging ? 0.5 : 1,
  breakInside: 'avoid' as const,
  display: 'inline-block',
  width: '100%',
  marginTop: isExpanded ? '0.75rem' : '0.25rem',
};
```

- [ ] **Step 4: 동작 확인 — 카테고리 접기/펼치기**

예상: 접힌 카테고리는 배경 없이, 투명도 낮게, 간격 좁게 표시됨. 펼치면 원래 스타일로 복원.

- [ ] **Step 5: 커밋**

```bash
git add components/CategoryColumn.tsx
git commit -m "feat: 접힌 카테고리 시각적 약화 (배경 제거, 투명도 감소)"
```

---

## 최종 점검

- [ ] `npm run build` 프론트엔드 빌드 성공 확인
- [ ] `cd src-tauri && cargo check` Rust 컴파일 확인
- [ ] `npm run tauri dev`로 5개 기능 전체 수동 테스트
