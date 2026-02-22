# 파일 탐색기 개선 설계

**날짜:** 2026-02-22
**상태:** 승인됨

## 개요

파일 탐색기 UX 7가지 개선사항 구현 계획.

---

## 1. 폴더 목록 버튼 드롭다운화

**대상:** `App.tsx` > `SortableShortcutItem`

- 현재: Edit2, Copy, Trash2 버튼 3개 (hover 시 노출)
- 변경: `MoreVertical` 아이콘 1개 → 클릭 시 드롭다운 메뉴 (수정/경로복사/삭제)
- 효과: 텍스트 표시 영역 확보

## 2. 툴바 → 좌측 사이드바 이동

**대상:** `App.tsx`

- 현재: 상단 `div.toolbar` (검색, ZoomIn, Palette, Plus)
- 변경: 좌측 패널 내부 상단에 인라인으로 배치
- 효과: 우측 탐색기 화면이 상단까지 확장됨

## 3. 썸네일 비율 유지

**대상:** `components/FileExplorer/FileCard.tsx` L184

- 현재: `object-cover` (잘림)
- 변경: `object-contain` (비율 유지, 레터박스)

## 4. 시스템 단축키 + Quick Look

**대상:** `components/FileExplorer/index.tsx`, `src-tauri/src/lib.rs`

### 단축키 (macOS 기준)
| 단축키 | 동작 |
|--------|------|
| `Cmd+[` | 뒤로 |
| `Cmd+]` | 앞으로 |
| `Cmd+↑` | 상위 폴더 |
| `Spacebar` | Quick Look (선택 항목) |
| `Cmd+↓` / `Enter` | 열기 |
| `Cmd+Delete` | 휴지통 삭제 |

### Quick Look
- Rust 커맨드: `quick_look(path: String)` → `qlmanage -p <path>` 실행
- macOS 전용 (다른 플랫폼에서는 `open_folder` fallback)

## 5. Ctrl+=/- 탐색기 줌

**대상:** `components/FileExplorer/index.tsx`

- `Ctrl+=` / `Ctrl++`: 썸네일 크기 80→120→160 순환
- `Ctrl+-`: 160→120→80 순환
- 현재 단축키 `Ctrl+C/X/V` 등과 충돌 없음

## 6. 방향키 포커스 이동

**대상:** `components/FileExplorer/index.tsx`, `components/FileExplorer/FileGrid.tsx`

- `focusedIndex` 상태 추가
- `ArrowRight/Left`: 인덱스 ±1
- `ArrowDown/Up`: 인덱스 ±컬럼수 (그리드 너비 기준 계산)
- `Enter`: 열기, `Space`: Quick Look
- 포커스된 카드에 강조 테두리 표시

## 7. 3가지 뷰 모드

**대상:** `components/FileExplorer/NavigationBar.tsx`, `FileGrid.tsx`, `FileCard.tsx`

### 뷰 타입
| 뷰 | 설명 |
|----|------|
| Grid | 현재 썸네일 카드 그리드 |
| List | 작은 아이콘 + 이름 한 줄 (콤팩트) |
| Details | 이름/크기/날짜/형식 컬럼 테이블 |

- `NavigationBar`에 Grid/List/Details 전환 버튼 3개 (Lucide: LayoutGrid, List, Table2)
- `viewMode` 상태 → `FileGrid`에서 분기 렌더링
- Details 뷰: 헤더 클릭으로 컬럼 정렬

---

## 파일 변경 목록

| 파일 | 변경 |
|------|------|
| `App.tsx` | 툴바 제거, 좌측 패널 헤더로 이동, SortableShortcutItem 드롭다운화 |
| `src-tauri/src/lib.rs` | `quick_look` 커맨드 추가 |
| `components/FileExplorer/index.tsx` | 단축키 확장, viewMode/focusedIndex 상태 추가 |
| `components/FileExplorer/NavigationBar.tsx` | 뷰 전환 버튼 추가 |
| `components/FileExplorer/FileGrid.tsx` | viewMode 분기, focusedIndex prop |
| `components/FileExplorer/FileCard.tsx` | object-contain, focused 스타일 |
