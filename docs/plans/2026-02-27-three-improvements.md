# 썸네일 갱신 + 이미지 붙여넣기 + 일괄 이름변경 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 외부 파일 수정 시 썸네일 자동 갱신, 클립보드 이미지 붙여넣기, 동일 파일명 일괄 이름변경 구현

**Architecture:** (1) FileCard의 썸네일 useEffect에 `entry.modified` 의존성 추가로 캐시 무효화 자동 트리거 (2) Rust 백엔드에 클립보드 이미지 데이터 읽기+파일 저장 커맨드 추가 (3) 프론트엔드 일괄 이름변경 로직 추가

**Tech Stack:** Tauri 2.x (Rust), React 19, TypeScript

---

## Task 1: 외부 파일 수정 시 썸네일 자동 갱신

### 근본 원인

FileCard.tsx 110번줄의 썸네일 로딩 useEffect 의존성 배열:
```typescript
[isVisible, entry.file_type, entry.path, thumbnailSize, isPsd]
```
`entry.modified`가 빠져 있어서, 파일이 외부에서 수정되어도 `entry.path`가 동일하면 썸네일 useEffect가 재실행되지 않음.

Rust 백엔드의 캐시 키는 `path + modified + size`를 해시하므로, useEffect가 재실행되면 새로운 캐시 키로 갱신된 썸네일을 받게 됨.

### Step 1: FileCard.tsx 썸네일 의존성 배열에 `entry.modified` 추가

**파일:** `components/FileExplorer/FileCard.tsx:110`

**변경 전:**
```typescript
}, [isVisible, entry.file_type, entry.path, thumbnailSize, isPsd]);
```

**변경 후:**
```typescript
}, [isVisible, entry.file_type, entry.path, entry.modified, thumbnailSize, isPsd]);
```

### Step 2: 기존 썸네일 초기화 (수정 감지 시 이전 썸네일 즉시 제거)

**파일:** `components/FileExplorer/FileCard.tsx:79-110`

useEffect 시작 부분에서 파일이 변경되었을 때 이전 썸네일을 초기화하여, 이전 썸네일이 잠시 보이는 것을 방지:

```typescript
useEffect(() => {
  if (!isVisible) return;

  const sizeChanged = lastThumbnailSizeRef.current && lastThumbnailSizeRef.current !== thumbnailSize;
  lastThumbnailSizeRef.current = thumbnailSize;

  // 크기 변경이 아닌 첫 로드는 즉시, 크기 변경은 디바운스
  const delay = sizeChanged ? 300 : 0;

  let cancelFn: (() => void) | null = null;

  const timer = setTimeout(() => {
    const requestSize = thumbnailSize;
    let cmd = '';
    if (entry.file_type === 'image') cmd = 'get_file_thumbnail';
    else if (entry.file_type === 'video') cmd = 'get_video_thumbnail';

    if (cmd) {
      const { promise, cancel } = queuedInvoke<string | null>(cmd, { path: entry.path, size: requestSize });
      cancelFn = cancel;
      promise
        .then(b64 => { if (b64) setThumbnail(`data:image/png;base64,${b64}`); })
        .catch(() => {/* 취소 또는 실패 무시 */});
    }
  }, delay);

  return () => {
    clearTimeout(timer);
    if (cancelFn) cancelFn();
  };
}, [isVisible, entry.file_type, entry.path, entry.modified, thumbnailSize, isPsd]);
```

### Step 3: 확인 및 커밋

`npm run build`로 빌드 확인 후 커밋.

---

## Task 2: 외부 앱에서 복사한 이미지 데이터를 파일로 붙여넣기

### 구현 개요

1. Rust: 클립보드에서 이미지 데이터(비트맵) 읽어서 PNG 파일로 저장하는 커맨드 추가
2. Frontend: handlePaste에서 파일 경로가 없으면 이미지 데이터 붙여넣기 시도

### Step 1: Rust 백엔드 - 클립보드 이미지 읽기 커맨드 추가

