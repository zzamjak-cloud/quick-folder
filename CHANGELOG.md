# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
