# QuickFolder Wiki

AI 탐색용 위키 인덱스. 작업 전 해당 파일을 먼저 읽으면 소스 탐색 없이 구조 파악 가능.

---

## 빠른 진입 (증상 / 작업 → 파일)

| 증상 / 작업 | 위키 파일 |
|------------|---------|
| 파일 탐색기 전체 구조 파악 | `explorer/overview.md` |
| FileExplorer 컴포넌트 수정 | `explorer/FileExplorer.md` |
| 파일 카드 UI 수정 | `explorer/FileCard.md` |
| 탭 추가·수정 | `explorer/tabs.md` |
| 컬럼 뷰 수정 | `explorer/column-view.md` |
| 우클릭 메뉴 항목 추가 | `explorer/context-menu.md` |
| 터미널 프리셋·우클릭 터미널 메뉴 | `explorer/context-menu.md` → `rust/commands.md` |
| 압축파일 내부 탐색·중첩 압축·꺼내기 | `explorer/archives.md` |
| 검색 필터 수정 | `explorer/search.md` |
| 중복 파일 찾기 | `explorer/duplicate-finder.md` |
| 텍스트 파일 Diff 비교 | `special/diff-viewer.md` |
| 복사·이동·삭제·이름변경 | `operations/useFileOperations.md` |
| 파일 전송 작업 큐·진행률 패널 | `operations/task-queue.md` |
| 클립보드 붙여넣기 버그 | `operations/useClipboard.md` |
| Ctrl+Z 실행취소 추가·수정 | `operations/undo.md` |
| 드래그앤드롭 버그 | `operations/drag-drop.md` |
| 썸네일 안 뜨거나 느림 | `preview/thumbnails.md` |
| 미리보기 모달 추가·수정 | `preview/modals.md` |
| 이미지 편집 기능 | `image/overview.md` |
| 비디오·GIF 처리 | `video/overview.md` |
| 단축키 추가·충돌 | `shortcuts/overview.md` |
| 카테고리·즐겨찾기 수정 | `categories/overview.md` |
| 테마·색상 수정 | `theming/overview.md` |
| 언어팩·다국어 누락 점검 | `i18n/overview.md` |
| Rust 명령 추가·수정 | `rust/overview.md` → `rust/commands.md` |
| FFmpeg·Ghostscript·FontTools | `tools/overview.md` |
| 마크다운 편집기 수정 | `special/markdown-editor.md` |
| 스프라이트 시트·맵메이커 | `special/sprite-sheet.md` |
| 드로잉 캔버스 수정 | `special/drawing.md` |
| 빌드·릴리스 절차 | `infra/release.md` |
| 빌드 설정·설정 파일 | `infra/overview.md` |
| 테스트 추가·실행 | `infra/testing.md` |
| Tauri command 호출 계층 | `rust/overview.md` → `utils/tauriCommands.ts` |
| localStorage 키·persist | `utils/storage.ts` (`storageKeys`) |

---

## 카테고리별 파일 목록

### explorer/
| 파일 | 내용 |
|------|------|
| `overview.md` | 파일 탐색기 전체 구조·컴포넌트·훅 맵 |
| `FileExplorer.md` | index.tsx — orchestration·분리 훅·tauriCommands |
| `archives.md` | 압축 가상 경로·분할 패널·중첩 압축·꺼내기 |
| `FileCard.md` | FileCard.tsx — 썸네일·인라인 이름변경 |
| `tabs.md` | useTabManagement — 탭 CRUD·이벤트 동기화 |
| `column-view.md` | useColumnView + ColumnView.tsx |
| `context-menu.md` | 우클릭 메뉴 레지스트리 패턴 |
| `search.md` | useSearchFilter + GlobalSearchModal |
| `duplicate-finder.md` | 중복 파일 찾기 (재귀 스캔·해시·썸네일) |

