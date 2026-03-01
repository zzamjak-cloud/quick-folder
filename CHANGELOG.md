# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.1] - 2026-03-01

### Fixed
- **macOS 보호 폴더 접근 권한 팝업 반복**: 비샌드박스 앱에 샌드박스 전용 entitlements(temporary-exception 등)가 포함되어 TCC가 권한을 영속 캐시하지 않던 문제 수정

## [1.7.0] - 2026-03-01

### Added
- **macOS Finder 스타일 컬럼 뷰**: 파일 탐색기 4번째 뷰 모드로 컬럼 뷰 추가
  - 폴더 선택 시 오른쪽에 새 컬럼 추가, 여러 depth 동시 탐색 가능
  - 파일 선택 시 미리보기 패널 표시 (이미지 썸네일 + 파일 정보)
  - 고정 컬럼 너비(220px), 가로 스크롤 지원
  - 키보드: ↑↓ 컬럼 내 이동, → 폴더 진입, ← 이전 컬럼
- **뷰 모드 전환 단축키**: Ctrl+1~4 (Mac: ⌘+1~4) 로 Grid/Column/List/Detail 전환
- **ViewMode 타입 중앙화**: `types.ts`에 ViewMode 타입 추출, 인라인 반복 제거

### Fixed
- **list/details 뷰 방향키 10단계 점프 버그**: grid 카드 너비 기반 열 수 계산이 list/details 뷰에도 적용되어 ↑↓가 ~10칸씩 건너뛰던 문제 수정

## [1.6.0] - 2026-02-28

### Added
- **OS ↔ 탐색기 파일 드래그 이동**: OS 탐색기에서 QuickFolder로, 또는 반대로 파일을 드래그하여 직접 이동
  - 로컬 ↔ 로컬: 이동(move), 클라우드 스토리지(Google Drive/Dropbox/OneDrive/iCloud) ↔ 로컬: 복사(copy)
  - `Tauri onDragDropEvent` 기반 외부 파일 드롭 수신
- **F2 일괄 이름변경 개선**: 여러 파일 선택 후 F2 → 파일명이 다르면 일괄 이름변경 모달 자동 표시
- **새 폴더 인라인 생성**: Ctrl+Shift+N으로 "새 폴더" 즉시 생성 후 인라인 이름변경 모드 진입
- **비차단 디렉토리 로딩**: 폴더 진입 시 기존 파일 목록을 유지한 채 백그라운드에서 로딩
  - 탭별 entries 캐시로 탭 전환 시 즉시 표시
  - 로딩 중에도 다른 탭 이동, 파일 선택 등 모든 조작 가능

### Changed
- **Rust 커맨드 비동기화**: `get_file_thumbnail`, `get_video_thumbnail`, `get_image_dimensions`, `get_psd_thumbnail`, `list_directory`를 `async fn` + `spawn_blocking`으로 전환
  - 네트워크 파일시스템(Google Drive 등)에서 tokio 워커 스레드 차단 방지
  - UI 응답성 대폭 향상 (썸네일 로딩 중에도 앱 조작 가능)
- **동시성 제한 축소**: 프론트엔드 invoke 큐 12→3, Rust HeavyOpPermit 세마포어 8→3
  - 네트워크 파일시스템 환경에서 과부하 방지
- **macOS 단축키 표시**: 컨텍스트 메뉴·툴팁에서 Ctrl 대신 ⌘ 기호 표시
- **즐겨찾기 패널 단일 열 고정**: 다중 열 masonry 레이아웃 제거, 항상 1열 표시

### Fixed
- **Google Drive 폴더 진입 시 앱 전체 프리즈**: 동기 Rust 커맨드가 tokio 스레드풀 전체를 차단하던 근본 원인 해결
- **다중 선택 우클릭 메뉴 누락**: 여러 파일 선택 후 우클릭 시 "이름 모두 바꾸기" 등 일괄 메뉴가 표시되지 않던 문제 수정
- **사이드바 접기/펼치기 후 레이아웃 깨짐**: 섹션이 2열로 표시되던 문제 수정

## [1.5.0] - 2026-02-28

### Added
- **Shift+방향키 범위 선택**: 앵커 기반 확장/축소 범위 선택
- **동일 파일명(다른 확장자) 일괄 이름변경**: F2로 같은 이름의 여러 확장자 파일을 한 번에 변경
- **클립보드 이미지 붙여넣기**: 외부 앱에서 복사한 이미지 데이터를 PNG 파일로 저장

### Fixed
- **외부 파일 수정 시 썸네일 자동 갱신**: entry.modified 의존성 추가

## [1.4.2] - 2026-02-27

### Added
- **OS 클립보드 통합**: Ctrl+C로 복사한 파일을 Finder/탐색기/Google Drive에서 Ctrl+V로 붙여넣기 가능 (양방향)
- **박스 드래그 선택**: 빈 영역에서 드래그하여 여러 파일 선택 (Ctrl+드래그로 추가 선택)
- **기술 문서 전면 업데이트**: project_documentation.md를 v1.4.2 기준으로 재작성

