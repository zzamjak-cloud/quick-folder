# 탭 관리

## 역할
파일 탐색기 탭의 CRUD, 내비게이션 히스토리, 파일 조작 이벤트와의 탭 동기화를 담당한다.

## 위치
`components/FileExplorer/hooks/useTabManagement.ts`

## Tab 타입
```typescript
interface Tab {
  id: string
  path: string
  history: string[]
  historyIndex: number
  title: string
  pinned?: boolean
}
```

## 주요 exports
| 이름 | 설명 |
|------|------|
| `tabs` | Tab 배열 |
| `activeTabId` | 현재 탭 ID |
| `openTab(path)` | 탭 추가 |
| `handleTabClose(id)` | 탭 닫기 |
| `closeOtherTabs()` | 다른 탭 모두 닫기 |
| `duplicateTab()` | 현재 탭 복제 |
| `togglePinTab(id)` | 탭 고정/해제 |
| `handleTabSelect(id)` | 탭 활성화 |
| `navigateTo(path)` | 현재 탭 경로 변경 (히스토리 추가) |
| `goBack()` | 뒤로 가기 |
| `goForward()` | 앞으로 가기 |

## 파일 조작 이벤트 연동 (CustomEvent)
탭 간 상태 동기화를 위해 CustomEvent 사용:

| 이벤트명 | 발생 시점 | 동작 |
|---------|---------|------|
| `qf-tab-rename` | 폴더 이름 변경 | 해당 경로 탭의 path·title·history 갱신. 활성 탭이면 새 경로를 즉시 로드 |
| `qf-tab-delete` | 폴더 삭제 | 해당 경로 탭 자동 제거. 활성 탭이면 인접 탭으로 이동하고, 패널 마지막 탭이면 분할 해제 |
| `qf-files-changed` | 파일 변경 | 다른 패널 새로고침 |

## 단축키
| 단축키 | 기능 |
|--------|------|
| `Ctrl+T` | 현재 탭 복제 |
| `Ctrl+W` | 현재 탭 닫기. 분할 화면에서는 마지막 탭도 닫을 수 있고 닫으면 분할 해제 |
| `Ctrl+Alt+W` | 다른 탭 모두 닫기 |
| `Tab` | 다음 탭 |
| `Shift+Tab` | 이전 탭 |

## 관련 위키
- [FileExplorer.md](FileExplorer.md)
