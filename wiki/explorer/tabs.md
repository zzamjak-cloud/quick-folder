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
  label: string
  pinned: boolean
}
```

## 주요 exports
| 이름 | 설명 |
|------|------|
| `tabs` | Tab 배열 |
| `activeTabId` | 현재 탭 ID |
| `addTab(path?)` | 탭 추가 |
| `closeTab(id)` | 탭 닫기 |
| `closeOtherTabs(id)` | 다른 탭 모두 닫기 |
| `duplicateTab(id)` | 탭 복제 |
| `pinTab(id)` | 탭 핀 |
| `setActiveTab(id)` | 탭 활성화 |
| `navigateTo(path)` | 현재 탭 경로 변경 (히스토리 추가) |
| `navigateBack()` | 뒤로 가기 |
| `navigateForward()` | 앞으로 가기 |

## 파일 조작 이벤트 연동 (CustomEvent)
탭 간 상태 동기화를 위해 CustomEvent 사용:

| 이벤트명 | 발생 시점 | 동작 |
|---------|---------|------|
| `qf-tab-rename` | 폴더 이름 변경 | 해당 경로 탭의 path·label·history 갱신 |
| `qf-tab-delete` | 폴더 삭제 | 해당 경로 탭 자동 제거 |
| `qf-files-changed` | 파일 변경 | 다른 패널 새로고침 |

## 단축키
| 단축키 | 기능 |
|--------|------|
| `Ctrl+T` | 현재 탭 복제 |
| `Ctrl+W` | 현재 탭 닫기 |
| `Ctrl+Alt+W` | 다른 탭 모두 닫기 |
| `Tab` | 다음 탭 |
| `Shift+Tab` | 이전 탭 |

## 관련 위키
- [FileExplorer.md](FileExplorer.md)
