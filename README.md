<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# QuickFolder Widget

로컬 폴더 바로가기를 카테고리별로 관리하는 경량 데스크톱 파일 매니저. 통합 파일 탐색기, 이미지/동영상 썸네일, OS 드래그&드롭을 지원합니다.

## 주요 기능

- **카테고리별 폴더 바로가기** — 드래그&드롭으로 즐겨찾기 등록
- **통합 파일 탐색기** — 그리드/리스트/컬럼/상세 뷰, 탭, 키보드 단축키
- **이미지·PSD·동영상 썸네일** — 네이티브 API 기반, 디스크 캐시
- **OS 파일 드래그 내보내기** — 탐색기에서 외부 앱으로 파일 드래그
- **실행취소 (Ctrl+Z)** — 삭제·이름변경 최대 10단계 되돌리기
- **자동 업데이트** — GitHub Releases 기반

## 기술 스택

- **Tauri 2.x** (Rust + WebView) — 3~5MB 설치 파일
- **React 19** + TypeScript + Vite
- **TailwindCSS** + Lucide React

## 개발

**사전 요구사항:** Node.js, Rust toolchain

```bash
# 의존성 설치
npm install

# 개발 모드 실행 (Tauri 앱 + HMR)
npm run tauri dev

# 프로덕션 빌드
npm run tauri build
```

## 라이선스

MIT
