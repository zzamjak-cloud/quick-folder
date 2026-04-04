# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QuickFolder Widget is a **Tauri 2.x** desktop application for managing local folder shortcuts with an integrated file explorer. It provides a categorized widget interface for quick access to frequently used directories on Windows and macOS.

## Tech Stack

- **Tauri 2.x** - Lightweight desktop application framework (Rust + Web)
- **React 19** - UI library with TypeScript
- **Vite** - Build tool and dev server
- **@dnd-kit** - Internal drag and drop functionality
- **tauri-plugin-drag** - OS-level file drag export
- **TailwindCSS** - Styling via utility classes
- **Lucide React** - Icon library
- **TipTap** - WYSIWYG 마크다운 편집기 (ProseMirror 기반)
- **marked / turndown** - MD↔HTML 변환

## Development Commands

```bash
# Install dependencies
npm install

# Run in development mode (opens Tauri app with hot reload)
npm run tauri dev

# Build application for current platform
npm run tauri build

# Build frontend only
npm run build

# Preview production build (web only)
npm run preview
```

## 개발 규칙: Undo (Ctrl+Z) 필수 지원

**모든 파일 조작 기능은 반드시 Ctrl+Z 실행취소를 지원해야 한다.** 이것은 기본 기능이며 빠뜨리면 안 된다.

새로운 파일 조작 기능 추가 시 체크리스트:
1. `types.ts`의 `UndoAction`에 해당 액션 변형(variant) 추가
2. 조작 성공 후 `undoStack.push()`로 역방향 복원 정보 기록
3. `handleUndo`에 해당 타입의 복원 로직 구현
4. 복원 후 `loadDirectory(currentPath)`로 UI 갱신

현재 지원: `delete` (휴지통 복원), `rename` (이름 되돌리기), `move_group` (그룹화 되돌리기), `create_file` (파일 생성 취소)

## 개발 규칙: 키보드 단축키 충돌 방지

단축키는 `useKeyboardShortcuts.ts`에서 관리한다. 새 단축키 추가 시 반드시 다음 규칙을 따른다:

### 수식키 조합별 분리 필수

`Ctrl+키`, `Ctrl+Shift+키`, `Ctrl+Alt+키`, `Ctrl+Shift+Alt+키`는 모두 별개의 단축키다. 기존 단축키가 상위 조합을 가로채지 않도록 **반드시 불필요한 수식키를 제외**해야 한다:

```typescript
// ✅ 올바름: Ctrl+T와 Ctrl+Shift+T가 분리됨
if (ctrl && !e.shiftKey && e.code === 'KeyT') { /* 탭 복제 */ }
if (ctrl && e.shiftKey && e.code === 'KeyT') { /* 태그 추가 */ }

// ❌ 잘못됨: Ctrl+Shift+T도 이 조건에 걸림
if (ctrl && e.code === 'KeyT') { /* 탭 복제 */ }
```

### 새 단축키 추가 체크리스트

1. 파일 내 `grep`으로 같은 키(`e.code === 'Key?'`)를 사용하는 기존 단축키 확인
2. 기존 단축키에 `!e.shiftKey`, `!e.altKey` 가드가 있는지 확인, 없으면 추가
3. 새 단축키는 수식키 조합을 명시적으로 체크 (`e.shiftKey`, `e.altKey`, `!e.altKey` 등)

### 현재 등록된 단축키 (useKeyboardShortcuts.ts)

| 단축키 | 기능 |
|--------|------|
| `Ctrl+W` | 탭 닫기 |
| `Ctrl+Alt+W` | 다른 탭 모두 닫기 |
| `Ctrl+T` | 탭 복제 |
| `Ctrl+F` | 검색 |
| `Ctrl+Shift+F` | 글로벌 검색 |
| `Ctrl+Shift+G` | 폴더로 이동 |
| `Ctrl+Shift+N` | 새 폴더 |
| `Ctrl+Shift+M` | 마크다운 파일 생성 |
| `Ctrl+Shift+P` | 동영상 압축 (보통 화질) |
| `Ctrl+Shift+Z` | ZIP 압축 |
| `Ctrl+Shift+Alt+Z` | ZIP 압축 해제 |
| `Ctrl+Shift+T` | 태그 추가 |
| `Ctrl+Z` | 실행취소 |
| `Ctrl+A` | 전체 선택 |
| `Ctrl+C / X / V` | 복사 / 잘라내기 / 붙여넣기 |
| `Ctrl+D` | 복제 |
| `Ctrl+G` | 폴더로 그룹화 |
| `Ctrl+Alt+C` | 경로 복사 |
| `Ctrl+Alt+O` | Photoshop에서 열기 |
| `Ctrl+1~4` | 뷰 모드 전환 |
| `Ctrl+0/+/-` | 줌 초기화/확대/축소 |
| `F2` | 이름 변경 |
| `Delete/Backspace` | 삭제 |
| `Enter` | 열기 / 편집기 |
| `Space` | 미리보기 |
| `Tab/Shift+Tab` | 탭 순환 |

