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
| 검색 필터 수정 | `explorer/search.md` |
| 복사·이동·삭제·이름변경 | `operations/useFileOperations.md` |
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
| Rust 명령 추가·수정 | `rust/overview.md` → `rust/commands.md` |
| FFmpeg·Ghostscript·FontTools | `tools/overview.md` |
| 마크다운 편집기 수정 | `special/markdown-editor.md` |
| 스프라이트 시트·맵메이커 | `special/sprite-sheet.md` |
| 드로잉 캔버스 수정 | `special/drawing.md` |
| 빌드·릴리스 절차 | `infra/release.md` |
| 빌드 설정·설정 파일 | `infra/overview.md` |

---

## 카테고리별 파일 목록

### explorer/
| 파일 | 내용 |
|------|------|
| `overview.md` | 파일 탐색기 전체 구조·컴포넌트 맵 |
| `FileExplorer.md` | index.tsx — props, state, 핵심 훅 |
| `FileCard.md` | FileCard.tsx — 썸네일·인라인 이름변경 |
| `tabs.md` | useTabManagement — 탭 CRUD·이벤트 동기화 |
| `column-view.md` | useColumnView + ColumnView.tsx |
| `context-menu.md` | 우클릭 메뉴 레지스트리 패턴 |
| `search.md` | useSearchFilter + GlobalSearchModal |

### operations/
| 파일 | 내용 |
|------|------|
| `overview.md` | 파일 조작 전체 흐름·Rust 명령 매핑 |
| `useFileOperations.md` | 삭제·복제·이름변경·그룹화·압축 |
| `useClipboard.md` | 복사·붙여넣기·OS 클립보드 |
| `undo.md` | 실행취소 스택·새 액션 추가 방법 |
| `drag-drop.md` | 내부 DnD·OS 드래그 내보내기 |

### preview/
| 파일 | 내용 |
|------|------|
| `overview.md` | 미리보기 시스템 전체 흐름 |
| `thumbnails.md` | 썸네일 캐시(메모리·디스크)·invokeQueue |
| `modals.md` | 미리보기 모달 전체 목록·트리거 |

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

### rust/
| 파일 | 내용 |
|------|------|
| `overview.md` | 모듈 구조·helpers.rs 함수 |
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

### infra/
| 파일 | 내용 |
|------|------|
| `overview.md` | 설정 파일·빌드 산출물·tsconfig 주의 |
| `release.md` | 릴리스 자동화 절차·태그 규칙 |

---

## 주요 파일 좌표 (코드 직접 참조)

| 역할 | 경로 |
|------|------|
| 앱 루트 컴포넌트 | `App.tsx` |
| 파일 탐색기 메인 | `components/FileExplorer/index.tsx` |
| 파일 조작 훅 | `components/FileExplorer/hooks/useFileOperations.ts` |
| 키보드 단축키 | `components/FileExplorer/hooks/useKeyboardShortcuts.ts` |
| 탭 관리 | `components/FileExplorer/hooks/useTabManagement.ts` |
| 실행취소 스택 | `components/FileExplorer/hooks/useUndoStack.ts` |
| 클립보드 | `components/FileExplorer/hooks/useClipboard.ts` |
| 썸네일 캐시 | `components/FileExplorer/hooks/thumbnailCache.ts` |
| invoke 큐 | `components/FileExplorer/hooks/invokeQueue.ts` |
| 컨텍스트 메뉴 빌더 | `components/FileExplorer/hooks/useContextMenuBuilder.tsx` |
| 카테고리 관리 | `hooks/useCategoryManagement.ts` |
| 테마 관리 | `hooks/useThemeManagement.ts` |
| OS 드래그앤드롭 | `hooks/useTauriDragDrop.ts` |
| 자동 업데이트 | `hooks/useAutoUpdate.ts` |
| 전역 타입 | `types.ts` |
| 경로 유틸 | `utils/pathUtils.ts` |
| Rust 명령 등록 | `src-tauri/src/lib.rs` |
| Rust 공통 헬퍼 | `src-tauri/src/helpers.rs` |