### operations/
| 파일 | 내용 |
|------|------|
| `overview.md` | 파일 조작 전체 흐름·서브훅·Rust 명령 매핑 |
| `useFileOperations.md` | facade + 서브훅 (삭제·압축·용량·선택·라우팅) |
| `useClipboard.md` | 복사·붙여넣기·OS 클립보드 |
| `undo.md` | 실행취소 스택·새 액션 추가 방법 |
| `drag-drop.md` | 내부 DnD·OS 드래그 내보내기 |

### preview/
| 파일 | 내용 |
|------|------|
| `overview.md` | 미리보기 시스템 전체 흐름 |
| `thumbnails.md` | 썸네일 캐시(메모리·디스크)·invokeQueue |
| `modals.md` | lazy 모달·PreviewModals 라우터·codePreview/ |

### image/
| 파일 | 내용 |
|------|------|
| `overview.md` | 이미지 편집 기능·Rust 명령 매핑 |

### video/
| 파일 | 내용 |
|------|------|
| `overview.md` | 비디오·GIF 처리·FFmpeg 명령 매핑 |

### shortcuts/
| 파일 | 내용 |
|------|------|
| `overview.md` | 전체 단축키 목록·충돌 방지 규칙 |

### categories/
| 파일 | 내용 |
|------|------|
| `overview.md` | useCategoryManagement — CRUD·DnD·persist |

### theming/
| 파일 | 내용 |
|------|------|
| `overview.md` | useThemeManagement — ThemeVars·프리셋·색상 조정 |

### i18n/
| 파일 | 내용 |
|------|------|
| `overview.md` | 언어팩 구조·OS Locale 기본값·누락 방지 체크리스트 |

### rust/
| 파일 | 내용 |
|------|------|
| `overview.md` | 모듈 구조(facade+submodule)·tauriCommands·helpers.rs |
| `commands.md` | 전체 Tauri 명령 레퍼런스 |

### tools/
| 파일 | 내용 |
|------|------|
| `overview.md` | FFmpeg·Ghostscript·FontTools 통합·설치 흐름 |

### special/
| 파일 | 내용 |
|------|------|
| `overview.md` | 특수 기능 목록 개요 |
| `markdown-editor.md` | TipTap 편집기·자동저장·단축키 격리 |
| `sprite-sheet.md` | 스프라이트 시트 패킹·언패킹·맵메이커 |
| `drawing.md` | DrawingCanvas — 도구·Stroke·주석 저장 |
| `diff-viewer.md` | 텍스트/코드 파일 2개 Diff 비교 |

### infra/
| 파일 | 내용 |
|------|------|
| `overview.md` | 설정 파일·빌드 산출물·tsconfig 주의 |
| `testing.md` | Node/Vitest/Rust 테스트 체계·실행 명령 |
| `release.md` | 릴리스 자동화 절차·태그 규칙 |

---

## 주요 파일 좌표 (코드 직접 참조)

### 앱 레이어

| 역할 | 경로 |
|------|------|
| 앱 오케스트레이터 | `App.tsx` — 분할뷰·전역 상태·FileExplorer 마운트 |
| 사이드바 UI | `components/AppSidebar.tsx` — 접힘 레일·카테고리 DnD |
| 앱 레벨 모달·토스트 | `components/AppModals.tsx` — 테마/언어/도움말·TaskQueuePanel |

### FileExplorer 오케스트레이션

| 역할 | 경로 |
|------|------|
| 탐색기 메인 컨트롤러 | `components/FileExplorer/index.tsx` |
| 레이아웃·인라인 필터 | `components/FileExplorer/ExplorerLayout.tsx` |
| TabBar·NavigationBar·그리드 | `components/FileExplorer/ExplorerContent.tsx` |
| 컨텍스트 메뉴·확인 다이얼로그 | `components/FileExplorer/ExplorerModalBridge.tsx` |
| lazy 모달 일괄 마운트 | `components/FileExplorer/FileExplorerModalLayer.tsx` |
| 그리드/리스트 행 렌더링 | `components/FileExplorer/fileGrid/FileGridRows.tsx` |