**파일:** `src-tauri/Cargo.toml`

`arboard` 크레이트 추가 (크로스 플랫폼 클립보드 라이브러리, 이미지 데이터 지원):
```toml
arboard = "3"
```

**파일:** `src-tauri/src/lib.rs`

`paste_image_from_clipboard` 커맨드 추가 (invoke 핸들러에도 등록):

```rust
// 클립보드 이미지 데이터를 PNG 파일로 저장
#[tauri::command]
fn paste_image_from_clipboard(dest_dir: String) -> Result<Option<String>, String> {
    use arboard::Clipboard;

    let mut clip = Clipboard::new().map_err(|e| format!("클립보드 접근 실패: {}", e))?;
    let img = match clip.get_image() {
        Ok(img) => img,
        Err(_) => return Ok(None), // 이미지 데이터 없음
    };

    // 고유 파일명 생성
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let sep = if dest_dir.contains('\\') { "\\" } else { "/" };
    let mut file_path = format!("{}{}clipboard_{}.png", dest_dir, sep, timestamp);

    // 동일 파일명 존재 시 번호 추가
    let mut counter = 1;
    while std::path::Path::new(&file_path).exists() {
        file_path = format!("{}{}clipboard_{}_{}.png", dest_dir, sep, timestamp, counter);
        counter += 1;
    }

    // RGBA → PNG 저장
    let width = img.width as u32;
    let height = img.height as u32;
    let rgba_data: Vec<u8> = img.bytes.into_owned();
    let img_buf: image::ImageBuffer<image::Rgba<u8>, Vec<u8>> =
        image::ImageBuffer::from_raw(width, height, rgba_data)
            .ok_or("이미지 버퍼 생성 실패")?;
    img_buf.save(&file_path).map_err(|e| format!("이미지 저장 실패: {}", e))?;

    Ok(Some(file_path))
}
```

invoke 핸들러 등록:
```rust
.invoke_handler(tauri::generate_handler![
    // ... 기존 커맨드들 ...
    paste_image_from_clipboard,
])
```

### Step 2: Frontend - handlePaste에서 이미지 데이터 붙여넣기 지원

**파일:** `components/FileExplorer/index.tsx:420-446`

`handlePaste` 함수 수정:

```typescript
const handlePaste = useCallback(async () => {
  if (!currentPath) return;
  try {
    // 내부 클립보드 우선, 없으면 OS 클립보드에서 읽기
    let paths: string[];
    let action: 'copy' | 'cut';
    if (clipboard) {
      paths = clipboard.paths;
      action = clipboard.action;
    } else {
      const osPaths = await invoke<string[]>('read_files_from_clipboard');
      if (osPaths && osPaths.length > 0) {
        paths = osPaths;
        action = 'copy';
      } else {
        // 파일 경로 없으면 이미지 데이터 붙여넣기 시도
        const savedPath = await invoke<string | null>('paste_image_from_clipboard', { destDir: currentPath });
        if (savedPath) {
          loadDirectory(currentPath);
          setSelectedPaths([savedPath]);
        }
        return;
      }
    }

    if (action === 'copy') {
      await invoke('copy_items', { sources: paths, dest: currentPath });
    } else {
      await invoke('move_items', { sources: paths, dest: currentPath });
      setClipboard(null);
    }
    loadDirectory(currentPath);
  } catch (e) {
    console.error('붙여넣기 실패:', e);
  }
}, [clipboard, currentPath, loadDirectory]);
```

### Step 3: 빌드 확인 및 커밋

`npm run build`로 빌드 확인 후 커밋.

---

## Task 3: 동일 파일명(다른 확장자) 일괄 이름변경

### 구현 개요

Windows 탐색기처럼 확장자만 다르고 파일명이 동일한 여러 파일을 선택 후 F2로 일괄 이름변경. 확장자는 각각 유지하면서 베이스 이름만 변경.

### Step 1: F2 키 핸들러 수정 - 다중 선택 시 일괄 이름변경 지원

