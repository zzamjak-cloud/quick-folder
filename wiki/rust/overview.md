# Rust 백엔드 개요

## Cargo 워크스페이스

루트 `Cargo.toml`이 워크스페이스다. 빌드 산출물은 **리포지토리 루트 `target/`** 에 생긴다(`src-tauri/target/` 아님).

| 크레이트 | 경로 | 역할 |
|---------|------|------|
| `quickfolder-core` | `crates/quickfolder-core` | 파일·이미지·미디어 처리 로직. **Tauri 의존 0**, 단독 빌드됨 |
| `app` | `src-tauri` | Tauri 앱. command 래퍼와 GUI 전용 기능만 |

코어를 분리한 이유: CLI·MCP 서버가 GUI 없이 같은 로직을 쓰기 위함. GUI 프로세스는
UI 보호를 위해 동시성이 제한되지만(`MAX_HEAVY_OPS=3`), 별도 프로세스는 코어 수만큼 열 수 있다.

## 코어 ↔ 앱 경계

코어는 GUI 타입을 모른다. 앱이 가진 값을 다음 두 타입으로 바꿔 주입한다.

| 앱(Tauri) | 코어 | 변환 위치 |
|-----------|------|----------|
| `AppHandle` → `app.path().app_cache_dir()` | `AppPaths` | `src-tauri/src/modules/tauri_glue.rs::app_paths` |
| `tauri::ipc::Channel<T>` | `Progress<T>` (`Arc<dyn ProgressSink<T>>`) | `tauri_glue::channel_sink` |

`AppPaths::from_bundle_identifier("com.quickfolder.widget")`가 GUI와 **같은 캐시 경로**를 만든다.
→ CLI·MCP가 앱이 이미 받아둔 ffmpeg·썸네일 캐시를 그대로 재사용한다.

## 진입점
`src-tauri/src/lib.rs` — Tauri 명령 등록 (`generate_handler!`)
`src-tauri/src/modules/commands.rs` — `#[tauri::command]` 래퍼 76개. 본문은 코어 호출 1줄
`crates/quickfolder-core/src/helpers.rs` — 공통 헬퍼 함수

## 모듈 구조

대형 단일 `.rs` 파일은 **facade + 하위 모듈** 패턴으로 분리됐다. facade 파일(`file_ops.rs` 등)이 공개 API를 노출하고, 실제 구현은 하위 모듈에 있다.

```
crates/quickfolder-core/src/
├── lib.rs                       ← 모듈 선언 + 평면 재수출
├── helpers.rs
├── paths.rs                     ← AppPaths (캐시 경로 규약)
├── progress.rs                  ← ProgressSink / Progress / NullSink
├── runtime.rs                   ← 런타임 바깥용 block_on
└── (아래 ops 모듈들)

src-tauri/src/
├── lib.rs
└── modules/
    ├── commands.rs              ← #[tauri::command] 래퍼
    ├── tauri_glue.rs            ← AppHandle→AppPaths, Channel→Progress
    └── system_ops/              ← GUI 전용 잔류
        ├── file_explorer.rs
        ├── file_icon*
        ├── clipboard.rs
        ├── app_activation.rs
        └── webview_recovery.rs

crates/quickfolder-core/src/    ← ops 모듈 (아래)
    ├── types.rs
    ├── constants.rs
    ├── error.rs
    ├── file_ops.rs              ← facade
    │   ├── file_ops/listing.rs       ← list_directory
    │   ├── file_ops/mutation.rs      ← rename·delete·create
    │   ├── file_ops/archive.rs       ← compress_to_zip·extract_zip
    │   ├── file_ops/cache.rs
    │   └── file_ops/transfer/
    │       ├── transfer.rs           ← transfer_items_with_progress 진입
    │       ├── progress.rs           ← Channel 진행률 전송
    │       ├── duplicate.rs
    │       └── folder_merge.rs       ← analyze_folder_merge·merge_folders
    ├── archive_ops.rs           ← facade
    │   ├── archive_ops/listing.rs
    │   ├── archive_ops/extract.rs
    │   ├── archive_ops/materialize.rs
    │   ├── archive_ops/path.rs
    │   └── archive_ops/records.rs
    ├── image_ops.rs             ← facade
    │   ├── image_ops/thumbnail.rs
    │   ├── image_ops/compression.rs
    │   ├── image_ops/convert.rs
    │   ├── image_ops/background.rs
    │   ├── image_ops/pixelate.rs
    │   ├── image_ops/sprite.rs
    │   ├── image_ops/font.rs
    │   ├── image_ops/dimensions.rs
    │   └── image_ops/heavy.rs
    ├── media_ops.rs             ← facade
    │   ├── media_ops/video.rs        ← video command facade
    │   │   ├── media_ops/video/compress.rs
    │   │   ├── media_ops/video/edit.rs
    │   │   ├── media_ops/video/concat.rs
    │   │   ├── media_ops/video/gif.rs
    │   │   └── media_ops/video/progress.rs
    │   ├── media_ops/gif.rs
    │   ├── media_ops/pdf.rs          ← compress_pdf (순수 Rust: lopdf + image)
    │   └── media_ops/thumbnail.rs
    ├── hwp_ops.rs
    ├── laigter_maps.rs
    ├── system_ops/              ← GUI 비의존分만 코어에 있음
    │   ├── file_search.rs
    │   └── google_drive.rs
    └── tool_ops/
        ├── ffmpeg.rs
        └── fonttools.rs             ← fonttools command facade
            ├── fonttools/archive.rs
            ├── fonttools/install.rs
            ├── fonttools/merge.rs
            ├── fonttools/paths.rs
            └── fonttools/python.rs
```

