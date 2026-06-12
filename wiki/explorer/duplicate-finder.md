# 중복 파일 찾기

## 역할
선택한 폴더 하위를 재귀 스캔해 **내용이 동일한 파일**을 그룹별로 찾아 썸네일 리스트로 보여준다.  
전역 검색(`search_files`)과 같은 `walkdir` 기반 탐색·필터를 사용하며, 파일 내용은 xxh3 해시로 비교한다.

## 진입
- **폴더 단일 선택** → 우클릭 → `중복 파일 찾기`
- 컨텍스트 메뉴 섹션: `folder-tools` (`useContextMenuBuilder.tsx`)

## 위치
| 구분 | 경로 |
|------|------|
| UI 모달 | `components/FileExplorer/DuplicateFilesModal.tsx` |
| 모달 state | `useModalStates` → `duplicateFinderPath` |
| 메뉴 빌더 | `hooks/useContextMenuBuilder.tsx` |
| Rust 명령 | `src-tauri/src/modules/system_ops/file_search.rs` → `find_duplicate_files` |
| 타입 | `types.ts` → `DuplicateFileGroup` |

## 사용자 동작
| 동작 | 결과 |
|------|------|
| 썸네일 **좌클릭** | `handleGlobalSearchSelect`와 동일 — 파일이면 부모 폴더 이동 후 자동 선택, 폴더면 해당 경로 이동 |
| 썸네일 **우클릭 → 삭제** | 확인 후 `delete_items`(휴지통), 목록에서 해당 항목 제거 |
| **Escape** / 오버레이 | 모달 닫기 |

## Rust 알고리즘
```
walkdir 재귀 탐색 (숨김·시스템 파일 제외)
  → 크기(size)별 후보 그룹화
  → 동일 크기 2개 이상만 xxh3 전체 해시
  → 해시별 DuplicateGroup { size, files: Vec<FileEntry> } 반환
```

### 제한 (`constants.rs`)
| 상수 | 값 | 설명 |
|------|-----|------|
| `DUPLICATE_SCAN_MAX_DEPTH` | 20 | 재귀 최대 깊이 |
| `MAX_DUPLICATE_SCAN_FILES` | 100_000 | 스캔 파일 상한 |
| `MAX_DUPLICATE_GROUPS` | 500 | 반환 그룹 상한 |

- 0바이트 파일은 해시 없이 크기만으로 중복 판정
- `spawn_blocking`으로 UI 블로킹 방지

## 프론트 호출
```typescript
invoke<DuplicateFileGroup[]>('find_duplicate_files', { root: folderPath })
```

## 썸네일
- 이미지·동영상: `thumbnailCache` + `getPersistentThumbUrl` (FileCard와 동일)
- 그 외: `FileTypeIcon` 폴백
- IntersectionObserver로 lazy 로드

## 새 기능 추가 시 주의
- 결과 항목 클릭·삭제는 `index.tsx`의 `handleGlobalSearchSelect`, `handleDuplicateFileDelete`에 위임
- `check_duplicate_items`는 **붙여넣기 시 이름 충돌**용 — 본 기능과 무관

## 관련 위키
- [context-menu.md](context-menu.md)
- [search.md](search.md)
- [../rust/commands.md](../rust/commands.md)
