# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.5] - 2026-02-25

### Fixed
- **Windows 시스템 아이콘 뿌옇게 표시**: `SHGetFileInfoW`(32x32) → `SHGetImageList` + `SHIL_JUMBO`(256x256) 고해상도 추출로 변경
  - COM vtable 직접 호출로 `IImageList::GetIcon` 사용, 폴백 체인: 256x256 → 48x48 → 32x32
  - vtable 인덱스 수정 (Remove(9) → GetIcon(10))

## [1.2.3] - 2026-02-25

### Fixed
- **시스템 아이콘 확대 시 뿌옇게 표시**: 고정 해상도(128px)로 아이콘 요청 후 CSS 축소 방식으로 변경, 확대해도 항상 선명
- **빠른 스크롤 줌 시 앱 종료**: 썸네일 재요청에 300ms 디바운스 추가, Rust 백엔드 과부하 방지

## [1.2.2] - 2026-02-25

### Fixed
- **Ctrl+마우스 휠 썸네일 확대/축소 미작동**: gridRef 타이밍 문제 해결 (window 레벨 리스너로 변경)
- **썸네일 확대 시 이미지 뿌옇게 표시**: thumbnailSize 변경 시 기존 썸네일 리셋 후 새 해상도로 재요청

## [1.2.1] - 2026-02-25

### Fixed
- **Windows 네이티브 아이콘 미적용 수정**: Windows Shell API(`SHGetFileInfoW`) 기반 파일/폴더 아이콘 추출 구현
  - BGRA→RGBA 변환, 구형 아이콘 알파 채널 호환 처리, GDI SelectObject 추가
  - `catch_unwind`로 GDI 패닉 방지
- **Windows 앱 시작 후 종료 문제 수정**:
  - `DRAG_IMAGE` canvas 2D context null 가드 추가 (WebView2 호환)
  - `assetProtocol.enable: true` 설정 + `protocol-asset` feature 추가

## [1.2.0] - 2026-02-25

### Added
- **탐색기 분할 뷰**: 2분할(수평/수직) 레이아웃으로 파일 동시 탐색
  - 내비게이션 바에 분할 모드 토글 버튼 추가
  - 각 패널 독립 탐색·탭·설정 (instanceId 기반 localStorage 분리)
  - 패널 간 파일 드래그 이동 지원
- **파일 드래그 → 폴더 이동**: 파일을 폴더 카드 위에 드롭하여 이동
  - 내부 드래그 + OS 드래그 통합 (창 가장자리에서 OS 드래그 전환)
  - 드래그 고스트 UI: 파일 아이콘 + 이름 + 다중 선택 뱃지
  - 드롭 대상 폴더 하이라이트 피드백
- **파일 복제 (Ctrl+D)**: 선택 파일을 같은 위치에 "(복사)" 접미사로 복제
- **파일명 검색 (Ctrl+F)**: 현재 디렉토리 내 파일명 실시간 필터링
- **파일 확장자 필터**: 내비게이션 바 드롭다운에서 확장자별 필터링
- **Ctrl+마우스 휠 썸네일 확대/축소**: 트랙패드 핀치 제스처 지원
- **동영상 썸네일**: ffmpeg 기반 비디오 프레임 추출 (미설치 시 아이콘 폴백)
- **동영상 미리보기 플레이어**: 더블클릭 또는 Space로 내장 비디오 재생
- **ZIP 압축**: 우클릭 메뉴에서 선택 파일 ZIP 압축
- **OS 네이티브 파일 아이콘**: macOS NSWorkspace 기반 확장자별 아이콘
  - 그리드·리스트·세부정보 뷰 + 즐겨찾기 사이드바 적용
  - 확장자별 공유 캐시로 Rust 호출 최소화
- **시스템 탐색기 테마**: macOS/Windows 라이트·다크 4종 프리셋 추가
  - OS + 다크모드 자동 감지로 초기 테마 자동 선택

### Changed
- **잘라내기(Ctrl+X) 시각적 피드백**: 잘라낸 파일 반투명(40%) 표시, ESC로 해제
- **파일 호버 툴팁 개선**: 파일명·크기·수정일·유형·해상도 정보 표시
- **카테고리 간격 축소**: 헤더·본문 패딩, 폰트 크기, 아이콘 축소
- **macOS 삭제 키 지원**: Backspace(⌫)로도 파일 삭제 가능

### Fixed
- **즐겨찾기 삭제 확인 팝업 누락**: 삭제 시 확인 다이얼로그 추가
- **신규 파일 자동 갱신**: 창 포커스 복귀 시 디렉토리 자동 새로고침
- **분할 뷰 패널 간 드래그 이동**: useInternalDragDrop 동기 리스너 등록으로 근본 수정

### Removed
- 컨텍스트 메뉴에서 "VS Code로 열기", "터미널에서 열기" 항목 제거

## [1.1.0] - 2026-02-22

### Added
- **통합 파일 탐색기**: 앱 우측 패널에 전용 파일 탐색기 내장
  - 그리드·리스트·세부정보 3가지 뷰 모드
  - 이미지·PSD 썸네일 자동 로딩 (Rust 백엔드 + 디스크 캐시)
  - 탭 방식 다중 탐색: 탭 고정(pin), 탭 이름 수정, 탭 히스토리
  - 키보드 단축키: Alt+←/→ (뒤로/앞으로), F2 (이름 변경), Delete (삭제) 등
  - 정렬 기준별 파일 형식 구분선 표시 (이름·크기·날짜·형식)
  - 파일 다중 선택 (Ctrl/Shift 클릭)
  - 인라인 이름 변경, 복사·이동·삭제·새 폴더 생성
  - 우클릭 컨텍스트 메뉴 (뷰포트 안전 포탈 렌더링)
  - 즐겨찾기 패널과 연동: 즐겨찾기 항목 클릭 시 탐색기 열기
