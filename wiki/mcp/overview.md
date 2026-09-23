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
- **수동 등록용 설정 조각도 같은 직렬화기로 만든다** (`config_snippet`). 손으로 문자열을
  조립하면 안 된다 — TOML 기본 문자열은 백슬래시를 이스케이프로 읽어서 Windows 경로
  `C:\Users\...` 의 `\U` 가 유니코드 이스케이프로 해석돼 붙여넣는 순간 파싱이 깨진다.
  `toml_edit` 은 이런 값을 리터럴 문자열(`'C:\Users\...'`)로 내보내 안전하다

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

### 도구 17개

| 도구 | 성격 | 비고 |
|------|------|------|
| `qf_info` | 조회 | 허용 루트, 캐시 경로, 동시성, ffmpeg 가용 여부 |
| `qf_list_directory` | 조회 | 압축 파일 내부 가상 경로 지원. `{entries: [...]}` |
| `qf_search_files` | 조회 | macOS는 Spotlight 우선. `{entries: [...]}` |
| `qf_find_duplicates` | 조회 | 크기 → xxh3 해시 2단계. `{groups: [...]}` |
| `qf_image_info` | 조회 | 이미지 가로·세로. "절반 크기로 줄여줘" 같은 요청에서 resize 전에 쓴다 |
| `qf_folder_size` | 조회 | 전체 용량 + 직계 하위 용량 내림차순 |
| `qf_extract_text` | 조회 | HWP/HWPX 본문 추출 (다른 형식은 에이전트 자체 읽기 도구로) |
| `qf_image_batch` | 생성 | pixelate/resize/compress/crop/to_ico/to_icns/remove_white_bg |
| `qf_maps` | 생성 | 노멀·패럴랙스·스페큘러·오클루전 맵. 아무것도 안 고르면 노멀맵만 |
| `qf_sprite_sheet` | 생성 | pack / split |
| `qf_video` | 생성 | compress/trim/cut/concat/to_gif/gif_to_mp4/compress_gif. ffmpeg 필요 |
| `qf_pdf_compress` | 생성 | 외부 의존 없음 (순수 Rust) |
| `qf_archive` | 생성 | compress / extract |
| `qf_file_ops` | **파괴적** | move/copy/rename/mkdir — `confirm: true` 필요 |
| `qf_delete` | **파괴적** | 휴지통 경유만 — `confirm: true` 필요 |
| `qf_folder_merge` | **파괴적** | 스마트 폴더 병합 — `confirm: true` 필요. 없으면 충돌 분석만 |
| `qf_restore_trash` | **파괴적** | 휴지통 복원 — `confirm: true` 필요 |

**노출하지 않는 것**: 폰트 병합(fonttools가 번들이 아니라 최초 사용 시 다운로드가 필요한데
헤드리스에서는 동의를 받을 GUI가 없다 — [../tools/overview.md](../tools/overview.md)),
썸네일·클립보드·미리보기 등 UI 전용 명령.

#### 출력 이름 규칙에 주의

생성 계열은 **원본을 남기고 접미사가 붙은 새 파일**을 만들며, 이름이 겹치면 번호가 붙는다.
특히 `qf_sprite_sheet` 의 `pack` 은 `dest` 를 그대로 쓰지 않고 `_sheet` 를 붙인다
(`sheet.png` → `sheet_sheet.png`, 중복이면 `_sheet_2`). **실제 경로는 응답의 `output`** 에
담겨 오므로, 이어서 `split` 할 때는 그 값을 그대로 넘겨야 한다.

#### `qf_restore_trash` 의 루트 검사

복원은 "원래 경로"에 파일을 되살리는 동작이다. 그 경로를 검사하지 않으면
**삭제 → 복원으로 허용 루트 밖에 파일을 만들 수 있다.** 그래서 이 도구는 복원 대상 경로도
다른 도구와 똑같이 `roots.check()` 를 통과시킨다.

#### 배치 처리 방식