## Architecture

### Entry Points

- **index.html** - HTML entry point loaded by Tauri
- **index.tsx** - React app initialization
- **App.tsx** - Main application component (~900줄, 리팩토링 후)
- **src-tauri/src/lib.rs** - Tauri backend (Rust commands and plugins, ~2,700줄)
- **src-tauri/src/helpers.rs** - Rust 공통 헬퍼 (경로 중복 회피, 복사 네이밍, 스프라이트 캔버스)
- **src-tauri/src/main.rs** - Entry point (calls lib.rs)

### App.tsx 커스텀 훅 (hooks/)

App.tsx에서 분리된 도메인별 훅:

- **`hooks/useThemeManagement.ts`** - 테마 프리셋, 커스텀 색상, 줌 레벨, isDark 판별, adjustColorForTheme()
- **`hooks/useCategoryManagement.ts`** - 카테고리·즐겨찾기 CRUD, localStorage 영속화
- **`hooks/useWindowState.ts`** - 창 위치·크기 저장/복원
- **`hooks/useTauriDragDrop.ts`** - 외부(OS) 폴더 드래그앤드롭 리스너
- **`hooks/useAutoUpdate.ts`** - 자동 업데이트 확인·다운로드

### Process Communication

The app uses Tauri's command pattern:

1. **Rust Commands** (`src-tauri/src/lib.rs`) define backend functions with `#[tauri::command]`:
   - `open_folder` - Opens folder in OS file explorer
   - `copy_path` - Copies path to clipboard
   - `select_folder` - Opens native folder picker dialog
   - `list_directory` - Lists directory contents as `FileEntry`
   - `get_file_thumbnail` - Generates image thumbnail (disk cached)
   - `get_psd_thumbnail` - Generates PSD thumbnail (disk cached)
   - `rename_item` - Renames file or directory
   - `delete_items` - Deletes files/directories (trash)
   - `copy_items` / `move_items` - Copies or moves files
   - `create_directory` - Creates new directory
   - `is_directory` - Checks if path is a directory
   - `create_text_file` - Creates empty text file
   - `write_text_file` - Writes content to text file

2. **Frontend** calls these via `invoke()` from `@tauri-apps/api/core`

### Tauri Plugins

Required plugins (configured in `src-tauri/Cargo.toml`):
- **tauri-plugin-opener** - Open folders in system file explorer
- **tauri-plugin-clipboard-manager** - Clipboard operations
- **tauri-plugin-dialog** - Native file/folder picker dialogs
- **tauri-plugin-drag** - Drag files out to OS applications
- **tauri-plugin-updater** - Auto-update support

### Rust Backend Notes

- `FileType` enum with `#[serde(rename_all = "lowercase")]` maps to TypeScript union type
- Image thumbnails cached to `app_cache_dir/img_thumbnails/` (파일경로+수정시각+크기 해시)
- PSD thumbnails cached to `app_cache_dir/psd_thumbnails/`
- **`helpers.rs`** 공통 헬퍼 모듈:
  - `find_unique_path()` — 출력 경로 중복 회피 (suffix + 카운터)
  - `get_copy_destination()` — 복사/복제 시 "(복사)" 접미사 경로 결정
  - `create_sprite_canvas()` — 이미지 그리드 배치 캔버스 생성

### State Management

