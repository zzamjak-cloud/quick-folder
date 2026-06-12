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
| `extensionFilter` | 확장자 필터 state |
| `setExtensionFilter` | 확장자 필터 설정 |
| `displayEntries` | 필터·정렬 적용된 최종 파일 목록 |

## displayEntries 파생 흐름
```
entries (원본)
  → searchQuery 필터 (파일명 포함 여부)
  → extensionFilter 필터 (확장자 매칭)
  → sortBy + sortDir 정렬
  → displayEntries
```

## 단축키
| 단축키 | 기능 |
|--------|------|
| `Ctrl+F` | 현재 폴더 검색창 포커스 |
| `Ctrl+Shift+F` | 전역 검색 모달 (`GlobalSearchModal`) |
| `Ctrl+Shift+G` | 폴더 경로로 이동 (`GoToFolderModal`) |

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
