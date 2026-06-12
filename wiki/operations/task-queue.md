# 파일 작업 큐 (Task Queue Manager)

## 역할
대용량·다수 파일의 **복사/이동** 진행 상황을 브라우저 다운로드 관리자처럼 우측 하단 패널에서 통합 표시한다.

- 파일별 프로그레스 바
- 헤더에 전체 진행 `완료수 / 전체수` (예: `3 / 100`)
- 진행 중 파일 최상단, 완료 파일 최하단 정렬
- **모든 작업이 끝나면 1.5초 후 패널 자동 닫기**

ZIP 해제·압축 등 다른 작업은 이 패널을 쓰지 않는다 (`FileExplorer` 우측 하단 인디케이터 또는 토스트).

## 주요 파일

| 파일 | 설명 |
|------|------|
| `stores/taskQueueStore.ts` | 전역 큐 상태 (`useSyncExternalStore`) |
| `components/TaskQueuePanel.tsx` | 패널 UI (`App.tsx`에 마운트) |
| `components/FileExplorer/hooks/runTransferWithProgress.ts` | Rust 명령 호출 + 스토어 연동 |
| `src-tauri/src/modules/file_ops.rs` | `transfer_items_with_progress` |

## Rust 명령

### `transfer_items_with_progress`

| 파라미터 | 설명 |
|----------|------|
| `operation` | `"copy"` \| `"move"` |
| `sources` | 소스 경로 배열 |
| `dest` | 대상 폴더 |
| `overwrite` | 중복 덮어쓰기 |
| `onProgress` | `Channel<TransferQueueProgress>` |

`spawn_blocking`에서 백그라운드 실행. Channel로 단계별 이벤트 전송:

| `phase` | 의미 |
|---------|------|
| `scanning` | 파일 목록 수집 중 |
| `transferring` | 전송 중 (`files` 초기 목록 또는 `activeId` 갱신) |
| `done` | 작업 완료 |

### `TransferQueueProgress` (camelCase)

```typescript
{
  phase: string
  operation: 'copy' | 'move'
  doneFiles: number
  totalFiles: number
  currentName: string
  percent: number
  activeId?: number | null
  files?: TransferFileItem[] | null  // 최초 1회 전체 목록
}
```

이동 시 같은 볼륨이면 항목 단위 `rename`(원자적), 다른 볼륨이면 파일 단위 copy 후 소스 루트 삭제.

## 프론트 연동 경로

다음 경로는 `runTransferWithProgress`를 사용한다 (기존 `copy_items` / `move_items` 직접 호출 대신).

| 경로 | 파일 |
|------|------|
| Ctrl+V 붙여넣기 | `useClipboard.ts` |
| OS 파일 드롭 | `FileExplorer/index.tsx` (Tauri `onDragDropEvent`) |
| 내부 드래그앤드롭 | `useInternalDragDrop.ts` |

## 스토어 API

| 함수 | 설명 |
|------|------|
| `useTaskQueue()` | `{ jobs, panelExpanded, panelVisible }` 구독 |
| `startTransferJob(op, label)` | 작업 시작, job id 반환 |
| `applyTransferProgress(jobId, msg)` | Channel 메시지 반영 |
| `failTransferJob(jobId, error)` | 실패 처리 |
| `dismissTaskQueuePanel()` | 진행 중이면 접기만, 아니면 닫고 목록 비움 |
| `hasActiveTransferJobs()` | `scanning` \| `running` 작업 존재 여부 |

### `useSyncExternalStore` 주의

`getSnapshot`은 **동일 상태에서 항상 같은 객체 참조**를 반환해야 한다. `cachedSnapshot`을 `emit()` 시에만 갱신한다. 매 호출마다 새 객체를 만들면 무한 리렌더가 난다.

### 자동 닫기

`TaskQueuePanel`의 `useEffect`가 `jobs`를 감시한다.

1. `panelVisible && jobs.length > 0`
2. `hasActiveTransferJobs() === false` (모든 job이 `completed` 또는 `failed`)
3. `TASK_QUEUE_AUTO_DISMISS_MS`(1500ms) 후 `dismissTaskQueuePanel()` 호출

새 작업이 시작되면 타이머는 `useEffect` cleanup으로 취소된다.

## UI 정렬

`sortTransferFiles`: **active → pending → failed → completed** 순. 완료 항목은 리스트 최하단.

## 새 복사/이동 경로 추가 시

1. `runTransferWithProgress(operation, sources, dest, overwrite, label)` 호출
2. 완료 후 `loadDirectory` + `qf-files-changed` 이벤트 (기존 패턴 유지)
3. ghost 항목(`setPendingCopyPaths`)이 필요하면 붙여넣기/드롭 흐름 참고

## 관련 위키

- [overview.md](overview.md) — Rust 명령 매핑
- [useClipboard.md](useClipboard.md) — 붙여넣기
- [drag-drop.md](drag-drop.md) — 드래그앤드롭