`qf_maps`·`qf_video`·`qf_pdf_compress` 는 `run_simple_batch` 로 **순차** 처리한다.
ffmpeg 처럼 이미 내부에서 코어를 다 쓰는 작업이 섞여 있어 여기서 또 병렬로 돌리면
서로 잡아먹는다. 건별 실패는 격리되고 결과는 입력 순서를 보존한다.
`qf_image_batch` 만 코어의 `run_image_batch` 로 병렬 처리한다.

### 업데이트와 qf-mcp 잠금

에이전트가 띄운 `qf-mcp.exe` 는 그 세션이 사는 동안 상주해 Windows 설치 파일을 잠근다.
설치 훅에서 설치 직전에 종료한다 — [../infra/release.md](../infra/release.md).

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
6. 여러 파일을 도는 도구면 `collect_files` + `run_simple_batch` 헬퍼를 쓴다
   (루트 검사 · 확장자 필터 · 건별 실패 격리 · `dry_run` 이 한 번에 붙는다)
7. **응답 최상위를 배열로 돌려주지 않는다.** MCP 의 `structuredContent` 는 객체여야 해서
   `Json<Vec<T>>` 는 클라이언트 스키마 검증에서 거부된다 (Claude Code 기준
   `expected "record"` 오류가 나고 도구가 통째로 실패한다). 목록은 `EntriesOut`,
   `DuplicateGroupsOut` 처럼 한 겹 감싼다

---

# 반대 방향 — 앱이 에이전트를 부른다 (AI Agent 요청하기)

위까지는 전부 **에이전트 → QuickFolder** 방향이다. 폴더 우클릭 → `AI Agent 요청하기`는
반대로 **QuickFolder → 에이전트**다. 앱이 에이전트 CLI를 헤드리스로 띄우고,
그 에이전트가 우클릭한 폴더에 지시를 적용한다.

## 파일 맵

| 역할 | 파일 |
|------|------|
| 실행 인자 조립·폴더 봉쇄 (순수 함수, 테스트 고정) | `crates/quickfolder-core/src/agent_launch.rs` |
| 경로 봉쇄 공통 로직 | `crates/quickfolder-core/src/path_guard.rs` |
| 프로세스 수명 (실행·스트리밍·취소·임시파일) | `src-tauri/src/modules/agent_commands.rs` |
| Tauri command 경계 | `utils/tauriCommandDomains/agentCommands.ts` |
| 메뉴 노출 판단 | `components/FileExplorer/hooks/useAgentAvailability.ts` |
| 모달 | `components/FileExplorer/AgentRequestModal.tsx` |
| CLI별 출력 → 표시용 줄 | `components/FileExplorer/agentStreamFormat.ts` |

## 봉쇄 설계

1. **대상 폴더 검사** — 허용 루트 안인지 본다. 기준은 프론트엔드가 보낸 값이 아니라
   **클라이언트 설정 파일에 실제로 적힌 `QF_MCP_ROOTS`**다 (`registered_roots()`).
   등록을 해제하면 그 순간부터 이 기능도 막힌다.
2. **작업 디렉토리 = 대상 폴더**, 그리고 에이전트의 파일 도구를 그 안에 가둔다.
3. **루트 축소** — MCP 서버에 넘기는 `QF_MCP_ROOTS`를 **우클릭한 폴더 하나로** 좁힌다.
   허용 루트 전체가 아니라 그 폴더만 열린다.

`..`과 심볼릭 링크는 `path_guard::normalize`로 해소한 뒤 비교한다. 문자열 `starts_with`만
쓰면 `root/../etc`가 그대로 통과하고, 형제 폴더 `rootx`도 `root`의 하위로 잡힌다.

### 파일 도구를 끄지 않는 이유

초기 구현은 내장 도구를 전부 껐다(`--tools ""`). 과한 잠금이었다 — 실측 결과
Claude Code의 `--restricted`만으로 파일 도구가 작업 디렉토리 안에 갇힌다.
도구를 다 끄면 "텍스트 파일 읽고 요약해서 README로 써줘" 같은 평범한 요청까지 막히고
에이전트가 MCP 도구 8개의 자연어 리모컨이 된다.