### Fixed
- **F2 이름변경 후 Enter 폴더 진입 방지**: 이름변경 확정(Enter) 시 폴더에 진입하지 않도록 이벤트 전파 차단
- **이름변경 후 선택 유지**: F2 이름변경 완료 후 변경된 파일이 선택 상태 유지
- **분할 화면 클립보드 공유**: 분할 뷰에서 패널 간 복사/붙여넣기가 정상 동작하도록 클립보드 상태 공유
- **키보드-마우스 포커스 동기화**: 마우스 클릭 후 키보드 방향키가 클릭한 위치에서 시작
- **터치패드 썸네일 크기 조정 차단**: 터치패드 스크롤로 인한 의도치 않은 썸네일 크기 변경 완전 차단

## [1.4.1] - 2026-02-27

### Fixed
- **창 포커스 깜빡임 방지**: 다른 앱에서 돌아올 때 불필요한 리렌더링 제거 (파일 변경 감지 후 조건부 갱신)

## [1.4.0] - 2026-02-26

### Added
- **Ctrl+W 탭 닫기**: 현재 탭 닫기 단축키 추가
- **Ctrl+Alt+W 다른 탭 모두 닫기**: 현재 탭만 남기고 나머지 탭 일괄 닫기
- **같은 폴더 내 파일 복사**: Ctrl+C/V로 같은 폴더 내 복사 시 "(복사)" 접미사 자동 추가

### Changed
- **드래그앤드롭 전면 재설계**: 드래그 중 아이템 위치 고정, 파란색 인디케이터 라인만 표시, 드롭 시 즉시 이동
- **세션↔즐겨찾기 드래그 분리**: 세션 드래그 시 즐겨찾기가 반응하지 않도록 충돌 감지 분리
- **빈 카테고리 드롭 허용**: 즐겨찾기를 빈 카테고리로 드래그하여 이동 가능

### Fixed
- **스페이스바 미리보기 토글**: 열린 미리보기가 스페이스바로 정상 닫힘 (깜빡임 버그 수정)
- **접힌 카테고리 드롭 버그**: 접힌 카테고리 사이에서 즐겨찾기가 잘못된 위치로 이동하던 문제 수정
- **네이티브 아이콘 복원**: .psd, .ai 등 기존 정상 표시되던 네이티브 아이콘 복원
- **아이콘 폴백 범위 축소**: .md, .json, .sh만 lucide 아이콘 폴백 (나머지는 OS 네이티브 유지)

## [1.3.1] - 2026-02-26

### Added
- **스페이스바 미리보기 토글**: 스페이스바로 미리보기 열기/닫기 전환 가능

### Changed
- **터치패드 핀치 줌 방지**: macOS 터치패드 핀치 제스처로 의도치 않은 썸네일 확대/축소 차단

## [1.3.0] - 2026-02-26

### Added
- **확장자별 전용 아이콘**: .gslides, .pdf, .ai, .exe, .unitypackage, .md 파일에 고유 아이콘 및 색상 표시
- **Google Workspace 파일 분류**: .gslides, .gdoc, .gsheet → Document 타입 분류
- **Unity 패키지 분류**: .unitypackage → Archive 타입 분류

### Changed
- **Windows 폴더 진입 단축키**: Ctrl+↓ → Alt+↓ 로 변경 (macOS Cmd+↓ 유지)
- **아이콘 시스템 리팩토링**: PSD 전용 분기를 확장자 기반 매핑 시스템으로 일반화

## [1.2.9] - 2026-02-25

### Added
- **탭 드래그 교차 패널 이동**: 분할 뷰에서 탭을 드래그하여 다른 패널로 이동
  - 마우스 기반 드래그 (Tauri WebView 호환, HTML5 Drag API 미사용)
  - 드래그 고스트 UI, 탭 사이 삽입 인디케이터, 패널 하이라이트 피드백
  - 같은 패널 내 탭 순서 변경 지원
  - 모든 탭 이동 시 자동으로 single 모드 전환
- **라이트모드 카테고리 색상 프리셋**: 진한 색상 12종 추가 (블랙, 차콜, 다크 레드 등)
- **PSD 파일 전용 아이콘**: FileImage 아이콘 + Adobe 퍼플 색상 표시
- **분할 뷰 토글 양쪽 패널 표시**: 두 번째 패널에서도 분할 모드 전환 가능

### Changed
- **썸네일 동시성 제한 완화**: 프론트엔드 큐 6→12, Rust 세마포어 4→8
- **Windows 시스템 파일 필터 개선**: desktop.ini, Thumbs.db, ntuser.dat 정확 매치

## [1.2.8] - 2026-02-25

### Changed
- **PSD 썸네일 그리드 제거**: 대량 PSD 파일이 PNG 썸네일 로딩을 차단하는 성능 문제 해결
- **PSD/이미지 우클릭 미리보기**: 컨텍스트 메뉴에서 "미리보기" 선택 시 800px 해상도 모달 표시

### Fixed
- **대량 이미지 파일 스크롤 시 앱 크래시**: 프론트엔드+Rust 이중 동시성 제한
  - 프론트엔드: invoke 큐 (동시 3개, 대기 최대 20개, 초과 시 오래된 요청 자동 취소)
  - Rust 백엔드: HeavyOpPermit 세마포어 (동시 2개) + catch_unwind 패닉 방지
  - 줌 변경·디렉토리 이동 시 대기 큐 전체 취소
  - PSD 규격 조회: 전체 파일 로드 → 헤더 26바이트만 읽기로 최적화

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
