# MCP 서버 · 배치 CLI

AI 에이전트가 QuickFolder 기능을 쓰도록 노출하는 두 진입점. 둘 다 `quickfolder-core`를
직접 링크하며 GUI 앱과 무관하게 동작한다.

| 산출물 | 크레이트 | 용도 |
|--------|---------|------|
| `qf` | `crates/quickfolder-cli` | 사람·CI용 배치 CLI |
| `qf-mcp` | `crates/quickfolder-mcp` | MCP stdio 서버 (rmcp 3.x) |

구조 배경은 [../rust/overview.md](../rust/overview.md) 의 "Cargo 워크스페이스" 참고.

## 왜 별도 프로세스인가

GUI 프로세스 안에서 배치를 돌리면 UI 보호용 동시성 제한을 그대로 상속한다.

| 제한 | 값 | 적용 대상 |
|------|-----|----------|
| `MAX_HEAVY_OPS` (`constants.rs`) | 3 | 썸네일 디코딩 등 `HeavyOpPermit`을 잡는 경로 |
| 프론트 큐 `MAX_CONCURRENT` (`utils/tauriInvoke.ts`) | 6 | 모든 IPC 명령 |

별도 프로세스는 지킬 UI가 없으므로 시작 시 `set_heavy_op_limit(코어 수)`로 연다.

실측(512x512 PNG 120장, 10코어 / `cargo run --release -p quickfolder-core --example bench_pixelate`):

| 기준 동시성 | 10 대비 | 해당 경로 |
|---|---|---|
| 3 | 2.61x | 썸네일 계열 |
| 6 | 1.28x | pixelate·resize·compress (퍼밋 없음) |

속도 이득은 경로에 따라 다르다. 별도 프로세스의 실질적 가치는 **GUI 없이 동작**하고
**MCP 서버가 Tauri 툴체인에 묶이지 않는다**는 쪽이 더 크다.

## MCP 서버 설정

```bash
cargo build --release -p quickfolder-mcp     # target/release/qf-mcp
claude mcp add quickfolder \
  --env QF_MCP_ROOTS="$HOME/Pictures:$HOME/Downloads" \
  -- /path/to/target/release/qf-mcp
```

`QF_MCP_ROOTS`가 **비어 있으면 모든 경로 접근이 거부된다.** 명시적 옵트인이 기본값이다.

### 도구 8개

| 도구 | 성격 | 비고 |
|------|------|------|
| `qf_info` | 조회 | 허용 루트, 캐시 경로, 동시성, ffmpeg 가용 여부 |
| `qf_list_directory` | 조회 | 압축 파일 내부 가상 경로 지원 |
| `qf_search_files` | 조회 | macOS는 Spotlight 우선 |
| `qf_find_duplicates` | 조회 | 크기 → xxh3 해시 2단계 |
| `qf_image_batch` | 생성 | pixelate/resize/compress/crop/to_ico/to_icns/remove_white_bg |
| `qf_archive` | 생성 | compress / extract |
| `qf_file_ops` | **파괴적** | move/copy/rename/mkdir — `confirm: true` 필요 |
| `qf_delete` | **파괴적** | 휴지통 경유만 — `confirm: true` 필요 |

### 안전장치

- **경로 allowlist**: `QF_MCP_ROOTS` 밖은 거부. 심볼릭 링크와 `..`을 해소한 뒤 검사하므로
  `root/../etc` 같은 우회가 막힌다 (`crates/quickfolder-mcp/src/roots.rs`).
- **confirm 게이트**: 파괴적 도구는 `confirm: true` 없이 호출하면 실행하지 않고
  대상 목록만 담은 계획(`executed: false`)을 돌려준다.
- **영구 삭제 미노출**: `qf_delete`는 `use_trash=true` 고정.
  **GUI의 Ctrl+Z 실행취소 스택은 이 경로에 없다**(`hooks/useUndoStack.ts`는 프론트엔드 전용).
  복구 수단이 휴지통뿐이므로 영구 삭제는 도구로 제공하지 않는다.

## CLI

```bash
qf image pixelate ~/Pictures --pixel-size 8 --max-colors 32 -r
qf --json duplicates ~/Downloads
qf --dry-run image compress ~/Pictures --quality high
qf info
```

공통 옵션: `-j/--jobs`(0=코어 수) `-r/--recursive` `--json` `--dry-run` `-q/--quiet`

- 진행률은 **stderr**, 결과는 **stdout** → 파이프로 그대로 파싱 가능
- 실패가 하나라도 있으면 종료 코드 1

## 배치 동작 규칙

- **건별 실패 격리**: 파일 하나가 실패해도 배치는 끝까지 돈다. 결과는 입력 순서를 보존한다.
- **자기 출력물 제외**: 폴더를 두 번 처리해도 `a_pixel.png` 같은 이전 출력물을 다시 먹지 않는다
  (`ImageBatchOp::output_suffix`). 파일을 직접 지정하면 의도적 재처리로 보고 처리한다.
- **원본 보존**: 이미지 연산은 원본을 두고 접미사가 붙은 새 파일을 만든다
  (`_pixel` `_crop` `_compressed` `_{w}x{h}` `_nobg`). 이름이 겹치면 `_2`, `_3`이 붙는다.

## 캐시 공유

`AppPaths::from_bundle_identifier("com.quickfolder.widget")`가 GUI와 동일한 경로를 만든다.

```
macOS   ~/Library/Caches/com.quickfolder.widget
Windows %LOCALAPPDATA%/com.quickfolder.widget
```

앱이 이미 받아둔 ffmpeg·썸네일 캐시를 CLI·MCP가 그대로 쓴다. `qf info`로 확인할 수 있다.

## 새 도구 추가

1. 로직을 `quickfolder-core`에 구현 (Tauri 타입 금지)
2. 배치가 필요하면 `ImageBatchOp`처럼 열거형에 항목 추가
3. `crates/quickfolder-mcp/src/main.rs`의 `#[tool_router]` 블록에 `#[tool]` 함수 추가
   - 파라미터·응답 타입은 `Deserialize`/`Serialize` + `JsonSchema` 필요
   - 코어 타입(`FileEntry` 등)은 코어에 스키마 의존을 들이지 않으려고
     MCP 쪽 DTO(`EntryOut`)로 변환해 노출한다
4. 모든 경로 인자는 반드시 `self.roots.check()` 를 통과시킨다
5. 파괴적 도구면 `confirm` 게이트를 붙인다