끄는 대신 **필요한 것만 켠다**(allowlist). Claude Code의 내장 도구에는 `CronDelete`,
`SendMessage`, `PushNotification`처럼 파일과 무관하게 폴더 밖으로 나가는 것이 섞여 있어서,
allowlist로 두면 버전이 올라가며 도구가 늘어도 새로 열리지 않는다.

## 에이전트별

| 에이전트 | 봉쇄 | 출력 형식 | 설정 전달 |
|---|---|---|---|
| Claude Code | ✅ 읽기·쓰기 모두 폴더 안 | `stream-json` | `--mcp-config` 인라인 JSON |
| Gemini CLI | ✅ 읽기·쓰기 모두 폴더 안 | `stream-json` | `GEMINI_CLI_SYSTEM_SETTINGS_PATH` 임시 파일 |
| Codex CLI | ❌ **보장 못 함** (아래 참고) | `--json` JSONL | `-c` TOML 오버라이드 |

Claude Desktop·Cursor는 GUI 앱이라 프롬프트를 외부에서 주입할 수 없다 — 대상이 아니다.

### Claude Code

```
claude -p <프롬프트>
       --restricted                     # 설정 무시, 셸 제거, 파일 도구를 cwd 안에 가둠
       --tools "Read,Write,Edit,Glob,Grep"
       --mcp-config <JSON> --strict-mcp-config
       --allowedTools "mcp__quickfolder Read Write Edit Glob Grep"
       --permission-prompts none        # 그 밖은 묻지 말고 거부 (답할 사람이 없다)
       --output-format stream-json --verbose
```

실측: 폴더 안 읽기·쓰기 성공, 상위 폴더 읽기는 `is outside ...`로 거부, 도구 목록에 `Bash` 없음.

### Gemini CLI

설정을 인라인으로 받는 플래그가 없어서 임시 JSON 파일을 만들고
`GEMINI_CLI_SYSTEM_SETTINGS_PATH`로 가리킨다. Gemini의 설정 병합 순서에서
**system이 마지막**이라 workspace·user 설정을 확실히 덮는다
(`settings.js`의 `mergeSettings`). 사용자의 `~/.gemini/settings.json`이나
대상 폴더를 건드리지 않는 것이 핵심이다 — 폴더에 `.gemini/`를 쓰면 사용자 데이터를 오염시킨다.

```json
{
  "mcpServers": { "quickfolder": { "command": "...", "args": [], "env": { "QF_MCP_ROOTS": "<대상 폴더>" } } },
  "mcp": { "allowed": ["quickfolder"] },
  "tools": { "core": ["read_file","write_file","replace","glob","search_file_content","list_directory","read_many_files"] }
}
```

`tools.core`가 allowlist라 `run_shell_command`·`web_fetch`·`google_web_search`·`save_memory`가 빠진다.
폴더 경계는 Gemini 자체가 강제한다 — `read_file`/`write_file`/`ls`/`glob`/`grep`/`edit`가
workspace 밖 경로에 `Path not in workspace`를 낸다.

임시 파일은 `agent_commands.rs`가 spawn 직전에 쓰고 종료·spawn 실패 시 지운다.

### Codex CLI — 봉쇄를 보장하지 못한다

```
codex exec <프롬프트> -C <폴더>
     --ignore-user-config      # 사용자 config.toml 의 다른 MCP 서버 차단
     --skip-git-repo-check --ephemeral
     --approve-for-me          # 이게 없으면 MCP 호출이 전부 거부된다
     --json
     -c mcp_servers.quickfolder.command='...'
     -c mcp_servers.quickfolder.args=[]
     -c mcp_servers.quickfolder.env.QF_MCP_ROOTS='...'
```

`codex exec`는 비대화형에서 승인 정책을 `never`로 강제하고, 그 상태에서는 MCP 도구 호출이
전부 거부된다(`MCP tool call requires approval, but approval policy is never`).
이를 푸는 유일한 수단인 `--approve-for-me`는 **샌드박스 이탈 요청까지 자동 승인**한다 —
실측에서 상위 폴더 읽기와 쓰기가 모두 통과했다. 반대로 `--sandbox`를 켜면 Windows
샌드박스가 PowerShell 기동 자체를 막아(`CreateProcess ... blocked by policy`) Codex가
아무것도 못 한다. `--approve-for-me`와 `--sandbox`는 동시에 쓸 수 없다.

