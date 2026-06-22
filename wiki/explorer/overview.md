# 파일 탐색기 개요

## 기술 기반
- React 19 + TypeScript
- 진입점: `components/FileExplorer/index.tsx` (~1,128줄) — 상태·훅 조합 오케스트레이터
- 상태관리: React hooks (useState, useCallback, useRef, useMemo)
- Rust 호출: `tauriCommands.*` + `utils/tauriInvoke.ts` 큐 (raw `invoke` 직접 호출 금지)

## 컴포넌트 맵

```
FileExplorer/index.tsx              ← 오케스트레이터 (훅 조합·이벤트 wiring)
├── ExplorerLayout.tsx              ← pane 컨테이너·인라인 퍼지 필터
├── ExplorerContent.tsx             ← TabBar·NavigationBar·FileGrid/ColumnView·StatusBar
├── ExplorerModalBridge.tsx         ← 컨텍스트 메뉴·확인 다이얼로그·진행 오버레이
├── FileExplorerModalLayer.tsx      ← React.lazy 모달 일괄 Suspense 마운트
├── TabBar.tsx                      ← 탭 목록·핀·닫기
├── NavigationBar.tsx               ← 브레드크럼·정렬·뷰 전환·썸네일 크기
├── FileGrid.tsx                    ← 파일 목록 컨테이너
│   ├── fileGrid/FileGridRows.tsx   ← ListRow·GridRow 행 렌더링·선택·rename UI
│   └── FileCard.tsx                ← 개별 파일 카드 (lazy 썸네일·인라인 이름변경)
├── ColumnView.tsx                  ← Finder 스타일 컬럼 뷰
│   ├── ColumnPanel.tsx
│   └── ColumnPreviewPanel.tsx
├── PreviewModals.tsx               ← 미리보기 라우터 (형식별 모달 조합)
│   ├── ImagePreviewModal.tsx
│   ├── VideoPreviewModal.tsx
│   ├── TextPreviewModal.tsx
│   └── *PreviewModalHost.tsx       ← Markdown/Json/Hwp thin host
├── CodePreviewModal.tsx            ← 코드 편집기 shell
│   └── codePreview/                ← 에디터 surface·검색·folding·syntax (8파일)
├── ContextMenu.tsx                 ← 우클릭 메뉴 (sections 배열만 받음)
├── DuplicateFilesModal.tsx         ← 중복 파일 찾기 (썸네일 그룹)
├── DiffViewerModal.tsx             ← 텍스트/코드 2파일 Diff
├── GlobalSearchModal.tsx           ← 전역 파일 검색
├── StatusBar.tsx                   ← 하단 선택 항목 정보
└── ui/
    ├── ModalShell.tsx              ← 공용 모달 래퍼 (오버레이·헤더·ESC)
    └── modalStyles.ts              ← 공용 모달 스타일 상수
```

## 훅 맵 (hooks/)

| 훅 | 파일 | 역할 |
|----|------|------|
| `useTabManagement` | `hooks/useTabManagement.ts` | 탭 CRUD·내비게이션 히스토리 |
| `useUndoStack` | `hooks/useUndoStack.ts` | 실행취소 스택 |
| `useModalStates` | `hooks/useModalStates.ts` | 모달 열림/닫힘 |
| `useColumnView` | `hooks/useColumnView.ts` | 컬럼 뷰 상태·캐시 |
| `useFileOperations` | `hooks/useFileOperations.ts` | 파일 조작 facade (서브훅 위임) |
| `useDeleteOperations` | `hooks/useDeleteOperations.ts` | 삭제·영구삭제·elevated 확인 |
| `useArchiveOperations` | `hooks/useArchiveOperations.ts` | ZIP 압축/해제 |
| `useFolderSizeOperations` | `hooks/useFolderSizeOperations.ts` | 폴더 용량 분석 다이얼로그 |
| `useDirectoryLoader` | `hooks/useDirectoryLoader.ts` | `loadDirectory`·prefetch·entries 캐시 |
| `useExplorerSelection` | `hooks/useExplorerSelection.ts` | 클릭·Shift·Ctrl 선택·anchor |
| `usePreviewRouting` | `hooks/usePreviewRouting.ts` | 더블클릭→미리보기/압축 진입 |
| `useClipboard` | `hooks/useClipboard.ts` | 복사·잘라내기·붙여넣기 |
| `useKeyboardShortcuts` | `hooks/useKeyboardShortcuts.ts` | 전역 키보드 단축키 |
| `useSearchFilter` | `hooks/useSearchFilter.ts` | 퍼지 검색·확장자 필터 |
| `useInlineFuzzyFilter` | `hooks/useInlineFuzzyFilter.ts` | 리스트 포커스 인라인 타이핑 필터 |
| `usePreview` | `hooks/usePreview.ts` | 파일 미리보기 상태 |
| `useInternalDragDrop` | `hooks/useInternalDragDrop.ts` | 내부 드래그앤드롭·압축 파일 꺼내기 |
| `useRenameInput` | `hooks/useRenameInput.ts` | 인라인 이름변경 입력 |
| `useContextMenuBuilder` | `hooks/useContextMenuBuilder.tsx` | 우클릭 메뉴 구성 |
| `usePersistentScroll` | `hooks/usePersistentScroll.ts` | 스크롤 위치 복원 |
| `useNativeIcon` | `hooks/useNativeIcon.ts` | 네이티브 파일 아이콘 |
| `thumbnailCache` | `hooks/thumbnailCache.ts` | 썸네일 메모리 캐시 |
| `invokeQueue` | `hooks/invokeQueue.ts` | `utils/tauriInvoke.ts` re-export |

