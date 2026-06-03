# 카테고리 & 즐겨찾기

## 역할
폴더 단축키를 카테고리로 분류해 관리한다. CRUD, 순서 변경, localStorage 영속화를 담당한다.

## 위치
`hooks/useCategoryManagement.ts`

## 데이터 타입
```typescript
interface Category {
  id: string
  title: string
  color: string          // Hex 코드
  shortcuts: FolderShortcut[]
  createdAt: number
  isCollapsed?: boolean
}

interface FolderShortcut {
  id: string
  name: string
  path: string
  color?: string         // 텍스트 색상 (선택적)
  createdAt: number
}
```

## 저장소
`localStorage` 키: `quickfolder_widget_data`

## useCategoryManagement exports

### 카테고리 관련
| 이름 | 설명 |
|------|------|
| `categories` | Category 배열 |
| `openAddCategoryModal()` | 카테고리 추가 모달 |
| `openEditCategoryModal(cat)` | 카테고리 수정 모달 |
| `handleSaveCategory()` | 저장 |
| `deleteCategory(id)` | 삭제 |
| `toggleCollapse(id)` | 접기/펼치기 토글 |
| `toggleCollapseAll()` | 전체 접기/펼치기 |

### 폴더 단축키 관련
| 이름 | 설명 |
|------|------|
| `openAddFolderModal(categoryId)` | 단축키 추가 모달 |
| `openEditFolderModal(shortcut)` | 단축키 수정 모달 |
| `handleSaveFolder()` | 저장 |
| `handleAddFolder(path, categoryId?)` | 경로만으로 빠른 추가 |
| `deleteShortcut(categoryId, shortcutId)` | 삭제 |

## UI 컴포넌트
`components/CategoryColumn.tsx` — 카테고리 단일 열  
`components/SortableShortcutItem.tsx` — 드래그 가능한 단축키 항목 (`@dnd-kit` 기반)

## 내부 DnD (@dnd-kit)
- 단축키 → 같은 카테고리 내 순서 변경
- 단축키 → 다른 카테고리로 이동
- `SortableShortcutItem`이 각 단축키를 감쌈

## OS → 카테고리 드롭 (useTauriDragDrop.ts)
→ [../operations/drag-drop.md](../operations/drag-drop.md)

## 파일 탐색기 연동
```typescript
// FileExplorer props
onAddToFavorites(path)           // 기본 카테고리에 추가
onAddToCategory(path, catId)     // 특정 카테고리에 추가
```
우클릭 메뉴 → "즐겨찾기에 추가" 로 트리거.

## 레거시 색상 변환
```typescript
LEGACY_TEXT_CLASS_TO_HEX   // Tailwind 텍스트 클래스 → Hex
LEGACY_BG_CLASS_TO_HEX     // Tailwind 배경 클래스 → Hex
// 로드 시 자동 마이그레이션
```
