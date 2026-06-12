# 컨텍스트 메뉴 (우클릭 메뉴)

## 역할
우클릭 메뉴는 데이터 기반 레지스트리 패턴으로 동작한다. `ContextMenu.tsx`는 렌더링만 담당하고, 메뉴 항목 구성은 `useContextMenuBuilder.tsx`에서 한다.

## 위치
- 빌더: `components/FileExplorer/hooks/useContextMenuBuilder.tsx`
- 렌더러: `components/FileExplorer/ContextMenu.tsx`
- 터미널 프리셋 모달: `components/FileExplorer/TerminalPresetModal.tsx`
- 터미널 프리셋 저장 헬퍼: `components/FileExplorer/terminalPresets.ts`

## 타입
```typescript
interface ContextMenuSection {
  id: string
  items: ContextMenuItem[]
}
interface ContextMenuItem {
  id: string
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  shortcut?: string
  submenu?: ContextMenuItem[]
  labelColor?: string
  align?: 'left' | 'right'
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

## 터미널 하위 메뉴
- 폴더 단일 선택 시 `open` 섹션에 `터미널에서 열기` 하위 메뉴를 표시한다.
- 하위 메뉴 순서는 항상 `프로젝트 경로 열기` → 저장된 명령어 프리셋들 → `+ 명령어 추가` 순서다.
- `+ 명령어 추가`는 항상 마지막에 위치하고, 이 항목만 `align: 'right'`로 오른쪽 정렬한다.
- `프로젝트 경로 열기`는 `open_terminal` Rust 명령을 호출한다.
- `+ 명령어 추가`는 `TerminalPresetModal`을 열고, 폴더 경로별 명령어 프리셋을 `localStorage`에 저장한다.
- 저장된 프리셋은 같은 하위 메뉴에 동적으로 추가되고, 실행 시 확인창을 거쳐 `run_terminal_command` Rust 명령을 사용한다.
- 위험 가능 명령(`rm -rf`, `Remove-Item -Recurse`, `git reset --hard`, `git clean -f` 등)은 `terminalPresets.ts`에서 감지하고 메뉴 라벨을 노란색으로 표시한다.

## 메뉴 폭과 텍스트 처리
- 주 메뉴와 하위 메뉴 모두 텍스트 길이에 맞춰 `width: max-content`로 늘어난다.
- 최소 폭은 180px, 최대 폭은 360px 기준이다.
- 최대 폭을 넘는 텍스트는 줄바꿈하지 않고 `...` 말줄임으로 표시한다.
- 아이콘, 단축키, 서브메뉴 화살표는 줄어들지 않게 고정하고 라벨 영역만 말줄임 처리한다.
- 긴 메뉴 라벨은 `title` 속성으로 전체 텍스트를 확인할 수 있게 한다.

## 주의사항
- `contextMenu` state: `{x, y, paths: string[]}` — 우클릭된 파일들의 경로 목록
- 단일 파일 우클릭과 다중 선택 우클릭 모두 `paths` 배열로 처리
- 메뉴 항목 조건(단일/다중/폴더/파일)은 빌더 내부에서 `paths.length`, `is_dir` 로 분기
- 프리셋 하위 메뉴를 구성할 때는 `getTerminalPresets(path)`를 통해 현재 폴더 경로의 저장 명령을 읽는다.