## 뷰 모드 (ViewMode)

| 값 | 단축키 | 설명 |
|----|--------|------|
| `'grid'` | Ctrl+1 | 썸네일 그리드 |
| `'columns'` | Ctrl+2 | Finder 스타일 컬럼 |
| `'list'` | Ctrl+3 | 단순 목록 |
| `'details'` | Ctrl+4 | 크기·날짜 포함 상세 |

## 분할 뷰 (App.tsx)

```
splitMode: 'single' | 'horizontal' | 'vertical'
focusedPane: 0 | 1
Pane 0 ← explorerRequest
Pane 1 ← explorerRequest2  (splitMode != 'single' 일 때)
sharedClipboard ← 두 패인 간 공유
```

분할 모드는 `Ctrl+L`로 좌우 분할 → 상하 분할 → 단일 화면 순서로 순환한다. 단일 화면에서 분할로 진입하면 현재 활성 탭을 보조 패널에 복제하고, 이후 두 패널의 탐색은 독립적으로 관리한다.

분할 화면에서 한 패널의 마지막 탭을 닫으면 빈 패널을 유지하지 않고 분할 화면을 해제한다. 닫히지 않은 패널의 경로를 단일 화면에 유지하며, 삭제 이벤트로 닫힌 경로는 `Macintosh HD`/`내 PC` 가상 루트로 대체한다.

## 사이드바 접힘 레일

`Ctrl+B`로 사이드바를 접으면 32px 아이콘 레일만 남긴다. UI는 `components/AppSidebar.tsx`, 분할·포커스 상태는 `App.tsx`가 관리한다.

레일에는 최근항목, 시스템 루트, 데스크탑, 다운로드, 세션 약어 버튼을 표시한다. 세션 약어 버튼은 세션 제목의 첫 글자를 사용하고, 첫 글자가 중복되면 두 글자 약어로 구분한다. 클릭 시 `ContextMenu`를 재사용해 해당 세션 내부 폴더만 표시하며, 접힌 상태에서는 폴더 트리를 직접 펼치지 않는다.

## 압축 탐색 흐름
- 압축 파일은 별도 팝업이 아니라 `FileExplorer` 안의 가상 경로로 연다.
- 일반 파일시스템에서 압축 파일을 더블클릭하면 반대편 패널에 연다 (`usePreviewRouting`).
- 이미 압축 내부에 있을 때 중첩 압축을 더블클릭하면 현재 패널에서 계속 진입한다.
- 실제 경로/압축 내부 경로 구분은 `utils/pathUtils.ts`의 `isArchiveVirtualPath`, `splitArchiveVirtualPath`, `shouldOpenArchiveInCurrentPane`에 모여 있다.

## 관련 위키
- [FileExplorer.md](FileExplorer.md)
- [archives.md](archives.md)
- [tabs.md](tabs.md)
- [column-view.md](column-view.md)
- [context-menu.md](context-menu.md)
- [duplicate-finder.md](duplicate-finder.md)
- [search.md](search.md)
- [../preview/modals.md](../preview/modals.md)
- [../operations/useFileOperations.md](../operations/useFileOperations.md)
