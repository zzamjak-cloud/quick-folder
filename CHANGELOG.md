# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.4] - 2026-02-17

### Fixed
- 자동 업데이트 서명 키 설정 완료
- latest.json 파일 생성 및 배포 수정

### Changed
- GitHub Secrets에 서명 키 추가하여 updater 활성화

## [0.1.3] - 2026-02-17

### Fixed
- 자동 업데이트 체크 시 반복 알림 문제 수정
- GitHub Release 자동 publish 설정

### Changed
- CI/CD 워크플로우 개선: latest.json 자동 생성 및 배포

## [0.1.2] - 2025-12-21

### Added
- 자동 업데이트 시스템 구현
- 업데이트 알림 모달 UI

### Fixed
- Tauri 플러그인 버전 동기화
- Tauri 버전 업데이트 및 updater 공개키 설정

### Changed
- 문서 개선: 자동 업데이트 Sub Agent 사용법 추가

## [0.1.1] - 2025-12-13

### Changed
- 화면 크기 관련 개선
- 그리드 방식을 Masonry 방식으로 변경
- 노트북 배율 대응을 위해 드래그 시 좌표 기반에서 호버 탐지 방식으로 변경

### Fixed
- 컬러 프리셋 기능 수정

### Added
- 카테고리 드래그를 통한 순서 변경 기능
- Windows용 GitHub Actions 빌드 설정
- Windows 빌드 최적화

## [0.1.0] - 2025-12-13

### Added
- Electron에서 Tauri 2.x로 마이그레이션
- GitHub Actions CI/CD 파이프라인 추가
- 폴더 바로가기 관리 위젯 기본 기능
- 카테고리별 폴더 정리 기능
- 드래그 앤 드롭 지원 (내부 및 OS 간)
- 다크 테마 UI
- macOS 및 Windows 지원
