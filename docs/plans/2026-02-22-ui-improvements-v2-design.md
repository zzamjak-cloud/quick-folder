# UI 개선사항 v2 설계 문서

**날짜:** 2026-02-22
**범위:** 7개 기능 개선

---

## #1 즐겨찾기 DnD 첫 번째 위치 버그 수정

### 문제
@dnd-kit에서 shortcut을 드래그해 첫 번째 위치로 이동하거나 첫 번째 아이템과 자리를 바꿀 수 없음.

### 원인
`handleDragOver`에서 `over.id`가 shortcut ID가 아닌 카테고리 컨테이너 ID를 가리킬 때 첫 번째 위치 삽입 처리가 누락됨.

### 수정 방향
- `handleDragOver`: `over.id`가 카테고리 ID일 때 해당 카테고리의 첫 번째 위치에 삽입
- 파일: `App.tsx` (`handleDragOver`, `handleDragEnd`)

---

## #2 썸네일 크기 프리셋 확장

### 현재
`80 | 120 | 160` (3단계)

### 변경
`40 | 60 | 80 | 100 | 120 | 160 | 200 | 240` (8단계)

| 값 | 레이블 |
|----|--------|
| 40 | XS |
| 60 | S |
| 80 | M |
| 100 | L |
| 120 | XL |
| 160 | 2X |
| 200 | 3X |
| 240 | 4X |

- 기본값: `120` (Ctrl+0 리셋)
- 키보드 `Ctrl+=` / `Ctrl+-`: 8단계 순서 순환
- 파일: `types.ts`, `FileExplorer/index.tsx`, `FileExplorer/NavigationBar.tsx`, `FileExplorer/FileCard.tsx`

---

## #3 Grid 썸네일 이미지 규격 표시

### 동작
- 썸네일 `<img>` 의 `onLoad`에서 `naturalWidth`, `naturalHeight` 읽어 state 저장
- 파일 크기 표시 영역에 규격 함께 표시: `1.2 MB · 1920×1080`
- 이미지가 아닌 파일은 기존대로 파일 크기만 표시
- 백엔드 변경 없음

- 파일: `FileExplorer/FileCard.tsx`

---

## #4 PSD 파일 미리보기 토글

### 아키텍처
- **크로스플랫폼**: `psd` Rust 크레이트 (macOS/Windows 동일 동작)
- **캐싱**: 디스크 캐시 + 인메모리 캐시 조합

### Rust 백엔드
- `Cargo.toml`: `psd = "0.3"` 추가
- 신규 커맨드 `get_psd_thumbnail(path: String, size: u32) -> Result<Option<String>, String>`
- 캐시 키: `{파일경로}_{수정시각ms}_{크기}` 해시
- 캐시 저장 위치: `app_cache_dir/thumbnails/{hash}.png`
- Tauri state: `Mutex<HashMap<String, String>>` 인메모리 캐시 (세션 내 반복 접근 최적화)
- 파일 타입 분류: `classify_file`에 `"psd"` → `"image"` 추가

### 프론트엔드
- `FileExplorer/index.tsx`: `showPsdPreview: boolean` 상태 (기본 `false`, localStorage 저장)
- NavigationBar에 PSD 토글 버튼 (활성 시 accent 색상으로 강조)
- `FileCard.tsx`: `.psd` 확장자 + `showPsdPreview === true` 조건 충족 시 `get_psd_thumbnail` 호출
- 파일: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `FileExplorer/index.tsx`, `FileExplorer/NavigationBar.tsx`, `FileExplorer/FileCard.tsx`

---

## #5 즐겨찾기 기본 zoom 80%

### 변경
`App.tsx:478` — `useState(100)` → `useState(80)`

---

## #6 탐색기 파일 → 외부 앱 드래그

### 사용 기술
`tauri-plugin-drag` (macOS/Windows 크로스플랫폼)

### 동작 흐름
```
파일 카드 mousedown → 마우스 이동 임계값 초과 → drag() 호출
→ OS 네이티브 드래그 시작 → 외부 앱(Photoshop 등)에 드롭 → 파일 열기/임포트
```

### 구현
- `Cargo.toml`: `tauri-plugin-drag = "2"` 추가
- `package.json`: `@tauri-apps/plugin-drag` 추가
- `capabilities/default.json`: `drag:allow-drag` 권한 추가
- `FileCard.tsx`: `onMouseDown` → 마우스 이동 감지 → `drag({ items, image })` 호출
  - 이미지 파일: 썸네일을 드래그 커서로 사용
  - 기타 파일: 파일 경로를 items에 전달
- 다중 선택 지원: `selectedPaths` 전체를 `items` 배열로 전달

---

## #7 탐색기 탭 시스템

### 탭 데이터 구조
```typescript
interface Tab {
  id: string          // UUID
  path: string        // 현재 경로
  history: string[]   // 이 탭 전용 뒤로/앞으로 히스토리
  historyIndex: number
  title: string       // 경로 마지막 세그먼트 (폴더명)
}
```

### UI 레이아웃
```
┌──────────────────────────────────────────────────────────┐
│ [📁 Desktop ×] [📁 Projects ×] [📁 Downloads ×]  ...    │ ← TabBar
├──────────────────────────────────────────────────────────┤
│ [←][→][↑] /경로/브레드크럼  [PSD][정렬][뷰][+폴더]        │ ← NavigationBar
├──────────────────────────────────────────────────────────┤
│ [파일카드들...]                                            │ ← FileGrid
└──────────────────────────────────────────────────────────┘
```

### 키보드 단축키
| 단축키 | 동작 |
|--------|------|
| `Ctrl+T` | 현재 탭 복제 (우측에 삽입, 활성화) |
| `Tab` | 오른쪽 탭 순환 (마지막→첫 번째) |
| `Shift+Tab` | 왼쪽 탭 순환 (첫 번째→마지막) |
| 탭 `×` 클릭 | 탭 닫기 |
| 가운데 마우스 클릭 | 탭 닫기 |

`Tab`/`Shift+Tab`은 탐색기 영역에 포커스가 있고 텍스트 입력 중이 아닐 때만 탭 순환으로 동작.

### 동작 규칙
- 즐겨찾기 클릭 → 해당 경로 탭 이미 존재하면 전환, 없으면 새 탭 생성
- 마지막 탭 닫기 → 빈 상태 (탭 없음)
- 각 탭은 독립적인 뒤로/앞으로 히스토리 보유

### 영속성
- localStorage 키: `qf_explorer_tabs`, `qf_explorer_active_tab`
- 앱 재시작 시 탭 목록 및 활성 탭 복원

### 신규 파일
- `components/FileExplorer/TabBar.tsx`

### 수정 파일
- `components/FileExplorer/index.tsx` (탭 상태 관리, 히스토리 per-tab 분리)
- `App.tsx` (즐겨찾기 클릭 핸들러 → 탭 생성/전환)
