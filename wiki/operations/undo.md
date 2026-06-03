# 실행취소 (Ctrl+Z)

## 역할
파일 조작 후 역방향 복원 정보를 스택에 쌓아 Ctrl+Z로 되돌린다.

## 위치
`components/FileExplorer/hooks/useUndoStack.ts`

## UndoAction 타입 (types.ts)
```typescript
type UndoAction =
  | { type: 'delete';     paths: string[] }
  | { type: 'rename';     oldPath: string; newPath: string }
  | { type: 'move_group'; movedPaths: string[]; originalDir: string }
  | { type: 'create_file'; path: string }
```

## useUndoStack exports
| 이름 | 설명 |
|------|------|
| `push(action)` | 스택에 액션 추가 |
| `pop()` | 최상위 액션 꺼내기 |
| `canUndo` | 스택이 비어 있지 않은지 여부 |

## handleUndo 복원 로직 (FileExplorer/index.tsx)
| 액션 타입 | 복원 방법 |
|---------|----------|
| `delete` | `restore_trash_items(paths)` |
| `rename` | `rename_item(newPath, oldName)` |
| `move_group` | `move_items(movedPaths, originalDir)` |
| `create_file` | `delete_items([path])` |

복원 후 반드시 `loadDirectory(currentPath)` 호출.

## 새 파일 조작에 Undo 추가하는 방법
1. `types.ts`의 `UndoAction` union에 variant 추가
2. 조작 성공 직후 `undoStack.push({ type: '...', ... })` 호출
3. `FileExplorer/index.tsx`의 `handleUndo` switch 문에 케이스 추가
4. 복원 후 `loadDirectory(currentPath)` 호출

## 주의사항
- **실행취소는 모든 파일 조작의 필수 요건이다.** 새 기능 추가 시 반드시 구현.
- 복원 Rust 명령이 실패해도 UX를 위해 `loadDirectory`는 항상 호출.
