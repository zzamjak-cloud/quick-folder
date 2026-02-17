# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
