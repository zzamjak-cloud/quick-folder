# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QuickFolder Widget is a **Tauri 2.x** desktop application for managing local folder shortcuts. It provides a categorized widget interface for quick access to frequently used directories on Windows and macOS.

## Tech Stack

- **Tauri 2.x** - Lightweight desktop application framework (Rust + Web)
- **React 19** - UI library with TypeScript
- **Vite** - Build tool and dev server
- **@dnd-kit** - Internal drag and drop functionality
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
- **App.tsx** - Main application component with all state and logic
- **src-tauri/src/lib.rs** - Tauri backend (Rust commands and plugins)
- **src-tauri/src/main.rs** - Entry point (calls lib.rs)

### Process Communication

The app uses Tauri's command pattern:

1. **Rust Commands** (`src-tauri/src/lib.rs`) define backend functions with `#[tauri::command]`:
   - `open_folder` - Opens folder in OS file explorer
   - `copy_path` - Copies path to clipboard
   - `select_folder` - Opens native folder picker dialog
2. **Frontend** (`App.tsx`) calls these via `invoke()` from `@tauri-apps/api/core`:
   ```typescript
   await invoke('open_folder', { path })
   await invoke('copy_path', { path })
   const result = await invoke('select_folder')
   ```

### Tauri Plugins

Required plugins (configured in `src-tauri/Cargo.toml`):
- **tauri-plugin-opener** - Open folders in system file explorer
- **tauri-plugin-clipboard-manager** - Clipboard operations
- **tauri-plugin-dialog** - Native file/folder picker dialogs

### State Management

All state lives in App.tsx and is persisted to `localStorage` under key `quickfolder_widget_data`:

- **Categories** - Top-level organizational units with title, color, and shortcuts
- **FolderShortcuts** - Individual folder entries with name and path
- **Toasts** - Temporary notification messages

Data syncs to localStorage on every state change (via `useEffect`).

### Drag & Drop

**Internal Drag & Drop** (`@dnd-kit`):
- Shortcuts are sortable within categories
- Shortcuts can be dragged between different categories
- `SortableShortcutItem` component wraps each shortcut for drag behavior
- `CategoryColumn` uses `useDroppable` to accept internal drops

**Native OS Drag & Drop** (Tauri):
- Folders can be dragged from OS file explorer into the app
- Uses `getCurrentWebview().onDragDropEvent()` global listener
- Detects drop position and finds target category via `data-category-id` attribute
- Configured via `dragDropEnabled: true` in `src-tauri/tauri.conf.json`
- Implementation in App.tsx (useEffect hook around line 326)

### Data Types

Core interfaces defined in `types.ts`:

- `FolderShortcut` - id, name, path, createdAt
- `Category` - id, title, color (Tailwind class), shortcuts array, createdAt, isCollapsed
- `ToastMessage` - id, message, type

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
