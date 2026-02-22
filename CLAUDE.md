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

## Architecture

### Entry Points

- **index.html** - HTML entry point loaded by Tauri
- **index.tsx** - React app initialization
- **App.tsx** - Main application component (~900줄, 리팩토링 후)
- **src-tauri/src/lib.rs** - Tauri backend (Rust commands and plugins)
- **src-tauri/src/main.rs** - Entry point (calls lib.rs)

### App.tsx 커스텀 훅 (hooks/)

App.tsx에서 분리된 도메인별 훅:

- **`hooks/useThemeManagement.ts`** - 테마 프리셋, 커스텀 색상, 줌 레벨
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

### State Management

App state is split between:
- **App.tsx** - Layout split state, file explorer open/closed, active tab
- **hooks/** - Domain-specific state hooks (theme, categories, window, updater)
- **FileExplorer/index.tsx** - File explorer navigation, selection, renaming state
- **localStorage** (`quickfolder_widget_data`) - Categories and shortcuts persistence

### File Explorer Architecture (`components/FileExplorer/`)

- **`index.tsx`** - 메인 컨트롤러: 키보드 단축키, 탐색 히스토리, 탭 관리
- **`NavigationBar.tsx`** - 브레드크럼, 정렬, 썸네일 크기, 뷰 모드 전환
- **`FileGrid.tsx`** - 파일 목록 렌더링 (grid/list/details 뷰)
- **`FileCard.tsx`** - 개별 파일 카드 (lazy 썸네일, 인라인 이름변경)
- **`ContextMenu.tsx`** - 우클릭 메뉴 (뷰포트 안전 포탈 렌더링)
- **`StatusBar.tsx`** - 선택 항목 정보
- **`hooks/useDragToOS.ts`** - OS로 파일 드래그 내보내기
- **`hooks/useRenameInput.ts`** - 이름변경 입력 상태·핸들러

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
- `components/FileExplorer/hooks/useDragToOS.ts`
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
