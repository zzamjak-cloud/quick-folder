# QuickFolder Widget - 기술 문서

> **현재 버전**: v1.6.0 | **최종 업데이트**: 2026-02-28

## 1. 프로젝트 개요

**QuickFolder Widget**은 Tauri 2.x와 React 19로 구축된 경량 크로스 플랫폼 데스크탑 애플리케이션입니다. 자주 사용하는 로컬 폴더를 카테고리로 정리하여 빠르게 접근하고, 통합 파일 탐색기로 파일을 직접 관리할 수 있는 생산성 도구입니다.

### 주요 특징
- **통합 파일 탐색기**: 그리드/리스트/세부정보 뷰, 탭 탐색, 이미지·PSD·동영상 썸네일
- **카테고리별 폴더 즐겨찾기 관리**: OS 탐색기에서 드래그앤드롭으로 폴더 추가
- **드래그앤드롭 시스템**: 카테고리/즐겨찾기 순서 변경, 파일→폴더 이동, OS로 파일 내보내기
- **분할 뷰**: 2분할(수평/수직) 레이아웃으로 파일 동시 탐색
- **테마 시스템**: 다크/라이트 프리셋 + 커스텀(배경+강조색) + 텍스트 컬러 지원
- **자동 업데이트**: Tauri Updater 기반 인앱 업데이트
- **경량**: Electron 대비 96% 작은 번들 크기 (~3.7MB)

## 2. 기술 스택