App state is split between:
- **App.tsx** - Layout split state, file explorer open/closed, active tab
- **hooks/** - Domain-specific state hooks (theme, categories, window, updater)
- **FileExplorer/index.tsx** - File explorer navigation, selection, renaming state
- **localStorage** (`quickfolder_widget_data`) - Categories and shortcuts persistence

### File Explorer Architecture (`components/FileExplorer/`)

- **`index.tsx`** - 메인 컨트롤러 (~1,300줄): 탐색 히스토리, 탭 관리, 컨텍스트 메뉴 빌더
- **`NavigationBar.tsx`** - 브레드크럼, 정렬, 썸네일 크기, 뷰 모드 전환
- **`FileGrid.tsx`** - 파일 목록 렌더링 (grid/list/details 뷰)
- **`FileCard.tsx`** - 개별 파일 카드 (lazy 썸네일, 인라인 이름변경)
- **`ContextMenu.tsx`** - 우클릭 메뉴 (데이터 기반 레지스트리 패턴, 4개 prop)
- **`StatusBar.tsx`** - 선택 항목 정보
- **`ui/ModalShell.tsx`** - 공통 모달 래퍼 (오버레이, 헤더, 푸터, ESC)
- **`ui/modalStyles.ts`** - 공통 모달 스타일 (체커보드, 버튼, 입력, 스피너)

### FileExplorer 커스텀 훅 (`components/FileExplorer/hooks/`)

index.tsx에서 분리된 도메인별 훅:

- **`useFileOperations.ts`** - 삭제, 복제, 이름변경, 그룹화, 압축, 픽셀화, 실행취소
- **`useClipboard.ts`** - 복사/잘라내기/붙여넣기, 중복 확인 다이얼로그
- **`useKeyboardShortcuts.ts`** - 전역 키보드 단축키 (탭, 내비게이션, 파일 조작, 뷰 전환)
- **`useModalStates.ts`** - 모달 열림/닫힘 상태 (픽셀화, 시트패킹, 벌크리네임 등)
- **`useSearchFilter.ts`** - 검색어, 확장자 필터, displayEntries 파생
- **`useTabManagement.ts`** - 탭 CRUD, 내비게이션 히스토리, 이벤트 기반 탭 경로 동기화
- **`useColumnView.ts`** - 컬럼 뷰 상태, 디렉토리 캐시, 미리보기
- **`useRenameInput.ts`** - 이름변경 입력 상태·핸들러
- **`usePreview.ts`** - 이미지/동영상/텍스트 미리보기 상태
- **`useInternalDragDrop.ts`** - 내부 드래그 → 폴더 이동 / 즐겨찾기 등록
- **`useUndoStack.ts`** - 실행취소 스택 관리

### 마크다운 편집기 (`components/FileExplorer/MarkdownEditor.tsx`)

TipTap(ProseMirror) 기반 WYSIWYG 편집기. 독립 모달로 구현 (ModalShell 미사용 — ESC/외부 클릭으로 닫기).
- **TipTap 확장**: StarterKit, TaskList, TaskItem, Placeholder, ArrowReplace (커스텀)
- **MD↔HTML 변환**: `marked` (로드 시 MD→HTML), `turndown` (저장 시 HTML→MD)
- **자동 저장**: 1.5초 디바운스 + Ctrl+S 즉시 저장
- **단축키 격리**: 캡처 단계 키 리스너로 글로벌 단축키 차단 (`stopImmediatePropagation`)
- **화살표 자동 변환**: `->` → `→`, `<-` → `←`, `<->` → `↔` (InputRule 기반)
- **복사 버튼**: 헤더의 "복사" 버튼으로 순수 마크다운 텍스트 클립보드 복사
- **열기**: .md 파일 선택 후 Enter 키 (더블클릭은 OS 기본 앱)
- **생성**: 빈 공간 우클릭 → "마크다운" 메뉴 → 인라인 이름변경

### 공유 유틸리티 (`utils/pathUtils.ts`)

- `isCloudPath()` — 클라우드 스토리지 경로 감지
- `getFileName()` — 경로에서 파일명 추출
- `getPathSeparator()` — 경로 구분자 감지
- `getBaseName()` — 확장자 제외 파일명
- `getExtension()` — 확장자 추출 (점 포함)
- `getParentDir()` — 부모 디렉토리 추출

### ContextMenu 레지스트리 패턴

우클릭 메뉴는 데이터 기반으로 동작:
- `ContextMenuItem` / `ContextMenuSection` 타입 (`types.ts`)
- `index.tsx`의 `contextMenuSections` useMemo에서 조건별 섹션 빌더
- `ContextMenu.tsx`는 `sections` 배열을 받아 렌더링만 담당 (4개 prop: x, y, sections, onClose)
- 새 메뉴 항목 추가 시 `index.tsx` 빌더에만 항목 1개 추가

### 탭-파일 조작 이벤트 연동

파일 조작 시 다른 탭과 동기화하기 위해 커스텀 이벤트 사용:
- `qf-tab-rename` — 폴더 이름 변경 시 해당 경로 탭의 path/title/history 갱신
- `qf-tab-delete` — 폴더 삭제 시 해당 경로 탭 자동 제거
- `qf-files-changed` — 파일 변경 시 다른 패널 새로고침

### Drag & Drop

**Internal Drag & Drop** (`@dnd-kit`):
- Shortcuts are sortable within categories
- Shortcuts can be dragged between different categories
- `SortableShortcutItem` component wraps each shortcut for drag behavior

**Native OS Drag & Drop (즐겨찾기 등록)**:
- Folders dragged from OS file explorer → `hooks/useTauriDragDrop.ts`
- `onDragDropEvent()` global listener
- `is_directory` Rust command로 폴더만 필터링
- `data-category-id` 속성 + 바운딩 렉트 기반 카테고리 감지

**OS로 파일 드래그 내보내기** (`tauri-plugin-drag`):
- `components/FileExplorer/hooks/useInternalDragDrop.ts` — 커스텀 드래그 고스트 + OS 드래그
- 캔버스 기반 커스텀 드래그 아이콘 (`fileUtils.tsx::DRAG_IMAGE`)

### Data Types (`types.ts`)

Core interfaces:

- `FolderShortcut` - id, name, path, createdAt
- `Category` - id, title, color (Tailwind class), shortcuts array, createdAt, isCollapsed
- `ToastMessage` - id, message, type
- `FileEntry` - name, path, is_dir, size, modified, file_type
- `ThemeVars` - 테마 CSS 변수 (accent, bg, text, surface 등)
- `ClipboardData` - 클립보드 복사/이동 데이터
- `Tab` - 파일 탐색기 탭 (id, path, label, pinned)

### Styling

- Uses TailwindCSS utility classes
- Dark theme (`bg-[#0f172a]` base)
- Custom UI components in `components/ui/`:
  - `Button.tsx` - Reusable button with variants
  - `Modal.tsx` - Modal dialog wrapper
- `ToastContainer.tsx` - Toast notification system

## Build Output

- **Development**: Vite dev server runs at `localhost:3000`, Tauri loads from URL
- **Production**:
  - Frontend code → `dist/` (static HTML/CSS/JS)
  - Rust backend → `src-tauri/target/release/app` (~9.3 MB binary)
  - Final packages → `src-tauri/target/release/bundle/`
    - macOS: DMG installer (~3.7 MB)
    - Windows: NSIS installer (expected ~4-5 MB)
  - **Size comparison**: ~95% smaller than equivalent Electron app (70-100 MB)

## Configuration Files

- **src-tauri/tauri.conf.json** - Tauri app configuration (window size, bundle settings, etc.)
- **src-tauri/capabilities/default.json** - Permissions for plugins and commands
- **src-tauri/Cargo.toml** - Rust dependencies (Tauri plugins)
- **vite.config.ts** - Frontend build configuration
- **tsconfig.json** - TypeScript configuration

## 릴리스 규칙

- **태그 force-push 절대 금지**: 태그를 force-push하면 `tauri-action`이 같은 릴리스에 에셋을 두 번 업로드하여 서명 불일치가 발생한다. 업데이터가 깨진다.
- **빌드 실패 시 새 버전 번호로 릴리스**: 기존 태그를 수정하지 않고, 버전을 올려서 새 태그를 생성한다.
- **버전 동기화 필수**: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` 세 파일의 버전을 항상 동일하게 유지한다.
- **CHANGELOG.md 필수 업데이트**: 버전 태그를 푸시하기 전에 반드시 `CHANGELOG.md`에 해당 버전의 변경사항을 기록한다. 커밋 메시지만으로는 부족하며, CHANGELOG에 Added/Changed/Fixed 섹션으로 사용자가 읽을 수 있는 변경 이력을 남겨야 한다.

## Platform Notes

- DevTools open automatically in development mode
- Window behavior differs on macOS (doesn't quit on window close) vs other platforms
- Native folder dialogs use platform-specific pickers
- Tauri apps are significantly smaller (~3-5MB) compared to Electron (~120MB)

## Migration History

### Electron → Tauri 2.x (December 2025)

**Motivation**: Reduce application size and improve performance

**Key Changes**:
- Replaced Electron IPC (`window.electron.*`) with Tauri commands (`invoke()`)
- Converted `webUtils.getPathForFile()` native drag-drop to `onDragDropEvent()`
- Migrated `shell`, `clipboard`, `dialog` APIs to Tauri plugins
- Removed electron-builder, replaced with Tauri bundler

**Results**:
- Bundle size: 100MB → 3.7MB (96% reduction)
- Memory footprint: Reduced (uses system WebView instead of bundled Chromium)
- All features maintained, including critical OS file explorer drag-and-drop

**Migration completed**: 2025-12-13

### 파일 탐색기 통합 + 대규모 리팩토링 (February 2026)

**주요 추가 기능**:
- 통합 파일 탐색기 (그리드/리스트/세부정보 뷰, 탭, 키보드 단축키)
- 이미지·PSD 썸네일 자동 로딩 (Rust 디스크 캐시)
- OS로 파일 드래그 내보내기 (`tauri-plugin-drag`)
- 즐겨찾기·탐색기 패널 연동

**리팩토링**:
- App.tsx 2,044줄 → ~900줄 (커스텀 훅 분리)
- React.memo, useCallback, useMemo 전면 적용
- Rust FileType enum 도입 (타입 안전성)
- ThemeVars 타입 중앙화

**Completed**: 2026-02-22
