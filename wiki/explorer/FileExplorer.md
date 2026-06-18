# FileExplorer

## 역할
파일 탐색기 메인 컨트롤러. 탐색 히스토리, 파일 목록 로딩, 선택, 탭, 컨텍스트 메뉴 등 모든 탐색기 상태를 통합 관리한다.

## 위치
`components/FileExplorer/index.tsx`

## Props
| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `instanceId` | `string` | `'default'` | 패인 식별자 (`'default'` \| `'pane-1'`) |
| `isFocused` | `boolean` | `true` | 활성 패인 여부 |
| `splitMode` | `string` | — | 분할 모드 |
| `onSplitModeChange` | `fn` | — | 분할 모드 변경 콜백. 마지막 탭 닫기 시 닫힌 패널 ID를 함께 전달 |
| `initialPath` | `string` | — | 초기 경로 |
| `onPathChange` | `fn` | — | 경로 변경 콜백 |
| `onAddToFavorites` | `fn` | — | 즐겨찾기 추가 콜백 |
| `onAddToCategory` | `fn` | — | 카테고리 추가 콜백 |
| `themeVars` | `ThemeVars` | — | 테마 CSS 변수 |
| `sharedClipboard` | `ClipboardData\|null` | — | 패인 간 공유 클립보드 |
| `onClipboardChange` | `fn` | — | 클립보드 변경 콜백 |
| `onStageFilesToTray` | `fn` | — | 임시 트레이에 파일 추가 |
| `onTrayDragStateChange` | `fn` | — | 트레이 드래그 상태 콜백 |
| `recentRoots` | `string[]` | `[]` | 최근 루트 경로 목록 |
| `initialPathKey` | `number` | `0` | 경로 강제 갱신 키 |

## 주요 State
| 이름 | 타입 | 설명 |
|------|------|------|
| `entries` | `FileEntry[]` | 현재 폴더 파일 목록 |
| `selectedPaths` | `string[]` | 선택된 경로들 |
| `sortBy` | `'name'\|'size'\|'modified'\|'type'` | 정렬 기준 |
| `sortDir` | `'asc'\|'desc'` | 정렬 방향 |
| `thumbnailSize` | `ThumbnailSize` | 썸네일 크기 |
| `viewMode` | `ViewMode` | 뷰 모드 |
| `loading` | `boolean` | 로딩 상태 |
| `contextMenu` | `{x,y,paths}\|null` | 우클릭 메뉴 위치 |
| `focusedIndex` | `number` | 키보드 포커스 인덱스 |
| `folderTags` | `Map<string,string>` | 폴더 태그 맵 (path → 태그명) |

## 주요 Ref
| Ref | 용도 |
|-----|------|
| `loadRequestRef` | 중복 로드 방지 카운터 |
| `entriesCacheRef` | 파일 목록 메모리 캐시 (Map) |
| `currentPathRef` | 현재 경로 (비동기 안전) |
| `selectionAnchorRef` | Shift 다중 선택 시작점 |
| `prefetchInFlightRef` | 프리페치 중복 방지 Set |

## 핵심 함수
| 함수명 | 설명 |
|--------|------|
| `loadDirectory(path)` | 폴더 내용 로드 (핵심). `list_directory` 호출 → `setEntries` → `prewarmThumbnails` |
| `openArchiveEntry(path)` | 압축 파일 진입. 일반 압축은 반대편 패널, 중첩 압축은 현재 패널에 연다 |
| `cacheEntries(path, entries)` | `entriesCacheRef`에 캐시 저장 |
| `prewarmThumbnails()` | 뷰포트 내 파일 썸네일 일괄 사전 로딩 |
| `handleSelection(path, e)` | 클릭·Shift·Ctrl 선택 처리 |
| `handleContextMenu(e, paths)` | 우클릭 메뉴 표시 |
| `handleUndo()` | `undoStack`에서 액션 꺼내 복원 |

## 의존 관계
### 사용하는 훅
모든 FileExplorer 전용 훅 (`hooks/` 디렉토리) 전체 사용.  
→ [overview.md](overview.md) 훅 맵 참조.

### 사용하는 Rust 명령
- `list_directory` — 폴더/압축 가상 경로 내용 나열 (핵심)
- `open_folder` — 일반 파일, 압축 내부 실파일을 OS 기본 연결로 열기
- `restore_trash_items` — 삭제 취소
- `rename_item` — 이름변경 취소

## 주의사항
- **`loadRequestRef` 카운터**: `loadDirectory` 호출마다 카운터 증가. 이전 요청 응답이 늦게 오면 카운터 불일치로 무시됨. 비동기 레이스 방지용.
- **`entriesCacheRef`**: 탭 전환 시 즉시 렌더를 위한 메모리 캐시. 캐시 히트 시 `loadDirectory` 없이 즉시 `setEntries`.
- **`cancelAllQueued()`**: 폴더 이동 시 반드시 호출해 대기 중인 썸네일 요청 취소.
- **압축 루트 경로 규칙**: 압축 루트는 `sample.zip\` 같이 separator가 붙은 가상 경로로 다뤄야 한다.
- **분할 패널 규칙**: 일반 압축은 반대편 패널에 열고, 중첩 압축은 현재 패널에 유지한다.
- **분할 전환 규칙**: `Ctrl+L`은 좌우 → 상하 → 해제를 순환한다. 단일 화면에서 분할 진입 시 현재 탭을 보조 패널에 복제한다.
- **마지막 탭 닫기 규칙**: 분할 화면에서 패널의 마지막 탭을 닫으면 빈 패널을 남기지 않고 분할 화면을 해제한다.
- **탭 동기화 규칙**: 열린 폴더가 rename/delete 되면 탭 경로와 제목을 갱신하거나 해당 탭을 닫는다.
- **압축 내부 쓰기 금지**: 삭제/이름변경/새 폴더 생성 같은 조작은 `useFileOperations`에서 차단된다.

## 관련 위키
- [archives.md](archives.md)
- [tabs.md](tabs.md)
- [context-menu.md](context-menu.md)
- [../operations/undo.md](../operations/undo.md)
- [../preview/thumbnails.md](../preview/thumbnails.md)
