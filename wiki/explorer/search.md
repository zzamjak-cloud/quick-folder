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
- **회귀 방지(IME 첫 음절)**: 패널 활성 시 hidden input에 포커스를 *미리* 유지해야 한다. 포커스를 검색어 생성 후로 미루면 한글 조합이 첫 음절부터 시작될 곳이 없어 "버"→"ㅂㅓ"처럼 자모가 분리된다 (`useInlineFuzzyFilter`의 focus 유지 + `focusin` 재포커스).
- **회귀 방지(한글 매칭)**: `fuzzyMatch`는 검색어·파일명을 모두 `normalize('NFC')` 한 뒤 비교한다. macOS 파일명은 NFD(분해형), 키보드 입력은 NFC(조합형)라 정규화 없이는 코드포인트가 달라 매칭이 실패한다. 인덱스도 NFC 기준이므로 `FuzzyHighlightedName`도 이름을 NFC로 정규화한다.
- 활성 패널에서는 hidden input에 포커스 유지, 방향키·Ctrl 단축키와 `Delete`는 input에서 탐색기로 재전달
- 리스트 포커스 상태에서 **검색창 없이** 바로 타이핑하면 fzf 스타일 퍼지 매칭 시작
- **목록에서 항목을 숨기지 않음** — 비일치 항목은 흐리게, 매칭 글자는 accent 색으로 강조
- 최고 점수 항목으로 자동 선택·스크롤
- `Backspace` 한 글자 삭제, `ESC` 필터 취소
- **회귀 방지**: 검색 중 파일 자동 선택 없음. 인라인 퍼지 필터에서 `Backspace`는 탐색기(삭제·뒤로가기)로 넘기지 않는다. Windows `Delete`는 선택 항목 삭제 shortcut으로 넘기되, 명시적 로컬 검색 모드에서는 파일 삭제로 해석하지 않는다.
- 네비게이션 바 검색 버튼은 로컬 `searchQuery` state를 사용한다. `Ctrl+F`/`Ctrl+Shift+F`는 전역 재귀 검색 모달을 연다.

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
| `Ctrl+F` | 전역 검색 모달 (`GlobalSearchModal`) |
| `Ctrl+Shift+F` | 전역 검색 모달 (`GlobalSearchModal`) |
| `Ctrl+Shift+G` | 폴더 경로로 이동 (`GoToFolderModal`) |
| `ESC` | 인라인/로컬 검색 취소 |
| `Backspace` | 인라인 필터 시 마지막 글자 삭제 |

## 전역 검색 (Rust)
```typescript
import { tauriCommands } from '../../utils/tauriCommands';

await tauriCommands.searchFiles({ root, query, maxResults });
// → Vec<FileEntry> 반환
// Windows: Search Index → walkdir 폴백
// macOS: mdfind(Spotlight) → walkdir 폴백
```

## 중복 파일 찾기
- 폴더 우클릭 `중복 파일 찾기` — [duplicate-finder.md](duplicate-finder.md)
- `search_files`와 동일한 walkdir·필터, 추가로 xxh3 해시로 **내용** 비교
```typescript
await tauriCommands.findDuplicateFiles({ root: folderPath });
// → DuplicateFileGroup[] { size, files }
```

## 관련 위키
- [FileExplorer.md](FileExplorer.md)
- [duplicate-finder.md](duplicate-finder.md)
