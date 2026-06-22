# FileExplorer

## 역할
파일 탐색기 오케스트레이터. 탐색 히스토리, 선택, 탭, 컨텍스트 메뉴 등 상태를 조합하고, 렌더링은 하위 컴포넌트에 위임한다.

- **상태·훅 wiring**: `index.tsx`
- **레이아웃·본문·모달**: `ExplorerLayout` / `ExplorerContent` / `ExplorerModalBridge` / `FileExplorerModalLayer`
- **폴더 로드**: `useDirectoryLoader` (이전 `index.tsx` 내 `loadDirectory`에서 분리)

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

## 렌더링 계층

```
index.tsx
├── ExplorerLayout        ← pane·인라인 퍼지 필터
│   └── ExplorerContent   ← TabBar·NavBar·FileGrid/ColumnView·StatusBar
├── ExplorerModalBridge   ← ContextMenu·ConfirmDialog·ProgressOverlay
└── FileExplorerModalLayer ← React.lazy 모달 (PreviewModals·편집 도구 등)
```

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

## 핵심 함수 (index.tsx + 분리 훅)

| 함수/훅 | 위치 | 설명 |
|---------|------|------|
| `loadDirectory(path)` | `useDirectoryLoader.ts` | `tauriCommands.listDirectory` → `setEntries` → `prewarmThumbnails` |
| `openArchiveEntry(path)` | `usePreviewRouting.ts` | 압축 진입. 일반 압축은 반대편 패널, 중첩 압축은 현재 패널 |
| `handleSelection(path, e)` | `useExplorerSelection.ts` | 클릭·Shift·Ctrl 선택 처리 |
| `handleContextMenu(e, paths)` | `index.tsx` | 우클릭 메뉴 표시 |
| `handleUndo()` | `index.tsx` | `undoStack`에서 액션 꺼내 복원 |

## 의존 관계
### 사용하는 훅
→ [overview.md](overview.md) 훅 맵 참조. 특히 `useDirectoryLoader`, `useExplorerSelection`, `usePreviewRouting`이 index.tsx에서 분리됐다.

### Rust 호출 (tauriCommands)
raw `invoke()` 대신 `tauriCommands.*` 사용:

```typescript
import { tauriCommands } from '../../utils/tauriCommands';

await tauriCommands.listDirectory({ path });
await tauriCommands.renameItem({ oldPath, newName });
await tauriCommands.restoreTrashItems({ paths });
```

- `listDirectory` — 폴더/압축 가상 경로 내용 나열 (핵심)
- `openFolder` — 일반 파일, 압축 내부 실파일을 OS 기본 연결로 열기
- `restoreTrashItems` — 삭제 취소
- `renameItem` — 이름변경 취소

## persist (localStorage)
탭·정렬·뷰 모드 등은 `utils/storage.ts`의 `storageKeys`와 `readStorage`/`writeStorage`로 저장한다. 키 이름을 직접 하드코딩하지 않는다.

## 주의사항
- **`loadRequestRef` 카운터** (`useDirectoryLoader`): `loadDirectory` 호출마다 카운터 증가. 이전 요청 응답이 늦게 오면 무시됨.
- **`entriesCacheRef`**: 탭 전환 시 즉시 렌더를 위한 메모리 캐시.
- **`cancelAllQueued()`**: 폴더 이동 시 반드시 호출해 대기 중인 썸네일 요청 취소.
- **압축 루트 경로 규칙**: 압축 루트는 `sample.zip\` 같이 separator가 붙은 가상 경로로 다뤄야 한다.
- **분할 패널 규칙**: 일반 압축은 반대편 패널에 열고, 중첩 압축은 현재 패널에 유지한다.
- **분할 전환 규칙**: `Ctrl+L`은 좌우 → 상하 → 해제를 순환한다.
- **마지막 탭 닫기 규칙**: 분할 화면에서 패널의 마지막 탭을 닫으면 분할 화면을 해제한다.
- **탭 동기화 규칙**: 열린 폴더가 rename/delete 되면 탭 경로와 제목을 갱신하거나 해당 탭을 닫는다.
- **압축 내부 쓰기 금지**: 삭제/이름변경/새 폴더 생성 같은 조작은 `useFileOperations`에서 차단된다.
- **lazy 모달**: 대형 모달은 `FileExplorerModalLayer.tsx`에서 `React.lazy`로 지연 로딩한다.

## 관련 위키
- [overview.md](overview.md)
- [archives.md](archives.md)
- [tabs.md](tabs.md)
- [context-menu.md](context-menu.md)
- [../operations/undo.md](../operations/undo.md)
- [../preview/thumbnails.md](../preview/thumbnails.md)
- [../preview/modals.md](../preview/modals.md)
