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

## 구글 드라이브 경로 자가 치유
즐겨찾기 클릭 시 `App.tsx`의 `resolveAvailableDirectory`가 경로 존재를 확인한다.
경로가 없고 구글 드라이브 경로라면 `utils/pathUtils.ts`의
`getGoogleDriveLocalizedVariants`로 언어별 폴더명(`My Drive` ↔ `내 드라이브`,
`Shared drives` ↔ `공유 드라이브` 등)을 치환한 후보를 검사해 복구한다.
- 배경: 드라이브는 재로그인 시 그 시점의 시스템 언어로 마운트 폴더명을 새로 만든다.
  시스템 언어를 바꾼 뒤 재로그인하면 저장된 절대 경로의 해당 세그먼트가 깨진다.
- 복구 성공 시 치환된 세그먼트까지의 접두사를 공유하는 **모든 즐겨찾기 경로를
  일괄 마이그레이션**한다(`migrateShortcutPaths`). 사용자 지정 이름은 유지.
- 새 언어 폴더명을 지원하려면 `GOOGLE_DRIVE_LOCALIZED_FOLDER_GROUPS`에 추가.
- **유니코드 정규화 필수**: macOS 파일시스템은 한글 경로를 NFD(자모 분해형)로 반환하므로,
  세그먼트 비교는 반드시 `normalizeSegmentForCompare`(NFC + 소문자)를 거쳐야 한다.
  NFC 리터럴과 `toLowerCase()`만으로 비교하면 실기기에서 매칭이 전혀 안 된다. (v1.0.7 회귀)
- 테스트: `tests/googleDriveLocalizedVariants.test.ts`

## 레거시 색상 변환
```typescript
LEGACY_TEXT_CLASS_TO_HEX   // Tailwind 텍스트 클래스 → Hex
LEGACY_BG_CLASS_TO_HEX     // Tailwind 배경 클래스 → Hex
// 로드 시 자동 마이그레이션
```
