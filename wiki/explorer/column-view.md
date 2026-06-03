# 컬럼 뷰

## 역할
Finder 스타일의 멀티 컬럼 탐색 뷰. 폴더 클릭 시 오른쪽에 새 컬럼을 추가하고, 파일 클릭 시 미리보기 패널을 표시한다.

## 위치
- 상태 관리: `components/FileExplorer/hooks/useColumnView.ts`
- 컨테이너: `components/FileExplorer/ColumnView.tsx`
- 컬럼 패널: `components/FileExplorer/ColumnPanel.tsx`
- 미리보기: `components/FileExplorer/ColumnPreviewPanel.tsx`

## useColumnView 주요 exports
| 이름 | 설명 |
|------|------|
| `columnStack` | 현재 열린 컬럼 경로 배열 |
| `dirCache` | 디렉토리 캐시 Map (path → FileEntry[]) |
| `previewEntry` | 현재 미리보기 FileEntry |
| `pushColumn(path)` | 오른쪽에 새 컬럼 추가 |
| `popToIndex(index)` | 특정 인덱스 이후 컬럼 제거 |
| `setPreviewEntry(entry)` | 미리보기 파일 설정 |

## 활성화
ViewMode가 `'columns'`일 때 렌더링됨. 단축키: `Ctrl+2`

## 관련 위키
- [FileExplorer.md](FileExplorer.md)
- [../preview/modals.md](../preview/modals.md)