### FileExplorer 훅

| 역할 | 경로 |
|------|------|
| 파일 조작 facade | `components/FileExplorer/hooks/useFileOperations.ts` |
| 삭제·영구삭제 | `hooks/useDeleteOperations.ts` |
| ZIP 압축/해제 | `hooks/useArchiveOperations.ts` |
| 폴더 용량 분석 | `hooks/useFolderSizeOperations.ts` |
| 폴더 로드·캐시·prefetch | `hooks/useDirectoryLoader.ts` |
| 클릭/Shift/Ctrl 선택 | `hooks/useExplorerSelection.ts` |
| 더블클릭→미리보기 라우팅 | `hooks/usePreviewRouting.ts` |
| 키보드 단축키 | `hooks/useKeyboardShortcuts.ts` |
| 탭 관리 | `hooks/useTabManagement.ts` |
| 실행취소 스택 | `hooks/useUndoStack.ts` |
| 클립보드 | `hooks/useClipboard.ts` |
| 컨텍스트 메뉴 빌더 | `hooks/useContextMenuBuilder.tsx` |
| 썸네일 캐시 | `hooks/thumbnailCache.ts` |
| invoke 큐 (re-export) | `hooks/invokeQueue.ts` → `utils/tauriInvoke.ts` |

### Tauri 호출·저장 계층

| 역할 | 경로 |
|------|------|
| typed command API | `utils/tauriCommands.ts` |
| command 도메인 | `utils/tauriCommandDomains/{file,media,preview,system}Commands.ts` |
| invoke 큐·우선순위 | `utils/tauriInvoke.ts` |
| command 래퍼 | `utils/tauriCommandRunner.ts` |
| localStorage 키·헬퍼 | `utils/storage.ts` (`storageKeys`) |

### 기타 프론트

| 역할 | 경로 |
|------|------|
| 파일 전송 작업 큐 | `stores/taskQueueStore.ts` · `components/TaskQueuePanel.tsx` |
| 카테고리 관리 | `hooks/useCategoryManagement.ts` |
| 테마 관리 | `hooks/useThemeManagement.ts` |
| OS 드래그앤드롭 | `hooks/useTauriDragDrop.ts` |
| 자동 업데이트 | `hooks/useAutoUpdate.ts` |
| 다국어·언어팩 | `utils/i18n.ts` · `utils/i18n/packs/{ko,en}/*` |
| 언어 설정 모달 | `components/LanguageSettingsModal.tsx` |
| 전역 타입 | `types.ts` |
| 경로 유틸 | `utils/pathUtils.ts` |
| 줄 diff | `utils/lineDiff.ts` |
| 텍스트 비교 가능 판별 | `utils/isComparableTextFile.ts` |

### Rust 백엔드

| 역할 | 경로 |
|------|------|
| Rust 명령 등록 | `src-tauri/src/lib.rs` |
| Rust 공통 헬퍼 | `src-tauri/src/helpers.rs` |
| 파일 CRUD facade | `src-tauri/src/modules/file_ops.rs` → `file_ops/{listing,mutation,archive,cache,transfer}/` |
| 압축 탐색 facade | `src-tauri/src/modules/archive_ops.rs` → `archive_ops/{listing,extract,materialize,path,records}.rs` |
| 이미지 처리 facade | `src-tauri/src/modules/image_ops.rs` → `image_ops/*.rs` |
| 미디어 처리 facade | `src-tauri/src/modules/media_ops.rs` → `media_ops/{gif,thumbnail,video}.rs` |
| command boundary 테스트 | `src-tauri/tests/command_boundary.rs` |

### 테스트

| 역할 | 경로 |
|------|------|
| Node 단위 테스트 | `tests/*.ts` |
| Vitest UI 테스트 | `tests/ui/**/*.test.{ts,tsx}` |
| Vitest 설정 | `vitest.config.ts` |
