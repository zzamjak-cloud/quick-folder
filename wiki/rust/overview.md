# Rust 백엔드 개요

## 진입점
`src-tauri/src/lib.rs` — Tauri 명령 등록  
`src-tauri/src/helpers.rs` — 공통 헬퍼 함수

## 모듈 구조

```
src-tauri/src/
├── lib.rs              ← 명령 등록
├── helpers.rs          ← 공통 헬퍼
└── modules/
    ├── mod.rs
    ├── types.rs        ← Rust 타입 (FileEntry, FileType 등)
    ├── constants.rs    ← 상수
    ├── error.rs        ← 에러 처리
    ├── file_ops.rs     ← 파일 CRUD
    ├── image_ops.rs    ← 이미지 처리
    ├── hwp_ops.rs      ← HWP 파일
    ├── system_ops/
    │   ├── file_explorer.rs  ← 폴더 나열·캐시
    │   ├── file_search.rs    ← 파일 검색
    │   ├── file_icon.rs      ← 네이티브 아이콘
    │   ├── clipboard.rs      ← 클립보드
    │   └── google_drive.rs   ← Google Drive
    └── tool_ops/
        ├── ffmpeg.rs         ← FFmpeg (비디오·GIF)
        ├── ghostscript.rs    ← Ghostscript (PDF·GIF 압축)
        └── fonttools.rs      ← FontTools (폰트 병합)
```

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
```typescript
import { invoke } from '@tauri-apps/api/core'
await invoke('command_name', { arg1: value1, arg2: value2 })
```

## 주요 Cargo.toml 의존성
| 크레이트 | 용도 |
|---------|------|
| `tauri` v2.10 | 앱 프레임워크 |
| `image` 0.25 | 이미지 처리 (jpg, png, gif, webp, bmp, ico) |
| `psd` 0.3 | Photoshop 파일 |
| `ffmpeg-sidecar` 2.0 | 비디오 처리 |
| `zip` 2.0 | ZIP 압축·해제 |
| `trash` 5.0 | 휴지통 이동 |
| `walkdir` 2.0 | 디렉토리 순회 |
| `arboard` 3.0 | 클립보드 |
| `ttf-parser` 0.24 | 폰트 파싱 |
| `hwarang` 0.2 | HWP 파일 |
| `dirs` 6.0 | OS 디렉토리 경로 |
| `ureq` 3.0 | HTTP 요청 |

## 관련 위키
- [commands.md](commands.md) — 전체 명령 레퍼런스
