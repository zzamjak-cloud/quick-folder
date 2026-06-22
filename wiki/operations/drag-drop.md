# 드래그 앤 드롭

## 종류
1. **내부 DnD** — 탐색기 내 파일 이동, OS로 파일 내보내기
2. **OS → 즐겨찾기** — 외부 폴더를 즐겨찾기 패널에 드롭

---

## 내부 DnD (useInternalDragDrop.ts)

### 위치
`components/FileExplorer/hooks/useInternalDragDrop.ts`

### 기능
- 파일 카드 드래그 → 폴더/패널에 드롭 → `move_items` 또는 `copy_items` 호출
- 파일 카드 드래그 → 즐겨찾기 패널에 드롭 → 즐겨찾기 등록
- 압축 내부 파일 드래그 → `materialize_archive_paths`로 임시 실파일 생성 후 copy
- 커스텀 드래그 고스트: 캔버스 기반 썸네일 합성 (`fileUtils.tsx::DRAG_IMAGE`)

### OS로 파일 드래그 내보내기
- 일반 파일은 기존 경로 그대로 `tauri-plugin-drag`에 넘긴다.
- 압축 내부 경로가 섞여 있으면 먼저 `materialize_archive_paths`를 호출한다.
- 백엔드는 앱 캐시에 실파일을 만들고, 그 경로로 OS drag를 시작한다.
- 압축 내부 원본은 이동이 아니라 **항상 copy**다.
- 압축 내부 경로는 드롭 타겟으로는 허용하지 않는다.
- materialize 또는 OS drag 시작이 실패하면 `onError`를 통해 `FileExplorer` 오류 상태에 반영한다.

### 탐색기 내부 폴더 드롭
- 일반 파일 → 같은 볼륨이면 `move_items`, 볼륨이 다르면 `copy_items`
- 압축 내부 파일 → 먼저 `materialize_archive_paths`, 이후 항상 `copy_items`
- 중복 파일은 `check_duplicate_items`로 먼저 감지하고 상위 confirm 흐름에 위임

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

## 테스트

| 파일 | 검증 대상 |
|------|----------|
| `tests/ui/useTauriDragDrop.test.tsx` | `onDragDropEvent` over/drop/leave, `is_directory` 필터링, 카테고리 하이라이트, unlisten |
| `tests/tauriInvoke.test.ts` | `plugin:drag|start_drag` direct command 경계 |

## 관련 위키
- [../categories/overview.md](../categories/overview.md)
- [../explorer/archives.md](../explorer/archives.md)
