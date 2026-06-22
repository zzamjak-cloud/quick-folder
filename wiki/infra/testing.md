# 테스트 체계

develop 브랜치 리팩토링(v1.27.43 이후)에서 Node 단위 테스트, Vitest UI 테스트, Rust command boundary 테스트가 도입됐다.

## 실행 명령

```bash
npm run test          # Node + UI 전체
npm run test:node     # Node 내장 test runner (tests/*.ts)
npm run test:ui       # Vitest + jsdom (tests/ui/**)
cargo test            # Rust (src-tauri/tests/command_boundary.rs 포함)
```

## 설정 파일

| 파일 | 역할 |
|------|------|
| `vitest.config.ts` | Vitest 설정·alias·jsdom 환경 |
| `package.json` | `test` / `test:node` / `test:ui` 스크립트 |
| `tests/ui/setup.ts` | Vitest 공통 setup |

## Node 단위 테스트 (`tests/*.ts`)

| 파일 | 검증 대상 |
|------|----------|
| `storage.test.ts` | `utils/storage.ts` read/write/JSON 헬퍼 |
| `tauriInvoke.test.ts` | `utils/tauriInvoke.ts` 큐·우선순위·취소 |
| `i18n.test.ts` | 언어팩 키·legacy 매핑 |
| `lineDiff.test.ts` | `utils/lineDiff.ts` diff 알고리즘 |
| `naturalCompare.test.ts` | `utils/naturalCompare.ts` |
| `keyboardShortcuts.test.ts` | `utils/keyboardShortcuts.ts` |
| `archiveNavigation.test.ts` | 압축 가상 경로 내비게이션 |

## UI 테스트 (`tests/ui/**`)

| 파일 | 검증 대상 |
|------|----------|
| `useExplorerSelection.test.tsx` | Shift/Ctrl 다중 선택 |
| `usePreviewRouting.test.tsx` | 더블클릭→미리보기/압축 라우팅 |
| `useContextMenuBuilder.test.tsx` | 우클릭 메뉴 구성 |
| `InlineFuzzyFilterInput.test.tsx` | 인라인 퍼지 필터 입력 |

## Rust command boundary (`src-tauri/tests/command_boundary.rs`)

Tauri 명령 등록·핸들러 경계를 통합 테스트한다. `file_ops`, `archive_ops`, `image_ops`, `media_ops` facade가 올바르게 노출되는지 검증한다.

## 새 기능 추가 시

1. **순수 유틸** → `tests/{name}.test.ts` (Node runner)
2. **React 훅·컴포넌트** → `tests/ui/{name}.test.tsx` (Vitest)
3. **새 Rust 명령** → `command_boundary.rs`에 등록 여부·기본 응답 추가

## 관련 위키

- [overview.md](overview.md) — 빌드·설정
- [../rust/overview.md](../rust/overview.md) — Rust 모듈 구조
