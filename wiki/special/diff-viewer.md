# Diff Viewer (텍스트 파일 비교)

## 역할
텍스트·코드 파일 **2개**를 선택해 줄 단위로 나란히 비교한다.  
Git 없이 설정 파일·백업 스크립트의 변경점을 빠르게 확인할 때 사용한다.

## 진입
- **비교 가능한 파일 2개 선택** → 우클릭 → `비교하기`
- **비교 가능한 파일 2개 선택** → `Space`
- 컨텍스트 메뉴 섹션: `open` (`useContextMenuBuilder.tsx`)
- 선택 순서: `paths[0]` = 왼쪽, `paths[1]` = 오른쪽

## 위치
| 구분 | 경로 |
|------|------|
| UI | `components/FileExplorer/DiffViewerModal.tsx` |
| 모달 state | `useModalStates` → `diffViewerPaths: [string, string] \| null` |
| 줄 diff | `utils/lineDiff.ts` |
| 비교 가능 판별 | `utils/isComparableTextFile.ts` |
| 파일 읽기 | `utils/readTextFileWithTimeout.ts` (4초 타임아웃) |

## 비교 가능 파일 (`isComparableTextFile`)
- 일반 텍스트·코드 확장자: `.txt`, `.json`, `.md`, `.yaml`, `.toml`, `.env`, `.ts`, `.rs`, `.py` 등
- 확장자 없는 알려진 파일: `Makefile`, `.gitignore`, `Dockerfile`, `LICENSE` 등
- **폴더·바이너리**는 메뉴에 표시되지 않음

## UI
- 전체 화면 2열 패널, **단일 스크롤**로 줄 정렬 유지
- 줄 번호 gutter + monospace 본문
- 하이라이트:
  - **적색 (왼쪽)**: 삭제·변경 전
  - **녹색 (오른쪽)**: 추가·변경 후
- 헤더: 파일명, 변경·삭제·추가 줄 수 요약
- **Escape** 닫기

## diff 알고리즘 (`lineDiff.ts`)
```
LCS(최장 공통 부분 수열) 기반 edit script
  → 연속 del/ins를 remove / add / change 행으로 정렬
  → AlignedDiffRow { kind, left, right }
```
- 외부 diff 라이브러리 없음 (프론트엔드만)
- `.md` 양쪽 비교는 markdown 모드로 실행한다.
  - unordered list marker(`*`, `-`, `+`), escaped punctuation, 목록 spacing, formatter용 빈 줄은 비교·표시 양쪽에서 정규화한다.
  - 화면에는 markdown formatter 차이를 제거한 canonical 줄을 표시한다.
  - fenced code block 내부는 exact line 비교를 유지한다.
- 테스트: `tests/lineDiff.test.ts`

## 파일 크기 제한
- `read_text_file` 최대 **1MB** (`1048576` bytes) — `CodePreviewModal`과 동일
- 클라우드 미동기화 파일은 4초 타임아웃 후 에러 표시

## 새 기능 추가 시
- 비교 대상 확장자 변경 → `utils/isComparableTextFile.ts`만 수정
- `Space` 2개 선택 진입은 `useKeyboardShortcuts.ts`에서 `resolveSpaceDiffPaths`를 통해 처리한다.

## 관련 위키
- [context-menu.md](../explorer/context-menu.md)
- [../preview/modals.md](../preview/modals.md)
