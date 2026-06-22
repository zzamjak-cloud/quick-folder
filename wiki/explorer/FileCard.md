# FileCard

## 역할
파일 탐색기의 개별 파일·폴더 카드 컴포넌트. lazy 썸네일 로딩과 인라인 이름변경을 담당한다.

## 위치
`components/FileExplorer/FileCard.tsx`

## 주요 기능
- `IntersectionObserver`로 뷰포트 진입 시 썸네일 요청 (lazy loading)
- 인라인 이름변경: F2 또는 이름 영역 클릭 후 클릭
- 선택 상태 시각화 (테두리, 배경색)
- 파일 타입별 아이콘 폴백 (썸네일 없을 때)
- 네이티브 파일 아이콘: `useNativeIcon(path)`

## 썸네일 로딩 흐름
```
IntersectionObserver 진입
  → thumbnailCache.getThumb(path, size)  ← 메모리 캐시 조회
  → 캐시 미스: queuedInvokeLow('get_file_thumbnail', {path, size})
  → 응답: thumbnailCache.setThumb(path, size, dataUrl)
  → img src 업데이트
```

## 인라인 이름변경
`useRenameInput` 훅에서 상태·핸들러 제공:
- 활성화: `F2` 또는 `renameInput.startRename(path, currentName)`
- 확정: `Enter` 또는 포커스 아웃 → `tauriCommands.renameItem({ oldPath, newName })`
- 취소: `Escape`

## 지원 파일 타입별 썸네일 Rust 명령
| FileType | 명령 |
|----------|------|
| `image` | `get_file_thumbnail` |
| `video` | `get_video_thumbnail` |
| PSD 파일 | `get_psd_thumbnail` |
| 기타 | `get_file_icon` (네이티브 아이콘) |

## 주의사항
- 썸네일은 **`queuedInvokeLow`** 사용 필수 — 일반 `invoke`로 바꾸면 폴더 전환 시 이전 요청이 취소되지 않고 UI가 오염됨.
- 폴더 이동 시 `cancelAllQueued()` 호출로 대기 요청 일괄 취소 (FileExplorer/index.tsx).

## 관련 위키
- [../preview/thumbnails.md](../preview/thumbnails.md)
