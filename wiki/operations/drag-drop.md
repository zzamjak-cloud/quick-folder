# 드래그 앤 드롭

## 종류
1. **내부 DnD** — 탐색기 내 파일 이동, OS로 파일 내보내기
2. **OS → 즐겨찾기** — 외부 폴더를 즐겨찾기 패널에 드롭

---

## 내부 DnD (useInternalDragDrop.ts)

### 위치
`components/FileExplorer/hooks/useInternalDragDrop.ts`

### 기능
- 파일 카드 드래그 → 폴더에 드롭 → `move_items` 호출
- 파일 카드 드래그 → 즐겨찾기 패널에 드롭 → 즐겨찾기 등록
- 커스텀 드래그 고스트: 캔버스 기반 썸네일 합성 (`fileUtils.tsx::DRAG_IMAGE`)

### OS로 파일 드래그 내보내기
```typescript
// tauri-plugin-drag 사용
// 드래그 시작 시 OS 드래그 이벤트로 전환
// 다른 앱(Finder, 탐색기 등)에 파일 드롭 가능
```

---

## OS → 즐겨찾기 DnD (useTauriDragDrop.ts)

### 위치
`hooks/useTauriDragDrop.ts`

### 흐름
```
OS 파일 탐색기에서 폴더 드래그
  → onDragDropEvent() 전역 리스너
  → is_directory(path) 확인 (폴더만 허용)
  → findCategoryAtPosition(position)
      : data-category-id 속성 + 바운딩 렉트로 카테고리 DOM 감지
  → handleAddFolder(path, categoryId)
```

### 내부 함수
| 함수명 | 설명 |
|--------|------|
| `findCategoryAtPosition(pos)` | 드롭 좌표 → 카테고리 DOM 탐색 |
| `applyCategoryDragHighlight(el)` | 드래그 오버 시 하이라이트 |
| `clearCategoryDragHighlight()` | 하이라이트 해제 |

## 관련 위키
- [../categories/overview.md](../categories/overview.md)