- **OS로 파일 드래그 내보내기**: 파일·폴더를 외부 앱으로 드래그 (`tauri-plugin-drag`)
  - 다중 파일 드래그 지원
  - 캔버스 기반 커스텀 드래그 아이콘
- **외부 폴더 드래그 등록 개선**: 폴더만 즐겨찾기 등록 가능 (`is_directory` 커맨드)
  - 바운딩 렉트 기반 카테고리 감지 (DPR 보정 포함)

### Changed
- **App.tsx 대규모 리팩토링** (2,044줄 → ~900줄)
  - `hooks/useThemeManagement.ts`: 테마/색상/줌 로직 분리
  - `hooks/useCategoryManagement.ts`: 카테고리·즐겨찾기 CRUD 분리
  - `hooks/useWindowState.ts`: 창 위치·크기 저장/복원 분리
  - `hooks/useTauriDragDrop.ts`: OS 드래그앤드롭 리스너 분리
  - `hooks/useAutoUpdate.ts`: 자동 업데이트 로직 분리
- **파일 탐색기 공유 훅 추출**
  - `components/FileExplorer/hooks/useDragToOS.ts`
  - `components/FileExplorer/hooks/useRenameInput.ts`
- **성능 최적화**: React.memo, useCallback, useMemo 전면 적용
- **Rust FileType enum 도입**: `file_type: String` → `FileType` enum (타입 안전성 강화)
- **이미지 썸네일 디스크 캐시**: `app_cache_dir/img_thumbnails/` (PSD와 동일 패턴)
- **ThemeVars 타입 중앙화**: `types.ts`로 통합, 중복 제거
- **드롭다운 메뉴 포탈 렌더링**: `createPortal`로 뷰포트 클리핑 방지

### Removed
- 박스 드래그 선택 기능 제거 (비기능 코드)
- PSD 수동 토글 버튼 제거 (자동 로딩으로 대체)
- 백엔드 중복 정렬 제거 (프론트엔드 단일 정렬)

## [1.0.11] - 2026-02-18

### Changed
- 자동 업데이트 시스템 테스트를 위한 버전 업데이트

## [1.0.10] - 2026-02-18

### Fixed
- updater 플랫폼 키 불일치 수정: darwin-universal 오버라이드 제거
  - tauri-action이 darwin-aarch64/darwin-x86_64로 등록하므로 기본 타겟 사용

## [1.0.9] - 2026-02-18

### Changed
- 자동 업데이트 시스템 테스트를 위한 버전 업데이트

## [1.0.8] - 2026-02-18

### Fixed
- macOS 업데이터 아티팩트 미생성 문제 해결
  - `bundle.targets`에 `"app"` 추가 (.app.tar.gz 생성에 필수)
  - updater 플러그인에 `darwin-universal` 타겟 명시 (latest.json 플랫폼 키 매칭)

## [1.0.7] - 2026-02-18

### Changed
- 자동 업데이트 시스템 테스트를 위한 버전 업데이트

## [1.0.6] - 2026-02-18

### Fixed
- 자동 업데이트 시스템 근본 문제 해결
  - `createUpdaterArtifacts: true` 설정 추가 (.app.tar.gz, .sig 파일 생성)
  - updater endpoint를 tauri-action 자동 생성 latest.json으로 변경
  - 환경변수 이름을 Tauri v2 공식 명칭으로 수정
  - Draft → Published release로 변경하여 공개 URL 보장
  - 커스텀 update-json job 제거 (tauri-action 내장 기능 활용)

## [1.0.5] - 2026-02-17

### Fixed
- 업데이트 모달에서 현재 버전이 하드코딩("1.0.1")되어 있던 문제를 Tauri API를 통해 동적으로 가져오도록 수정

## [1.0.4] - 2026-02-17

### Fixed
- tauri-action 최신 버전으로 업데이트 (v0 → v0.5)
- 서명 환경변수 이름 수정 (TAURI_PRIVATE_KEY, TAURI_KEY_PASSWORD)
- 업데이트 기능 완전 수정

## [1.0.3] - 2026-02-17

### Fixed
- 서명 검증 임시 비활성화 (테스트용)
- 업데이트 알림 문제 해결

## [1.0.2] - 2026-02-17

### Added
- 자동 업데이트 확인 모달 UI 추가
- CHANGELOG 기반 변경사항 표시 기능

### Changed
- 업데이트 체크 로직 개선

## [1.0.1] - 2026-02-17

### Fixed
- updater endpoint URL 형식 오류 수정
- macOS에서 앱 실행 실패 문제 해결

## [1.0.0] - 2026-02-17

### Added
- 초기 릴리스
- 폴더 바로가기 관리 기능
- 카테고리별 폴더 정리 기능
- 드래그 앤 드롭 지원
- 다크 테마 및 커스텀 색상 지원
- GitHub Actions 자동 빌드 시스템
- 자동 업데이트 시스템 구현