## 최근 분리된 대형 모듈

| facade | 하위 모듈 역할 |
|--------|----------------|
| `media_ops/video.rs` | 압축, 편집, 이어붙이기, GIF 변환, 진행률 파싱 |
| `tool_ops/fonttools.rs` | 번들 압축 해제, 설치, 병합, 경로, Python 실행 |
| `system_ops/file_icon.rs` | 메모리·디스크 아이콘 캐시, 텍스트 아이콘, macOS/Windows/fallback 네이티브 아이콘 |

## helpers.rs 함수

| 함수 | 설명 |
|------|------|
| `is_cloud_path(path)` | 클라우드 경로 감지 (Google Drive, iCloud, OneDrive, Dropbox) |
| `find_unique_path(parent, stem, suffix, ext)` | 파일 중복 시 자동 번호 추가 (e.g. `file_2.png`) |
| `get_copy_destination(parent, stem, ext, is_dir)` | 복사 목적지 경로 결정 (복사본 명명) |
| `create_sprite_canvas(images, w, h, cols, rows)` | 스프라이트 그리드 캔버스 생성 |
| `create_file_entry(path)` | `FileEntry` 구조체 생성 |
| `normalize_path(path)` | 경로 정규화 |
| `is_hidden_file(name)` | 숨김 파일 판별 |
| `is_system_file(meta)` | 시스템 파일 판별 (플랫폼별 구현) |
| `is_system_filename(name)` | 시스템 파일명 패턴 판별 |

## Frontend 호출 방식

raw `invoke()` 직접 호출 대신 **typed command API**를 사용한다.

```typescript
import { tauriCommands } from '../utils/tauriCommands';
import { runCommand } from '../utils/tauriCommandRunner';

// 권장: 도메인별 typed API
await tauriCommands.listDirectory({ path });
await tauriCommands.deleteItems({ paths });

// 저수준 (큐·우선순위 필요 시)
import { queuedInvoke, queuedInvokeLow } from '../utils/tauriInvoke';
await queuedInvoke('get_thumbnail', { path, size });
```

| 계층 | 파일 | 역할 |
|------|------|------|
| typed API | `utils/tauriCommands.ts` | 도메인 command merge |
| 도메인 | `utils/tauriCommandDomains/*.ts` | file/media/preview/system |
| 래퍼 | `utils/tauriCommandRunner.ts` | `runCommand` / `runDirectCommand` |
| 큐 | `utils/tauriInvoke.ts` | 우선순위·취소·동시성 제한 |
| re-export | `hooks/invokeQueue.ts` | FileExplorer에서 import 경로 유지 |

새 Rust 명령 추가 시:
1. 로직을 `crates/quickfolder-core`에 구현 (Tauri 타입 금지 — 캐시 경로는 `AppPaths`, 진행률은 `Progress<T>`)
2. `src-tauri/src/modules/commands.rs`에 `#[tauri::command]` 래퍼 추가
3. `lib.rs`의 `generate_handler!`에 등록
4. 해당 `tauriCommandDomains/*.ts`에 typed wrapper 추가 → `tauriCommands.ts` merge 확인

## 압축 탐색 메모
- `file_ops/listing.rs::list_directory`는 archive virtual path를 감지하면 `archive_ops.rs`로 라우팅한다.
- ZIP은 Rust `zip` crate로 직접 읽고, `.rar`/`.7z`/`.tar` 계열은 `tar` 출력 기반으로 목록을 구성한다.
- 압축 내부 파일을 OS로 넘겨야 할 때는 `materialize_archive_paths` 또는 `materialize_archive_path_in_cache`를 사용해 임시 실파일을 만든다.

## 테스트

| 파일 | 역할 |
|------|------|
| `crates/quickfolder-core/tests/command_boundary.rs` | 명령 경계·파일 시스템 실패 통합 테스트 |
| `crates/quickfolder-core/tests/image_golden.rs` | 이미지 연산 결과 지문 고정 (픽셀 해시). 갱신은 `UPDATE_GOLDEN=1` |
| facade 내 `#[cfg(test)]` | submodule 단위 테스트 |

→ [../infra/testing.md](../infra/testing.md)

## 주요 Cargo.toml 의존성
| 크레이트 | 용도 |
|---------|------|
| `tauri` v2.10 | 앱 프레임워크 |
| `image` 0.25 | 이미지 처리 (jpg, png, gif, webp, bmp, ico) |
| `lopdf` 0.36 | PDF 파싱·재저장 (compress_pdf 자체 구현) |
| `psd` 0.3 | Photoshop 파일 |
| `ffmpeg-sidecar` 2.0 | 비디오 처리 |
| `zip` 2.0 | ZIP 압축·해제·내부 목록 읽기 |
| `encoding_rs` 0.8 | ZIP/TAR 이름 디코딩 fallback (CP949/EUC-KR) |
| `trash` 5.0 | 휴지통 이동 |
| `walkdir` 2.0 | 디렉토리 순회 |
| `arboard` 3.0 | 클립보드 (app 크레이트 전용) |
| `ttf-parser` 0.24 | 폰트 파싱 |
| `hwarang` 0.2 | HWP 파일 |
| `dirs` 6.0 | OS 디렉토리 경로 |
| `ureq` 3.0 | HTTP 요청 |

## 관련 위키
- [commands.md](commands.md) — 전체 명령 레퍼런스
- [../infra/testing.md](../infra/testing.md) — 테스트 실행
