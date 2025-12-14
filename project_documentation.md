# QuickFolder Widget - 기술 문서

## 1. 프로젝트 개요
**QuickFolder Widget**은 Tauri 2.x와 React로 구축된 경량 크로스 플랫폼 데스크탑 애플리케이션입니다. 자주 사용하는 로컬 폴더를 사용자 정의 카테고리로 정리하여 빠르게 접근하고 관리할 수 있도록 돕는 생산성 도구입니다.

### 주요 특징
- 카테고리별 폴더 즐겨찾기 관리
- OS 탐색기에서 드래그앤드롭으로 폴더 추가
- 카테고리 및 폴더 순서 변경 (드래그앤드롭)
- 실시간 검색 및 필터링
- 경량 (Electron 대비 96% 작은 번들 크기)

## 2. 기술 스택 (Technology Stack)
- **Core**: [Tauri 2.x](https://tauri.app/), [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Backend**: [Rust](https://www.rust-lang.org/) (Tauri)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Drag & Drop**: [@dnd-kit](https://dndkit.com/) (Core, Sortable, Utilities)
- **Icons**: [Lucide React](https://lucide.dev/)
- **State Management**: React `useState` + `localStorage` (데이터 영구 저장)

## 3. 프로젝트 아키텍처
Tauri는 Rust 백엔드와 웹 프론트엔드를 결합한 하이브리드 아키텍처를 사용합니다.

### 3.1 Rust 백엔드 (Tauri Core, `src-tauri/src/lib.rs`)
- **Tauri Commands**: 프론트엔드에서 호출 가능한 Rust 함수들
  - `open_folder`: 시스템 기본 파일 탐색기로 폴더를 엽니다
    - Windows: `opener.open_path()` 사용
    - macOS: `opener.open_path()` 사용 (폴더 내부로 진입)
    - Linux: `opener.open_path()` 사용
  - `copy_path`: 경로를 클립보드에 복사합니다
  - `select_folder`: 네이티브 폴더 선택 다이얼로그를 표시합니다
- **Tauri Plugins**:
  - `tauri-plugin-opener`: 파일 시스템 항목 열기
  - `tauri-plugin-clipboard-manager`: 클립보드 작업
  - `tauri-plugin-dialog`: 네이티브 파일/폴더 선택 대화상자
- **보안**: `capabilities/default.json`에서 명시적으로 허용된 명령만 실행 가능

### 3.2 프론트엔드 (React, `App.tsx`)
- 단일 페이지 React 애플리케이션입니다.
- **Tauri API 통신**: `invoke()` 함수를 통해 Rust 백엔드 호출
  ```typescript
  await invoke('open_folder', { path })
  await invoke('copy_path', { path })
  const result = await invoke('select_folder')
  ```
- **컴포넌트 구조**:
  - `App`: 메인 컨테이너로 상태, 드래그 센서, 전역 모달을 관리합니다.
  - `CategoryColumn`: 개별 카테고리 UI를 담당하며, `useSortable`을 통해 카테고리 순서 변경 가능
  - `SortableShortcutItem`: 개별 폴더 아이템으로 `useSortable`을 통해 드래그가 가능합니다.

### 3.3 네이티브 드래그앤드롭
- **Tauri의 전역 드래그앤드롭 이벤트** (`getCurrentWebview().onDragDropEvent()`)
- OS 파일 탐색기에서 폴더를 직접 앱으로 드래그 가능
- 마우스 위치를 기반으로 타겟 카테고리 자동 감지
- 구현 위치: `App.tsx` (useEffect 훅)
  ```typescript
  getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === 'drop') {
      const paths = event.payload.paths;
      const position = event.payload.position;
      // 마우스 위치로 카테고리 찾기
      const element = document.elementFromPoint(position.x, position.y);
      const categoryId = element?.closest('[data-category-id]')?.getAttribute('data-category-id');
      // 폴더 추가
    }
  });
  ```

## 4. 핵심 구현 상세

### 4.1 데이터 저장 (Data Persistence)
- 데이터는 `localStorage`의 `quickfolder_widget_data` 키에 저장됩니다.
- 구조: `Category` 객체들의 배열 (각 객체는 `FolderShortcut` 배열을 포함)
- 변경 시마다 자동 저장 (`useEffect` 훅)

### 4.2 드래그 앤 드롭 (Drag & Drop) 로직
- **라이브러리**: 접근성이 뛰어나고 정렬 기능이 강력한 `@dnd-kit`을 사용했습니다.
- **카테고리 드래그**:
  - `useSortable` 훅으로 카테고리 순서 변경 가능
  - 헤더를 드래그하여 전체 카테고리 이동
  - `pointerWithin` collision detection으로 넓은 감지 범위
- **폴더 아이템 드래그**:
  - `SortableContext`가 카테고리 내의 순서 변경을 처리
  - `handleDragOver`로 다른 카테고리로 이동 가능
  - `closestCenter` collision detection
- **OS 네이티브 드롭**:
  - Finder/Explorer에서 드래그된 폴더를 감지
  - 마우스 위치로 타겟 카테고리 자동 판별
  - `data-category-id` 속성을 통한 카테고리 식별

### 4.3 레이아웃 및 검색
- **Grid 레이아웃**: CSS Grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`)로 반응형 레이아웃 구현
- **상단 정렬**: `items-start` 클래스로 모든 카테고리가 컬럼 상단에 정렬
- **검색 (Search)**:
  - 실시간으로 카테고리 제목 및 폴더 이름 필터링
  - **자동 펼침**: 검색어 입력 시 접혀있는 카테고리도 강제로 펼침
  - 카테고리 제목 일치 시 모든 하위 폴더 표시

### 4.4 커스텀 Collision Detection
```typescript
const customCollisionDetection = (args: any) => {
  const activeType = args.active?.data?.current?.type;

  if (activeType === 'Category') {
    // 카테고리: 전체 영역 감지
    return pointerWithin(args);
  }

  // 폴더: 중앙 기준 감지
  return closestCenter(args);
};
```

## 5. 파일 구조
```
quick-folder/
├── src-tauri/                  # Rust 백엔드
│   ├── src/
│   │   ├── main.rs            # 진입점
│   │   └── lib.rs             # Tauri commands (open_folder, copy_path, select_folder)
│   ├── Cargo.toml             # Rust 의존성
│   ├── tauri.conf.json        # Tauri 설정 (dragDropEnabled: true)
│   ├── capabilities/
│   │   └── default.json       # 권한 설정
│   └── icons/                 # 앱 아이콘
├── src/                        # React 프론트엔드
│   ├── components/            # UI 컴포넌트 (버튼, 모달, 토스트)
│   ├── App.tsx                # 루트 컴포넌트 및 로직
│   ├── index.tsx              # React 진입점
│   ├── types.ts               # TypeScript 타입 정의
│   └── index.css              # Tailwind 임포트 및 전역 스타일
├── .github/workflows/
│   └── release.yml            # GitHub Actions CI/CD
├── vite.config.ts             # 빌드 설정
├── package.json               # Node.js 의존성
└── CLAUDE.md                  # 프로젝트 가이드

## 6. 빌드 및 배포 (Build & Deployment)

### 로컬 빌드
```bash
# 개발 모드 (핫 리로드)
npm run dev

# 프로덕션 빌드
npm run tauri build
```

빌드 결과물:
- **macOS**: `src-tauri/target/release/bundle/dmg/*.dmg` (~3.7 MB)
- **Windows**: `src-tauri/target/release/bundle/nsis/*.exe` (~4-5 MB)

### GitHub Actions 자동 빌드
- 태그 푸시 시 자동 빌드 및 릴리즈 생성
- 지원 플랫폼: Windows x86_64, macOS ARM64
```bash
git tag v0.1.0
git push origin v0.1.0
# GitHub Actions가 자동으로 빌드 및 릴리즈 생성
```

## 7. Tauri vs Electron 비교

| 항목 | Electron | Tauri 2.x |
|------|----------|-----------|
| 번들 크기 | ~100 MB | **3.7 MB** (96% 감소) |
| 메모리 사용 | 높음 (Chromium 포함) | **낮음** (시스템 WebView) |
| 백엔드 언어 | Node.js | **Rust** |
| 보안 | contextBridge | **Capabilities 기반** |
| 시작 속도 | 느림 | **빠름** |
| 크로스 컴파일 | 가능 | **제한적** (플랫폼별 빌드 필요) |

## 8. 보안 (Security)

### Tauri 보안 모델
- **Capabilities**: `src-tauri/capabilities/default.json`에서 명시적 권한 정의
- **허용된 작업**:
  - `opener:default` - 파일/폴더 열기
  - `clipboard-manager:default` - 클립보드 작업
  - `dialog:default` - 파일 선택 대화상자
  - `core:window:allow-close` - 창 닫기
  - `core:window:allow-minimize` - 창 최소화

### 프론트엔드 보안
- CSP 설정: `tauri.conf.json`에서 관리
- 백엔드 호출: `invoke()` API만 사용 (직접 Node.js 접근 불가)

## 9. 개발 가이드

### 새로운 Tauri Command 추가
1. `src-tauri/src/lib.rs`에 함수 추가:
   ```rust
   #[tauri::command]
   async fn my_command(param: String) -> Result<String, String> {
       Ok(format!("Hello, {}", param))
   }
   ```
2. `invoke_handler`에 등록:
   ```rust
   .invoke_handler(tauri::generate_handler![
       my_command,  // 추가
       open_folder,
       copy_path,
       select_folder
   ])
   ```
3. `capabilities/default.json`에 권한 추가 (필요시)
4. 프론트엔드에서 호출:
   ```typescript
   const result = await invoke('my_command', { param: 'World' });
   ```

### 플러그인 추가
```bash
# npm으로 JS 플러그인 설치
npm install @tauri-apps/plugin-xxxxx

# Cargo.toml에 Rust 플러그인 추가
[dependencies]
tauri-plugin-xxxxx = "2.0"
```

## 10. 버전 히스토리

### 0.1.0 (2025-12-13)
- Electron에서 Tauri 2.x로 완전 마이그레이션
- 카테고리 드래그앤드롭 순서 변경 기능 추가
- Grid 레이아웃으로 상단 정렬 개선
- GitHub Actions CI/CD 자동 빌드 설정
- 번들 크기 96% 감소 (100MB → 3.7MB)
- 폴더 열기 동작 개선 (선택 → 진입)
- 드래그앤드롭 중복 등록 문제 수정
- Grid(행 기준) → Mansonry(열 기준)으로 변경하면서 열 최상단에 gap이 들어오지 않도록 처리

### 0.0.1 (2025-12-13)
- 초기 Electron 버전 릴리스 (현재 Tauri로 대체됨)

## 11. 향후 개발 계획 (Roadmap)

### 단기 (v0.2.0)
- [ ] 코드 사이닝 (Windows/macOS 인증서)
- [ ] Intel Mac 지원 (x86_64)
- [ ] 앱 아이콘 커스터마이징

### 중기 (v0.3.0)
- [ ] 자동 업데이트 (Tauri Updater)
- [ ] 테마 설정 (라이트/다크 모드)
- [ ] 카테고리 아이콘 선택

### 장기 (v1.0.0)
- [ ] 클라우드 동기화 (옵션)
- [ ] 단축키 설정
- [ ] 여러 프로필 지원