**시도해 보고 안 되는 것으로 확인됨 (다시 시도하지 말 것):**
`approval_policy`를 `on-failure`/`untrusted`로 변경, `mcp_servers.<name>.auto_approve`,
`.trust`, `.trust_level`, `projects."<경로>".trust_level='trusted'`,
`mcp_servers={}`로 초기화 후 재등록.

그래서 `AgentLauncher::confines_to_folder`가 `false`다. QuickFolder MCP 도구의 루트 제한은
여전히 적용되지만 Codex 자신의 셸은 디스크 어디든 간다. 모달이 이 값을 보고 빨간 경고와
**동의 체크박스**를 띄우고, 체크 전에는 실행 버튼이 거부된다. 에이전트를 바꾸면 동의가 초기화된다.

OpenAI가 exec 모드에서 MCP 자동승인을 샌드박스 이탈 승인과 분리해 주면 다시 볼 것.

## 출력 파싱

`agent_commands.rs`는 stdout/stderr 줄을 그대로 흘려보내기만 한다. 파싱은
`agentStreamFormat.ts`의 순수 함수에 두어 CLI가 형식을 바꿔도 프런트만 고치면 되게 했다.

| 에이전트 | 본문 | 도구 호출 |
|---|---|---|
| Claude Code | `{"type":"assistant","message":{"content":[{"type":"text"}]}}` | 같은 배열의 `tool_use` |
| Codex CLI | `{"type":"item.completed","item":{"type":"agent_message","text"}}` | `item.started` + `item.type=="mcp_tool_call"` |
| Gemini CLI | `{"type":"message","role":"assistant","content","delta":true}` | `{"type":"tool_use","tool_name"}` |

주의 두 가지:

- **Codex는 도구 줄을 `item.started`에서만 만든다.** `item.completed`에서 또 만들면 두 번 찍힌다.
- **Gemini 본문은 delta 조각으로 온다.** 조각마다 새 줄을 만들면 한 글자씩 끊겨 보인다.
  `AgentLine.append`를 달아 `appendAgentLines()`가 마지막 줄에 이어 붙인다.

JSON이 아닌 줄(CLI가 직접 찍는 경고 등)은 삼키지 않고 그대로 보여준다 — 삼키면 디버깅이 불가능해진다.

## 메뉴 노출 규칙

`folder-tools` 섹션(단일 폴더 선택)에 `agent-request` 항목으로 붙는다.
`useAgentAvailability`가 **등록됨 + CLI 존재 + 이 폴더가 허용 루트 안**을 전부 만족할 때만 보인다.
프런트의 `isUnderRoot`는 어림짐작이고(심볼릭 링크 미해소), 실제 차단은 Rust가 다시 한다.

MCP 설정 모달에서 등록·해제하면 `qf:mcp-changed` 윈도우 이벤트가 나가고 메뉴가 갱신된다.

## 취소

`agent_cancel(requestId)`은 프로세스 **트리째** 죽인다(Windows `taskkill /T /F`, 그 외 프로세스 그룹 `kill`).
자식만 죽이면 에이전트가 띄운 `qf-mcp`가 남아 [업데이트 시 설치 파일을 잠근다](../infra/release.md).
모달을 닫아도 실행 중이던 요청은 같은 경로로 정리된다.

## 새 에이전트 추가

1. `LAUNCHERS`에 한 줄 (`confines_to_folder`를 정직하게 적을 것)
2. `build_args`에 분기 하나
3. `agentStreamFormat.ts`에 파서 하나
4. **실제로 띄워서 폴더 밖 읽기·쓰기를 시도시켜 볼 것.** 문서만 믿으면 안 된다 —
   Codex는 help 텍스트상으로는 샌드박스가 있지만 실제로는 탈출한다.