**파일:** `components/FileExplorer/index.tsx:764-767`

**변경 전:**
```typescript
if (e.key === 'F2') {
  if (selectedPaths.length === 1) handleRenameStart(selectedPaths[0]);
  return;
}
```

**변경 후:**
```typescript
if (e.key === 'F2') {
  if (selectedPaths.length === 1) {
    handleRenameStart(selectedPaths[0]);
  } else if (selectedPaths.length > 1) {
    // 동일 베이스명인 파일들만 일괄 이름변경 지원
    const getBaseName = (p: string) => {
      const name = p.split(/[/\\]/).pop() ?? '';
      const dot = name.lastIndexOf('.');
      return dot > 0 ? name.substring(0, dot) : name;
    };
    const baseNames = new Set(selectedPaths.map(getBaseName));
    if (baseNames.size === 1) {
      // 첫 번째 파일로 이름변경 UI 표시 (handleRenameCommit에서 일괄 처리)
      handleRenameStart(selectedPaths[0]);
    }
  }
  return;
}
```

### Step 2: handleRenameCommit 수정 - 일괄 이름변경 처리

**파일:** `components/FileExplorer/index.tsx:489-509`

**변경 후:**
```typescript
const handleRenameCommit = useCallback(async (oldPath: string, newName: string) => {
  setRenamingPath(null);
  if (!newName.trim()) return;
  const sep = oldPath.includes('/') ? '/' : '\\';

  // 일괄 이름변경: 선택된 파일들이 동일 베이스명이면 모두 변경
  const getBaseName = (p: string) => {
    const name = p.split(/[/\\]/).pop() ?? '';
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.substring(0, dot) : name;
  };
  const getExt = (p: string) => {
    const name = p.split(/[/\\]/).pop() ?? '';
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.substring(dot) : '';
  };

  // 새 이름에서 베이스명 추출
  const newBaseName = getBaseName(newName) || newName;
  const newExt = getExt(newName);

  // 일괄 이름변경 대상 결정
  const oldBaseName = getBaseName(oldPath);
  const batchPaths = selectedPaths.length > 1
    ? selectedPaths.filter(p => getBaseName(p) === oldBaseName)
    : [oldPath];

  try {
    const renamedPaths: string[] = [];
    for (const p of batchPaths) {
      const dir = p.substring(0, p.lastIndexOf(sep));
      const ext = p === oldPath ? newExt : getExt(p); // 대표 파일은 입력한 확장자 사용, 나머지는 기존 확장자 유지
      const targetName = newBaseName + ext;
      const targetPath = dir + sep + targetName;
      if (targetPath !== p) {
        await invoke('rename_item', { oldPath: p, newPath: targetPath });
      }
      renamedPaths.push(targetPath);
    }

    // 이름 변경 후 디렉토리 재로드
    const result = await invoke<FileEntry[]>('list_directory', { path: currentPath });
    const sorted = sortEntries(result, sortBy, sortDir);
    setEntries(sorted);
    setSelectedPaths(renamedPaths);
    const idx = sorted.findIndex(e => renamedPaths.includes(e.path));
    if (idx >= 0) setFocusedIndex(idx);
  } catch (e) {
    console.error('이름 변경 실패:', e);
  }
}, [currentPath, selectedPaths, sortBy, sortDir]);
```

### Step 3: useRenameInput 수정 - 일괄 이름변경 시 베이스명만 선택

이름변경 입력에서 이미 `selectBeforeExtension: true`가 설정되어 있어 확장자 앞까지만 선택됨. 기존 동작 유지로 충분.

### Step 4: 빌드 확인 및 커밋

`npm run build`로 빌드 확인 후 커밋.

---

## 실행 순서

1. **Task 1** (썸네일 갱신) — 가장 간단, 1줄 변경
2. **Task 2** (이미지 붙여넣기) — Rust + Frontend
3. **Task 3** (일괄 이름변경) — Frontend 로직
