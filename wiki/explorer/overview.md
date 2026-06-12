# 파일 탐색기 개요

## 기술 기반
- React 19 + TypeScript
- 진입점: `components/FileExplorer/index.tsx` (1,977줄)
- 상태관리: React hooks (useState, useCallback, useRef, useMemo)

## 컴포넌트 맵

```
FileExplorer/index.tsx         ← 메인 컨트롤러
├── TabBar.tsx                 ← 탭 목록·핀·닫기
├── NavigationBar.tsx          ← 브레드크럼·정렬·뷰 전환·썸네일 크기
├── FileGrid.tsx               ← 파일 목록 렌더링
│   └── FileCard.tsx           ← 개별 파일 카드 (lazy 썸네일·인라인 이름변경)
├── ColumnView.tsx             ← Finder 스타일 컬럼 뷰
│   ├── ColumnPanel.tsx
│   └── ColumnPreviewPanel.tsx
├── ContextMenu.tsx            ← 우클릭 메뉴 (sections 배열만 받음)
├── DuplicateFilesModal.tsx    ← 중복 파일 찾기 (썸네일 그룹)
├── DiffViewerModal.tsx        ← 텍스트/코드 2파일 Diff
├── GlobalSearchModal.tsx      ← 전역 파일 검색
├── StatusBar.tsx              ← 하단 선택 항목 정보
└── ui/
    ├── ModalShell.tsx         ← 공용 모달 래퍼 (오버레이·헤더·ESC)
    └── modalStyles.ts         ← 공용 모달 스타일 상수
```

## 훅 맵 (hooks/)

| 훅 | 파일 | 역할 |
|----|------|------|
| `useTabManagement` | `hooks/useTabManagement.ts` | 탭 CRUD·내비게이션 히스토리 |
| `useUndoStack` | `hooks/useUndoStack.ts` | 실행취소 스택 |
| `useModalStates` | `hooks/useModalStates.ts` | 모달 열림/닫힘 |
| `useColumnView` | `hooks/useColumnView.ts` | 컬럼 뷰 상태·캐시 |
| `useFileOperations` | `hooks/useFileOperations.ts` | 삭제·복제·이름변경·그룹화 |
| `useClipboard` | `hooks/useClipboard.ts` | 복사·잘라내기·붙여넣기 |
| `useKeyboardShortcuts` | `hooks/useKeyboardShortcuts.ts` | 전역 키보드 단축키 |
| `useSearchFilter` | `hooks/useSearchFilter.ts` | 검색어·확장자 필터 |
| `usePreview` | `hooks/usePreview.ts` | 파일 미리보기 상태 |
| `useInternalDragDrop` | `hooks/useInternalDragDrop.ts` | 내부 드래그앤드롭·압축 파일 꺼내기 |
| `useRenameInput` | `hooks/useRenameInput.ts` | 인라인 이름변경 입력 |
| `useContextMenuBuilder` | `hooks/useContextMenuBuilder.tsx` | 우클릭 메뉴 구성 |
| `usePersistentScroll` | `hooks/usePersistentScroll.ts` | 스크롤 위치 복원 |
| `useNativeIcon` | `hooks/useNativeIcon.ts` | 네이티브 파일 아이콘 |
| `thumbnailCache` | `hooks/thumbnailCache.ts` | 썸네일 메모리 캐시 |
| `invokeQueue` | `hooks/invokeQueue.ts` | Rust 호출 큐 |

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

## 압축 탐색 흐름
- 압축 파일은 별도 팝업이 아니라 `FileExplorer` 안의 가상 경로로 연다.
- 일반 파일시스템에서 압축 파일을 더블클릭하면 반대편 패널에 연다.
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
