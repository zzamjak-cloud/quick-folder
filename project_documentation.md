# QuickFolder Widget - 기술 문서

## 1. 프로젝트 개요
**QuickFolder Widget**은 Electron과 React로 구축된 크로스 플랫폼 데스크탑 애플리케이션입니다. 자주 사용하는 로컬 폴더를 사용자 정의 카테고리로 정리하여 빠르게 접근하고 관리할 수 있도록 돕는 생산성 도구입니다.

## 2. 기술 스택 (Technology Stack)
- **Core**: [Electron](https://www.electronjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Drag & Drop**: [@dnd-kit](https://dndkit.com/) (Core, Sortable, Utilities)
- **Icons**: [Lucide React](https://lucide.dev/)
- **State Management**: React `useState` + `localStorage` (데이터 영구 저장)

## 3. 프로젝트 아키텍처
이 애플리케이션은 철저한 보안 관행을 준수하는 표준 Electron 아키텍처를 따릅니다.

### 3.1 메인 프로세스 (Main Process, `electron/main.ts`)
- **창 관리 (Window Management)**: 특정 보안 설정(`nodeIntegration: false`, `contextIsolation: true`)으로 브라우저 창을 생성합니다.
- **IPC 핸들러**:
  - `open-folder`: `shell.openPath`를 사용하여 디렉토리를 엽니다.
  - `copy-path`: `clipboard.writeText`를 사용하여 텍스트를 클립보드에 복사합니다.
  - `select-folder`: 기본 OS 폴더 선택 대화상자를 엽니다.
- **보안**: 렌더러에서의 Node.js 통합을 비활성화하여 원격 코드 실행 취약점을 방지합니다.

### 3.2 프리로드 스크립트 (Preload Script, `electron/preload.ts`)
- 메인 프로세스와 렌더러 프로세스 간의 브리지 역할을 합니다.
- `contextBridge.exposeInMainWorld`를 통해 안전한 API를 노출합니다:
  - `window.electron.openFolder`
  - `window.electron.copyPath`
  - `window.electron.selectFolder`
  - `window.electron.getPathForFile`: `webUtils.getPathForFile`을 사용하여 Drag & Drop 이벤트에서 실제 파일 경로를 가져옵니다 (브라우저 보안 제한 우회).

### 3.3 렌더러 프로세스 (Renderer Process, `src/App.tsx`)
- 단일 페이지 React 애플리케이션입니다.
- **컴포넌트 구조**:
  - `App`: 메인 컨테이너로 상태, 드래그 센서, 전역 모달을 관리합니다.
  - `CategoryColumn`: 개별 카테고리 UI를 담당하며, `useDroppable`을 통해 빈 카테고리 드롭 및 Native OS 파일 드롭을 처리합니다.
  - `SortableShortcutItem`: 개별 폴더 아이템으로 `useSortable`을 통해 드래그가 가능합니다.

## 4. 핵심 구현 상세

### 4.1 데이터 저장 (Data Persistence)
- 데이터는 `localStorage`의 `quickfolder_widget_data` 키에 저장됩니다.
- 구조: `Category` 객체들의 배열 (각 객체는 `FolderShortcut` 배열을 포함)

### 4.2 드래그 앤 드롭 (Drag & Drop) 로직
- **라이브러리**: 접근성이 뛰어나고 정렬 기능이 강력한 `@dnd-kit`을 사용했습니다.
- **정렬 (Sorting)**: `SortableContext`가 카테고리 내의 순서 변경을 처리합니다.
- **카테고리 간 이동**: `handleDragOver` 로직이 아이템이 다른 컨테이너 위로 드래그될 때를 감지하고, 상태를 즉시 업데이트하여 이동을 시뮬레이션합니다.
- **빈 카테고리 지원**: `CategoryColumn` 컴포넌트는 정렬 가능한 아이템이 없을 때도 드롭 타겟이 될 수 있도록 `useDroppable`을 사용합니다.
- **Native OS 드롭**:
  - `CategoryColumn`의 `onDrop` 이벤트가 Finder/Explorer에서 드래그된 파일을 캡처합니다.
  - `window.electron.getPathForFile(file)`을 통해 파일 객체를 시스템 경로로 변환하여 추가합니다.

### 4.3 레이아웃 및 검색
- **Masonry 레이아웃**: CSS Multi-column layout (`columns-1 md:columns-2 ...`)을 사용하여 카테고리를 세로로 쌓은 뒤 가로로 배치합니다. 이는 내용의 높이가 다를 때 발생하는 행 간의 불필요한 여백을 제거해줍니다.
- **검색 (Search)**:
  - 실시간으로 바로가기를 필터링합니다.
  - **자동 펼침 (Auto-Expand)**: 검색어가 입력되면 `isCollapsed` 상태를 무시하고(`!category.isCollapsed || searchQuery.length > 0`), 접혀있는 카테고리 내부의 일치하는 항목도 강제로 보여줍니다.

## 5. 파일 구조
```
quickfolder-widget/
├── electron/
│   ├── main.ts         # 메인 프로세스 진입점
│   └── preload.ts      # 컨텍스트 브리지 (Preload)
├── src/
│   ├── components/     # UI 컴포넌트 (버튼, 모달, 토스트)
│   ├── App.tsx         # 루트 컴포넌트 및 로직
│   ├── main.tsx        # React 진입점
│   └── index.css       # Tailwind 임포트 및 전역 스타일
├── electron-env.d.ts   # Electron API를 위한 TypeScript 정의
└── vite.config.ts      # 빌드 설정

## 6. 빌드 및 배포 (Build & Deployment)
- **macOS (DMG)**
  ```bash
  npm run build
  ```
  `release` 폴더에 `.dmg` 파일이 생성됩니다.

- **Windows (NSIS)**
  ```bash
  npm run build:win
  ```
  `release` 폴더에 `.exe` 설치 파일이 생성됩니다.

## 7. 버전 히스토리
### 0.0.1 (2025-12-13)
- 초기 릴리스