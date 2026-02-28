# 6개 기능 설계서 (2026-02-28)

## 기능 1: PSB 파일 스페이스바 미리보기

**범위**: 스페이스바/우클릭 미리보기만 (그리드 썸네일 제외, 성능 이유)

### 변경사항
- `src-tauri/src/lib.rs`: `get_psd_thumbnail`에 `.psb` 확장자 인식 추가, `get_image_dimensions`에 PSB 지원
- `components/FileExplorer/index.tsx`: 스페이스바 핸들러에서 `.psb` 확장자 처리
- `components/FileExplorer/FileCard.tsx`: PSB를 PSD와 동일하게 `isPsd` 플래그 처리

### 기술 노트
- `psd` 크레이트의 PSB 호환성 확인 필요 (미지원 시 별도 파싱 구현)
- PSB 헤더 시그니처: `8BPB` (PSD는 `8BPS`)

---

## 기능 2: 검색/폴더생성 버튼 위치 변경

**변경**: `[새 폴더][검색]` → `[검색][새 폴더]`

### 변경사항
- `NavigationBar.tsx`: 검색 버튼과 새 폴더 버튼의 JSX 순서 교체

---

## 기능 3: macOS 보호 폴더 권한 팝업 반복 해결

**문제**: macOS TCC 보호 폴더(다운로드, 문서, 데스크톱 등) 접근 시 권한 팝업 반복

### 해결 방안
- `src-tauri/entitlements.plist` (신규): macOS 파일 접근 entitlements 설정
  - `com.apple.security.files.downloads.read-write`
  - `com.apple.security.files.user-selected.read-write`
- `src-tauri/tauri.conf.json`: entitlements 파일 참조 추가

---

## 기능 4: 썸네일 확대 5X, 6X 추가

**변경**: 8단계 → 10단계 (`280: '5X'`, `320: '6X'` 추가)

### 변경사항
- `types.ts`: `ThumbnailSize` 타입에 280, 320 추가
- `components/FileExplorer/index.tsx`: `THUMBNAIL_SIZES` 배열 업데이트
- `components/FileExplorer/NavigationBar.tsx`: `sizeLabels` 및 드롭다운 업데이트

---

## 기능 5: 좌측 사이드바 폴딩

### 설계
- "즐겨찾기" 텍스트 → 접기/펼치기 토글 아이콘
- 접힌 상태: 32px, 폴딩 아이콘만 표시
- 전환: CSS transition 애니메이션 (좌측 슬라이드)
- 단축키: Ctrl+B (Mac: Cmd+B) 토글
- localStorage `qf_sidebar_collapsed` 상태 저장

### 변경사항
- `App.tsx`: `sidebarCollapsed` 상태, Ctrl+B 핸들러, 조건부 패널 너비

---

## 기능 6: 일괄 이름변경 팝업

### UI 구조
- 변경할 이름 / 대체할 이름 입력 필드
- 5개 작업 버튼 (누적 적용):
  - Rename: 전체 이름 교체 (확장자 유지)
  - Replace: 문자열 치환 (두 필드 모두 필수)
  - Prefix: 접두사 추가
  - Suffix: 접미사 추가 (확장자 앞)
  - Number: 순번 추가 (자리수 설정 가능, 기본 1)
- 미리보기: 원본 → 변경될 이름 실시간 표시
- 적용 버튼: `rename_item` 커맨드로 실제 반영

### 변경사항
- `components/FileExplorer/BulkRenameModal.tsx` (신규)
- `components/FileExplorer/ContextMenu.tsx`: "이름 모두 바꾸기" 메뉴 항목 추가
- `components/FileExplorer/index.tsx`: 모달 상태 관리
