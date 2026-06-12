# 검색 & 필터

## 역할
현재 폴더 내 파일 필터링(로컬)과 전역 파일 검색(Rust)을 제공한다.

## 위치
- 로컬 필터: `components/FileExplorer/hooks/useSearchFilter.ts`
- 전역 검색 모달: `components/FileExplorer/GlobalSearchModal.tsx`
- 폴더 이동 모달: `components/FileExplorer/GoToFolderModal.tsx`

## useSearchFilter 주요 exports
| 이름 | 설명 |
|------|------|
| `searchQuery` | 검색어 state |
| `setSearchQuery` | 검색어 설정 |
| `activeExtFilters` | 확장자 필터 Set |
| `displayEntries` | 퍼지 필터·확장자 필터 적용된 최종 파일 목록 |
| `fuzzyMatchIndices` | 파일 경로 → 매칭 문자 인덱스 (하이라이트용) |
| `isFiltering` | 검색어가 비어 있지 않은지 |

## 인라인 퍼지 필터
- 위치: `InlineFuzzyFilterInput.tsx`, `hooks/useInlineFuzzyFilter.ts`, `utils/fuzzyMatch.ts`, `FuzzyHighlightedName.tsx`
- 한글·IME 입력은 **hidden input** `onChange`만 사용 (`keydown`으로 첫 글자를 넣지 않음 — IME 깨짐 방지)
- 활성 패널에서는 hidden input에 포커스 유지, 방향키·Ctrl 단축키는 input에서 탐색기로 재전달
- 리스트 포커스 상태에서 **검색창 없이** 바로 타이핑하면 fzf 스타일 퍼지 매칭 시작
- **목록에서 항목을 숨기지 않음** — 비일치 항목은 흐리게, 매칭 글자는 accent 색으로 강조
- 최고 점수 항목으로 자동 선택·스크롤
- `Backspace` 한 글자 삭제, `ESC` 필터 취소
- **회귀 방지**: 검색 중 파일 자동 선택 없음. `Backspace`/`Delete`는 탐색기(삭제·뒤로가기)로 넘기지 않음. Windows에서는 `Backspace`로 파일 삭제 불가
- 네비게이션 바 검색(`Ctrl+F`)과 동일한 `searchQuery` state 공유

## displayEntries 파생 흐름
```
entries (원본)
  → activeExtFilters (확장자)
  → fuzzyMatch(searchQuery) — 메타데이터만 계산 (fuzzyMatchIndices, fuzzyBestPath)
  → displayEntries는 확장자 필터만 적용, 퍼지는 시각화 전용
```

## 단축키
| 단축키 | 기능 |
|--------|------|
| (타이핑) | 인라인 퍼지 필터 시작 |
| `Ctrl+F` | 현재 폴더 검색창 토글 |
| `Ctrl+Shift+F` | 전역 검색 모달 (`GlobalSearchModal`) |
| `Ctrl+Shift+G` | 폴더 경로로 이동 (`GoToFolderModal`) |
| `ESC` | 인라인/로컬 검색 취소 |
| `Backspace` | 인라인 필터 시 마지막 글자 삭제 |

## 전역 검색 (Rust)
```typescript
invoke('search_files', { root, query, maxResults })
// → Vec<FileEntry> 반환
// Windows: Search Index → walkdir 폴백
// macOS: mdfind(Spotlight) → walkdir 폴백
```

## 중복 파일 찾기
- 폴더 우클릭 `중복 파일 찾기` — [duplicate-finder.md](duplicate-finder.md)
- `search_files`와 동일한 walkdir·필터, 추가로 xxh3 해시로 **내용** 비교
```typescript
invoke('find_duplicate_files', { root: folderPath })
// → DuplicateFileGroup[] { size, files }
```

## 관련 위키
- [FileExplorer.md](FileExplorer.md)
- [duplicate-finder.md](duplicate-finder.md)