| 영역 | 기술 |
|------|------|
| **프레임워크** | [Tauri 2.x](https://tauri.app/) (Rust + Web 하이브리드) |
| **프론트엔드** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| **백엔드** | [Rust](https://www.rust-lang.org/) (Tauri Core) |
| **빌드 도구** | [Vite](https://vitejs.dev/) |
| **스타일링** | [Tailwind CSS](https://tailwindcss.com/) |
| **내부 드래그앤드롭** | [@dnd-kit](https://dndkit.com/) (Core, Sortable) |
| **OS 파일 드래그** | [tauri-plugin-drag](https://github.com/nicepkg/tauri-plugin-drag) |
| **아이콘** | [Lucide React](https://lucide.dev/) + OS 네이티브 아이콘 |
| **상태 관리** | React useState + localStorage |
| **CI/CD** | GitHub Actions + [tauri-action](https://github.com/tauri-apps/tauri-action) |

### Tauri 플러그인
| 플러그인 | 용도 |
|---------|------|
| `tauri-plugin-opener` | 파일/폴더를 시스템 탐색기로 열기 |
| `tauri-plugin-clipboard-manager` | 클립보드 복사/붙여넣기 |
| `tauri-plugin-dialog` | 네이티브 폴더 선택 대화상자 |
| `tauri-plugin-drag` | 파일을 OS 외부 앱으로 드래그 내보내기 |
| `tauri-plugin-updater` | 자동 업데이트 (서명 검증 포함) |
| `tauri-plugin-process` | 앱 재시작 (업데이트 후) |
| `tauri-plugin-log` | 로깅 |

### Rust 의존성 (주요)
| 크레이트 | 용도 |
|---------|------|
| `image 0.25` | 이미지 썸네일 생성 (JPEG, PNG, GIF, WebP, BMP) |
| `psd 0.3` | PSD 파일 파싱 및 썸네일 추출 |
| `base64 0.22` | 썸네일 데이터 인코딩 |
| `trash 5` | 파일을 휴지통으로 이동 (OS 네이티브) |
| `zip 2` | ZIP 압축 기능 |
| `objc 0.2` | macOS 네이티브 API (아이콘 추출) |
| `winapi 0.3` | Windows Shell API (아이콘 추출) |

## 3. 프로젝트 구조

```
quick-folder/
├── src-tauri/                      # Rust 백엔드
│   ├── src/
│   │   ├── main.rs                 # 진입점 (lib.rs 호출)
│   │   └── lib.rs                  # Tauri 커맨드, 플러그인 등록 (1,034줄)
│   ├── capabilities/
│   │   └── default.json            # 권한 설정 (ACL)
│   ├── icons/                      # 앱 아이콘 (icns, ico, png)
│   ├── Cargo.toml                  # Rust 의존성
│   └── tauri.conf.json             # Tauri 앱 설정
│
├── App.tsx                         # 메인 애플리케이션 (1,221줄)
├── index.tsx                       # React 진입점
├── types.ts                        # 공용 TypeScript 타입 정의
│
├── hooks/                          # App.tsx 커스텀 훅
│   ├── useThemeManagement.ts       # 테마 프리셋, 커스텀 색상, 줌 레벨
│   ├── useCategoryManagement.ts    # 카테고리·즐겨찾기 CRUD, localStorage 영속화
│   ├── useWindowState.ts           # 창 위치·크기 저장/복원
│   ├── useTauriDragDrop.ts         # 외부(OS) 폴더 드래그앤드롭 리스너
│   └── useAutoUpdate.ts            # 자동 업데이트 확인·다운로드
│
├── components/
│   ├── FileExplorer/               # 통합 파일 탐색기
│   │   ├── index.tsx               # 메인 컨트롤러 (1,076줄)
│   │   ├── NavigationBar.tsx       # 브레드크럼, 정렬, 뷰 모드, 필터
│   │   ├── FileGrid.tsx            # 파일 목록 렌더링 (grid/list/details)
│   │   ├── FileCard.tsx            # 개별 파일 카드 (lazy 썸네일)
│   │   ├── TabBar.tsx              # 탭 바 (고정, 이름변경, 드래그 이동)
│   │   ├── ContextMenu.tsx         # 우클릭 메뉴 (포탈 렌더링)
│   │   ├── StatusBar.tsx           # 선택 항목 정보
│   │   ├── VideoPlayer.tsx         # 내장 비디오 플레이어
│   │   ├── fileUtils.tsx           # 파일 아이콘·색상 매핑, 유틸리티
│   │   ├── types.ts                # 탐색기 전용 타입
│   │   └── hooks/
│   │       ├── invokeQueue.ts      # Tauri invoke 동시성 제한 큐
│   │       ├── useDragToOS.ts      # OS로 파일 드래그 내보내기
│   │       ├── useInternalDragDrop.ts # 패널 내 파일→폴더 드래그
│   │       ├── useNativeIcon.ts    # OS 네이티브 파일 아이콘 훅
│   │       └── useRenameInput.ts   # 인라인 이름변경 상태 관리
│   │
│   ├── UpdateModal.tsx             # 업데이트 알림 모달
│   ├── ToastContainer.tsx          # 토스트 알림 시스템
│   └── ui/
│       ├── Button.tsx              # 재사용 버튼 컴포넌트
│       └── Modal.tsx               # 모달 래퍼 컴포넌트
│
├── .github/workflows/
│   └── release.yml                 # GitHub Actions CI/CD
├── vite.config.ts                  # Vite 빌드 설정
├── tsconfig.json                   # TypeScript 설정
└── package.json                    # Node.js 의존성
```

## 4. 아키텍처 상세

### 4.1 Rust 백엔드 (`src-tauri/src/lib.rs`)

프론트엔드에서 `invoke()` 함수로 호출하는 Tauri 커맨드 목록:

| 커맨드 | 설명 |
|--------|------|
| `list_directory` | 디렉토리 내용 조회 (숨김/시스템 파일 자동 제외, `spawn_blocking`) |
| `get_file_thumbnail` | 이미지 썸네일 생성 (디스크 캐시, `spawn_blocking`) |
| `get_psd_thumbnail` | PSD 파일 썸네일 생성 (디스크 캐시, `spawn_blocking`) |
| `get_video_thumbnail` | ffmpeg 기반 동영상 썸네일 추출 (`spawn_blocking`, 미설치 시 None) |
| `get_file_icon` | OS 네이티브 파일 아이콘 추출 (macOS: NSWorkspace, Windows: SHGetImageList) |
| `get_image_dimensions` | 이미지 해상도 조회 (`spawn_blocking`) |
| `read_text_file` | 텍스트 파일 읽기 (최대 바이트 제한) |
| `copy_items` | 파일/폴더 복사 (같은 폴더 복사 시 "(복사)" 접미사 자동 추가) |
| `move_items` | 파일/폴더 이동 |
| `duplicate_items` | 파일 복제 (Ctrl+D) |
| `delete_items` | 파일 삭제 (휴지통 사용 옵션) |
| `create_directory` | 새 폴더 생성 |
| `rename_item` | 파일/폴더 이름 변경 |
| `is_directory` | 경로가 폴더인지 확인 |
| `compress_to_zip` | 선택 파일 ZIP 압축 |
| `quick_look` | macOS Quick Look 미리보기 |
| `open_with_app` | 특정 앱으로 파일 열기 |
| `open_folder` | 시스템 파일 탐색기로 폴더 열기 |
| `copy_path` | 경로를 클립보드에 복사 |
| `select_folder` | 네이티브 폴더 선택 대화상자 |

**파일 타입 분류** (`FileType` enum):
- `Image`: jpg, jpeg, png, gif, webp, bmp, svg, ico
- `Video`: mp4, mov, avi, mkv, webm
- `Document`: pdf, doc(x), xls(x), ppt(x), txt, md, gslides, gdoc, gsheet
- `Code`: rs, js, ts, tsx, jsx, py, go, java, c, cpp, h, css, html, json, toml, yaml, yml
- `Archive`: zip, tar, gz, 7z, rar, dmg, pkg, unitypackage
- `Directory`: 폴더
- `Other`: 기타

**OS 네이티브 아이콘 시스템**:
- macOS: `NSWorkspace::sharedWorkspace().iconForFile()` → 128px PNG → Base64
- Windows: `SHGetImageList` + `SHIL_JUMBO` (256x256) → BGRA→RGBA 변환 → Base64
  - 폴백 체인: 256x256 → 48x48 → 32x32
- 확장자별 캐시로 Rust 호출 최소화 (같은 확장자는 한 번만 요청)

**성능 보호**:
- 프론트엔드: invoke 큐 (동시 3개, 대기 최대 200개, 초과 시 오래된 요청 취소)
- Rust 백엔드: `HeavyOpPermit` 세마포어 (동시 3개) + `catch_unwind` 패닉 방지
- 모든 I/O 커맨드 `async fn` + `spawn_blocking`: 네트워크 파일시스템에서 tokio 워커 차단 방지
- 탭별 entries 캐시: 디렉토리 내용을 `Map<string, FileEntry[]>`로 캐시하여 탭 전환 즉시 표시

### 4.2 프론트엔드 아키텍처

#### App.tsx (메인 컨테이너)
- **레이아웃**: 좌측(즐겨찾기 패널, 리사이즈 가능) + 우측(FileExplorer)
- **DnD 시스템**: `@dnd-kit` 기반 커스텀 구현
  - 드래그 중 아이템 위치 고정, 파란색 인디케이터 라인만 표시
  - 카테고리↔즐겨찾기 충돌 감지 분리 (카테고리는 카테고리만, 즐겨찾기는 즐겨찾기만 반응)
  - 빈 카테고리로의 드롭 허용
  - `DragOverlay`로 드래그 고스트 UI 표시
- **컴포넌트**: `CategoryColumn`, `SortableShortcutItem`

#### FileExplorer (통합 파일 탐색기)
- **탭 탐색**: 탭 생성/닫기/고정/이름변경, 탭 간 드래그 이동
- **뷰 모드**: 그리드(썸네일), 리스트, 세부정보
- **키보드 단축키**:

| 단축키 | macOS | Windows | 동작 |
|--------|-------|---------|------|
| 뒤로/앞으로 | Alt+←/→ | Alt+←/→ | 히스토리 탐색 |
| 폴더 진입 | ⌘+↓ | Alt+↓ | 선택 폴더로 이동 |
| 상위 이동 | ⌘+↑ | Alt+↑ | 부모 디렉토리 |
| 이름변경 | F2 / Enter | F2 | 인라인 이름변경 (다중 선택 시 일괄) |
| 삭제 | Delete / ⌫ | Delete | 휴지통으로 이동 |
| 새 탭 | ⌘+T | Ctrl+T | 탭 생성 |
| 탭 닫기 | ⌘+W | Ctrl+W | 현재 탭 닫기 |
| 다른 탭 닫기 | ⌘+Alt+W | Ctrl+Alt+W | 다른 탭 모두 닫기 |
| 새 폴더 | ⌘+Shift+N | Ctrl+Shift+N | 새 폴더 생성 + 인라인 이름변경 |
| 미리보기 | Space | Space | 토글 열기/닫기 |
| 전체 선택 | ⌘+A | Ctrl+A | 모든 파일 선택 |
| 복사 | ⌘+C | Ctrl+C | 파일 복사 |
| 잘라내기 | ⌘+X | Ctrl+X | 파일 잘라내기 |
| 붙여넣기 | ⌘+V | Ctrl+V | 파일 붙여넣기 |
| 복제 | ⌘+D | Ctrl+D | 파일 복제 |
| 검색 | ⌘+F | Ctrl+F | 파일명 검색 |
| 범위 선택 | Shift+방향키 | Shift+방향키 | 앵커 기반 범위 선택 |
| 썸네일 확대/축소 | Ctrl+스크롤 | Ctrl+스크롤 | 썸네일 크기 조절 |

- **미리보기**: 이미지(스페이스바 토글), PSD(우클릭), 동영상(더블클릭/Space), 텍스트 파일
- **파일 작업**: 복사, 이동, 삭제, 이름변경, 새 폴더, ZIP 압축, 같은 폴더 복사
- **OS 파일 드래그 이동**: OS 탐색기 ↔ QuickFolder 파일 드래그로 이동/복사 (클라우드 스토리지 자동 감지)
- **비차단 로딩**: 네트워크 파일시스템(Google Drive 등)에서도 로딩 중 앱 조작 가능
- **분할 뷰**: 2분할(수평/수직), 각 패널 독립 탐색·탭·설정
- **창 포커스 최적화**: 파일 변경 감지 후 조건부 갱신 (변경 없으면 리렌더링 없음)

### 4.3 데이터 저장 (Data Persistence)
- **즐겨찾기 데이터**: `localStorage` → `quickfolder_widget_data` 키
  - `Category[]` 배열 (각 카테고리에 `FolderShortcut[]` 포함)
  - 색상: `#RRGGBB` HEX 형식 (구형 Tailwind 클래스 자동 마이그레이션)
- **테마 설정**: `localStorage` → 테마 프리셋 또는 커스텀 색상
- **창 상태**: `localStorage` → 창 위치·크기 저장/복원
- **탐색기 설정**: `localStorage` → 뷰 모드, 정렬 기준, 썸네일 크기 (instanceId별 분리)
- **썸네일 캐시**: 디스크 → `app_cache_dir/` (파일경로+수정시각+크기 해시)

### 4.4 핵심 타입 정의 (`types.ts`)

```typescript
// 즐겨찾기 관련
interface FolderShortcut { id, name, path, color?, createdAt }
interface Category { id, title, color, shortcuts[], createdAt, isCollapsed? }

// 파일 탐색기 관련
type FileType = 'image' | 'video' | 'document' | 'code' | 'archive' | 'other' | 'directory'
interface FileEntry { name, path, is_dir, size, modified, file_type }
interface ClipboardData { paths[], action: 'copy' | 'cut' }
type ThumbnailSize = 40 | 60 | 80 | 100 | 120 | 160 | 200 | 240

// 테마 관련
interface ThemeVars { bg, surface, surface2, surfaceHover, border, text, muted, accent, accentHover, accent20, accent50 }

// 토스트 알림
interface ToastMessage { id, message, type: 'success' | 'error' | 'info' }
```

### 4.5 드래그앤드롭 시스템

**내부 DnD** (`@dnd-kit`):
- **카테고리 드래그**: 헤더 드래그로 카테고리 순서 변경
- **즐겨찾기 드래그**: 카테고리 내/간 이동, 빈 카테고리 드롭 지원
- **인디케이터 기반**: 드래그 중 아이템 위치 고정, 파란색 라인으로 드롭 위치 표시
- **충돌 감지 분리**: 카테고리는 `closestCenter`(카테고리만), 즐겨찾기는 `closestCenter`(즐겨찾기+빈 카테고리)

**외부 → 앱** (`hooks/useTauriDragDrop.ts`):
- OS 파일 탐색기에서 폴더를 앱으로 드래그하여 즐겨찾기 등록
- `onDragDropEvent()` 전역 리스너 + `is_directory` 필터링
- `data-category-id` 속성 + 바운딩 렉트 기반 카테고리 감지

**앱 → 외부** (`hooks/useDragToOS.ts`):
- `tauri-plugin-drag`로 파일을 OS 외부 앱으로 드래그 내보내기
- 캔버스 기반 커스텀 드래그 아이콘 + 다중 파일 뱃지

**파일 → 폴더** (`hooks/useInternalDragDrop.ts`):
- 파일을 탐색기 내 폴더 위에 드롭하여 이동
- 분할 뷰 패널 간 파일 드래그 이동 지원
- 클라우드 스토리지(Google Drive/Dropbox/OneDrive/iCloud) 자동 감지: 클라우드 ↔ 로컬은 복사, 로컬 ↔ 로컬은 이동

**OS → 탐색기** (`FileExplorer/index.tsx`):
- Tauri `onDragDropEvent` 기반 외부 파일 드롭 수신
- 클라우드 스토리지 경로 감지하여 자동 이동/복사 결정

### 4.6 아이콘 시스템

파일 아이콘은 **3단계 폴백** 시스템으로 표시됩니다:

1. **이미지 썸네일**: image/video/psd 타입 파일은 실제 썸네일 표시
2. **OS 네이티브 아이콘**: 확장자별 시스템 아이콘 (macOS NSWorkspace, Windows SHGetImageList)
3. **Lucide 폴백**: 네이티브 아이콘이 부적합한 특정 확장자만 적용 (.md, .json, .sh)

## 5. 빌드 및 배포

### 개발 모드
```bash
npm install          # 의존성 설치
npm run tauri dev    # 개발 빌드 (핫 리로드, DevTools 자동 열림)
```

### 프로덕션 빌드
```bash
npm run tauri build  # 현재 플랫폼용 빌드
```

빌드 결과물:
- **macOS**: `src-tauri/target/release/bundle/dmg/*.dmg` (~3.7 MB)
- **Windows**: `src-tauri/target/release/bundle/nsis/*.exe` (~4-5 MB)

### GitHub Actions CI/CD (`release.yml`)
태그 푸시 시 자동 빌드 및 릴리즈 생성:

```bash
git tag v1.6.0
git push origin v1.6.0
# GitHub Actions가 자동으로 빌드 및 릴리즈 생성
```

- **지원 플랫폼**: macOS universal (ARM64+Intel), Windows x86_64
- **빌드 도구**: `tauri-apps/tauri-action@v0.5`
- **서명**: `TAURI_SIGNING_PRIVATE_KEY` 환경변수로 서명 (업데이트용 .sig 파일 생성)
- **업데이트**: `latest.json` 자동 생성 → 앱 내 자동 업데이트 감지

### 자동 업데이트 시스템
- **endpoint**: `https://github.com/zzamjak-cloud/quick-folder/releases/latest/download/latest.json`
- **서명 검증**: minisign 공개키로 바이너리 무결성 검증
- **macOS 아티팩트**: `.app.tar.gz` + `.app.tar.gz.sig`
- **Windows 아티팩트**: `.exe` + `.exe.sig`
- `bundle.targets`에 `"app"` 포함 필수 (macOS .app.tar.gz 생성 전제 조건)
- `releaseDraft: false` 필수 (draft release의 URL은 인증 필요)

### 버전 동기화
버전 변경 시 3개 파일 동시 업데이트 필수:
- `package.json` → `version`
- `src-tauri/tauri.conf.json` → `version`
- `src-tauri/Cargo.toml` → `version`

## 6. 보안

### Tauri 보안 모델
- **Capabilities 기반 ACL**: `src-tauri/capabilities/default.json`에서 명시적 권한 정의
- **허용된 권한**:
  - `core:default` - 기본 Tauri API
  - `core:window:allow-close` / `allow-minimize` - 창 관리
  - `opener:default` - 파일/폴더 열기
  - `clipboard-manager:default` - 클립보드 작업
  - `dialog:default` - 파일 선택 대화상자
  - `updater:default` / `allow-check` / `allow-download` / `allow-install` - 자동 업데이트
  - `process:default` / `allow-restart` - 앱 재시작
  - `drag:default` - 파일 드래그 내보내기

### 프론트엔드 보안
- **CSP**: `tauri.conf.json`에서 관리 (현재 개발 편의를 위해 null)
- **Asset Protocol**: `assetProtocol.enable: true`, scope `["**"]`
- **백엔드 통신**: `invoke()` API만 사용 (직접 파일 시스템 접근 불가)

## 7. Tauri vs Electron 비교

| 항목 | Electron | Tauri 2.x |
|------|----------|-----------|
| 번들 크기 | ~100 MB | **~3.7 MB** (96% 감소) |
| 메모리 사용 | 높음 (Chromium 포함) | **낮음** (시스템 WebView) |
| 백엔드 언어 | Node.js | **Rust** |
| 보안 모델 | contextBridge | **Capabilities 기반 ACL** |
| 시작 속도 | 느림 | **빠름** |
| 크로스 빌드 | 가능 | **플랫폼별 빌드 필요** |
| 업데이터 | electron-updater | **tauri-plugin-updater** (서명 검증) |

## 8. 개발 가이드

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
       // ... 기존 커맨드
   ])
   ```
3. `capabilities/default.json`에 권한 추가 (필요시)
4. 프론트엔드에서 호출:
   ```typescript
   const result = await invoke<string>('my_command', { param: 'World' });
   ```

### 플러그인 추가
```bash
# JS 플러그인 설치
npm install @tauri-apps/plugin-xxxxx

# Cargo.toml에 Rust 플러그인 추가
# [dependencies]
# tauri-plugin-xxxxx = "2"
```

### tsconfig 주의사항
`exclude`에 `["node_modules", "src-tauri/target", "dist"]` 필수 (없으면 Rust 빌드 아티팩트를 TS가 스캔)

## 9. 마이그레이션 히스토리

### Electron → Tauri 2.x (2025년 12월)
- Electron IPC → Tauri `invoke()` 커맨드
- `webUtils.getPathForFile()` → `onDragDropEvent()` 전역 리스너
- electron-builder → Tauri 번들러
- 결과: 100MB → 3.7MB (96% 감소)

### 파일 탐색기 통합 (2026년 2월)
- 통합 파일 탐색기 (그리드/리스트/세부정보 뷰, 탭, 분할 뷰)
- 이미지·PSD·동영상 썸네일, OS 네이티브 아이콘
- App.tsx 리팩토링 (2,044줄 → 커스텀 훅 분리)
- React.memo, useCallback, useMemo 성능 최적화

### DnD 전면 재설계 (2026년 2월)
- 실시간 아이템 이동 → 인디케이터 기반 지연 이동
- 카테고리↔즐겨찾기 충돌 감지 분리
- 파일→폴더 드래그 이동, 탭 드래그 교차 패널 이동

## 10. 버전 히스토리 (주요)

| 버전 | 날짜 | 주요 변경 |
|------|------|----------|
| **1.6.0** | 2026-02-28 | OS 파일 드래그 이동, 비차단 로딩, spawn_blocking 전환, 동시성 최적화 |
| **1.5.0** | 2026-02-28 | Shift+방향키 범위 선택, 동일 파일명 일괄 이름변경, 클립보드 이미지 붙여넣기 |
| **1.4.2** | 2026-02-27 | OS 클립보드 통합, 박스 드래그 선택 |
| **1.4.1** | 2026-02-27 | 창 포커스 깜빡임 방지 (변경 감지 조건부 갱신) |
| **1.4.0** | 2026-02-26 | DnD 전면 재설계, Ctrl+W 탭 닫기, 같은 폴더 복사 |
| **1.3.x** | 2026-02-26 | 확장자별 아이콘, 스페이스바 미리보기 토글, 터치패드 핀치 방지 |
| **1.2.x** | 2026-02-25 | 탭 드래그 이동, 분할 뷰, 동영상 썸네일, ZIP 압축, OS 아이콘 |
| **1.1.0** | 2026-02-22 | 통합 파일 탐색기, OS 파일 드래그, App.tsx 리팩토링 |
| **1.0.x** | 2026-02-17 | 초기 릴리스, 자동 업데이트 시스템 구축 |
| **0.1.x** | 2025-12-20 | 줌, 테마, 외부 드래그 안정화 |
| **0.0.1** | 2025-12-13 | Electron → Tauri 2.x 마이그레이션 |

전체 변경 이력은 [CHANGELOG.md](./CHANGELOG.md) 참조.
