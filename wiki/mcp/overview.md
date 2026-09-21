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

## 앱에서 등록하기 (권장)

설정 메뉴 → **AI 에이전트 연동 (MCP)**. `qf-mcp`는 앱에 번들되므로 별도 빌드·다운로드가 필요 없다.

1. **허용 폴더**를 하나 이상 추가한다. 비어 있으면 등록 버튼이 잠긴다 —
   이 목록이 곧 `QF_MCP_ROOTS`이고, 에이전트가 건드릴 수 있는 범위의 전부다.
2. 클라이언트 행의 **등록** 버튼을 누른다.
3. 해당 AI 클라이언트를 재시작한다.

### 지원 클라이언트

| 클라이언트 | 설정 파일 | 형식 |
|---|---|---|
| Claude Code | `~/.claude.json` | JSON `mcpServers` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (win: `%APPDATA%`) | JSON `mcpServers` |
| Cursor | `~/.cursor/mcp.json` | JSON `mcpServers` |
| Gemini CLI | `~/.gemini/settings.json` | JSON `mcpServers` |
| Codex CLI | `~/.codex/config.toml` | TOML `[mcp_servers.x]` |

**미지원**: ChatGPT 데스크톱 앱은 로컬 설정 파일이 없고 원격 MCP(HTTPS URL)를 서버 측에 등록하는
방식이라 로컬 stdio 바이너리를 파일로 등록할 수 없다.

새 클라이언트 추가는 `crates/quickfolder-core/src/mcp_setup.rs`의 `CLIENTS` 테이블에 한 줄,
`config_path()`에 경로 한 줄이면 된다.

### 설정 파일을 건드릴 때의 규칙

`mcp_setup.rs`가 지키는 것 (전부 테스트로 고정돼 있다):

- 쓰기 전 `<파일>.qfbak` 으로 **변경 직전 상태**를 백업한다
- 같은 이름 항목이 있으면 갱신한다 — 중복 생성하지 않는다
- 우리 항목 외에는 건드리지 않는다. JSON은 키 순서(`serde_json` preserve_order),
  TOML은 주석과 서식(`toml_edit`)을 보존한다
- 해제는 `quickfolder` 항목만 제거한다

### 상태 표시

| 표시 | 의미 |
|---|---|
| 미등록 | 설정 파일에 `quickfolder` 항목이 없다 |
| 등록됨 | 항목이 있고 실행 경로가 현재 앱과 일치한다 |
| 경로 불일치 | 항목은 있으나 경로가 다르다 — 개발 빌드로 등록한 뒤 정식 앱으로 바꾼 경우 등. **갱신** 필요 |

### CLI로도 가능

앱 버튼과 같은 코드를 쓴다.

```bash
qf mcp status
qf mcp install --client claude-code --root ~/Pictures --root ~/Downloads
qf mcp uninstall --client claude-code
```

## 수동 등록 (직접 쓰고 싶을 때)

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
