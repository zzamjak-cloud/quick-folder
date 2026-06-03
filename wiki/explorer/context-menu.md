# 컨텍스트 메뉴 (우클릭 메뉴)

## 역할
우클릭 메뉴는 데이터 기반 레지스트리 패턴으로 동작한다. `ContextMenu.tsx`는 렌더링만 담당하고, 메뉴 항목 구성은 `useContextMenuBuilder.tsx`에서 한다.

## 위치
- 빌더: `components/FileExplorer/hooks/useContextMenuBuilder.tsx`
- 렌더러: `components/FileExplorer/ContextMenu.tsx`

## 타입
```typescript
interface ContextMenuSection {
  items: ContextMenuItem[]
}
interface ContextMenuItem {
  label: string
  icon?: ReactNode
  action: () => void
  disabled?: boolean
  shortcut?: string
}
```

## ContextMenu.tsx Props (4개)
| Prop | 타입 | 설명 |
|------|------|------|
| `x` | `number` | 메뉴 X 좌표 |
| `y` | `number` | 메뉴 Y 좌표 |
| `sections` | `ContextMenuSection[]` | 섹션 배열 |
| `onClose` | `fn` | 닫기 콜백 |

## 새 메뉴 항목 추가 방법
`useContextMenuBuilder.tsx` 의 해당 섹션 빌더에 항목 1개만 추가.  
`ContextMenu.tsx`는 수정 불필요.

## 주의사항
- `contextMenu` state: `{x, y, paths: string[]}` — 우클릭된 파일들의 경로 목록
- 단일 파일 우클릭과 다중 선택 우클릭 모두 `paths` 배열로 처리
- 메뉴 항목 조건(단일/다중/폴더/파일)은 빌더 내부에서 `paths.length`, `is_dir` 로 분기
