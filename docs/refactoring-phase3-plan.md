# Phase 3: lib.rs 모듈 분리 계획

## 현황

- **현재 크기**: 5,358줄 (단일 파일)
- **Tauri 커맨드**: 62개
- **헬퍼 함수**: 추정 40+ 개

## 목표 구조

```
src-tauri/src/
├── lib.rs                    (Tauri 앱 설정, 모듈 re-export, ~200줄)
├── helpers.rs                (공통 헬퍼 유지)
└── modules/
    ├── mod.rs               (모듈 선언 및 re-export)
    ├── types.rs             (공통 타입: FileType, FileEntry, classify_file)
    ├── file_ops.rs          (파일 조작 17개 함수, ~800줄)
    ├── image_ops.rs         (이미지 처리 15개 함수, ~1,200줄)
    ├── media_ops.rs         (비디오/오디오 7개 함수, ~600줄)
    ├── system_ops.rs        (시스템 통합 13개 함수, ~700줄)
    └── tool_ops.rs          (외부 툴 관리 11개 함수, ~900줄)
```

## 함수 분류

### file_ops.rs (17개)
```rust
- list_directory
- is_directory
- create_directory
- create_text_file
- read_text_file
- write_text_file
- rename_item
- copy_items
- copy_items_with_progress
- move_items
- duplicate_items
- delete_items
- delete_items_elevated
- restore_trash_items
- check_duplicate_items
- compress_to_zip
- extract_zip
```

### image_ops.rs (15개)
```rust
- get_image_dimensions
- get_file_thumbnail
- get_psd_thumbnail
- invalidate_thumbnail_cache
- pixelate_preview
- pixelate_image
- remove_white_bg_preview
- remove_white_bg_save
- crop_image
- save_annotated_image
- sprite_sheet_preview
- save_sprite_sheet
- split_sprite_sheet
- convert_to_ico
- convert_to_icns
```

### media_ops.rs (7개)
```rust
- get_video_thumbnail
- compress_video
- compress_gif
- trim_video
- cut_video
- concat_videos
- video_to_gif
```

### system_ops.rs (13개)
```rust
- open_folder
- open_with_app
- open_in_photoshop
- quick_look
- copy_path
- select_folder
- get_file_icon
- get_recent_files
- search_files
- write_files_to_clipboard
- read_files_from_clipboard
- paste_image_from_clipboard
```

### tool_ops.rs (11개)
```rust
- check_ffmpeg
- check_gs
- check_fonttools
- download_gs
- download_fonttools
- install_gs
- install_fonttools
- compress_pdf
- get_font_info
- read_font_bytes
- merge_fonts
```

## 마이그레이션 단계

### 1단계: 공통 타입 분리 ✅
- [x] `modules/types.rs` 생성 (FileType, FileEntry, classify_file)
- [x] lib.rs에서 `use modules::types::*;` import

### 2단계: 모듈 파일 생성
각 카테고리별 모듈 파일 생성:
- [ ] `modules/mod.rs` (모듈 선언)
- [ ] `modules/file_ops.rs`
- [ ] `modules/image_ops.rs`
- [ ] `modules/media_ops.rs`
- [ ] `modules/system_ops.rs`
- [ ] `modules/tool_ops.rs`

### 3단계: 함수 이동 (점진적)
각 모듈별로:
1. lib.rs에서 함수 추출 (주석 + attribute + 본문)
2. 모듈 파일에 복사
3. lib.rs에서 해당 함수 제거
4. 컴파일 오류 수정 (use 문, visibility 등)
5. 테스트

**주의사항**:
- 함수 간 의존성 파악 필요
- 공통 헬퍼 함수는 `super::helpers::*` 또는 별도 `utils.rs`로 분리
- #[tauri::command] 함수는 반드시 `pub` 유지
- 프라이빗 헬퍼는 모듈 내부에서만 사용

### 4단계: lib.rs 정리
```rust
// lib.rs (최종 ~200줄)
mod helpers;
mod modules;

use modules::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_drag::init())
        .invoke_handler(tauri::generate_handler![
            // file_ops
            list_directory, is_directory, ...
            // image_ops
            get_image_dimensions, get_file_thumbnail, ...
            // media_ops
            get_video_thumbnail, compress_video, ...
            // system_ops
            open_folder, open_with_app, ...
            // tool_ops
            check_ffmpeg, check_gs, ...
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 5단계: 검증
- [ ] `cargo check` 통과
- [ ] `cargo clippy` 경고 확인
- [ ] `cargo build` 성공
- [ ] `npm run tauri dev` 정상 작동
- [ ] 주요 기능 테스트 (파일 탐색, 썸네일, 복사/이동 등)

## 예상 효과

| 지표 | 현재 | 목표 |
|------|------|------|
| lib.rs 크기 | 5,358줄 | ~200줄 |
| 최대 파일 크기 | 5,358줄 | ~1,200줄 |
| 모듈 개수 | 2개 (lib.rs, helpers.rs) | 8개 |
| 평균 모듈 크기 | 2,679줄 | ~750줄 |
| 코드 네비게이션 | 어려움 | 쉬움 |
| 유지보수성 | 낮음 | 높음 |

## 잠재적 문제점 및 해결 방안

### 1. 순환 의존성
**문제**: 모듈 간 함수 호출 시 순환 참조 발생 가능
**해결**: 공통 로직은 `helpers.rs` 또는 `modules/utils.rs`로 분리

### 2. visibility 이슈
**문제**: Tauri 커맨드는 반드시 `pub`이어야 함
**해결**: 모든 #[tauri::command] 함수는 `pub` 명시, 헬퍼는 `pub(crate)` 또는 private

### 3. use 문 복잡도 증가
**문제**: 각 모듈에서 필요한 크레이트를 개별 import
**해결**: `modules/mod.rs`에서 공통 prelude 정의

### 4. 컴파일 시간 증가 가능성
**문제**: 모듈 분리로 컴파일 유닛 증가
**해결**: 증분 컴파일 활성화 (기본값), 필요시 workspace 구조 고려

## 작업 시간 추정

- 1단계 (공통 타입): ✅ 완료
- 2단계 (모듈 파일 생성): 30분
- 3단계 (함수 이동):
  - file_ops.rs: 2시간
  - image_ops.rs: 3시간 (복잡도 높음)
  - media_ops.rs: 1.5시간
  - system_ops.rs: 2시간
  - tool_ops.rs: 2시간
- 4단계 (lib.rs 정리): 1시간
- 5단계 (검증): 1.5시간

**총 추정 시간**: 13시간

## 다음 세션 작업 지침

1. **modules/mod.rs** 생성:
```rust
pub mod types;
pub mod file_ops;
pub mod image_ops;
pub mod media_ops;
pub mod system_ops;
pub mod tool_ops;

pub use types::*;
pub use file_ops::*;
pub use image_ops::*;
pub use media_ops::*;
pub use system_ops::*;
pub use tool_ops::*;
```

2. **tool_ops.rs** 부터 시작 (외부 의존성 적음):
   - check_ffmpeg, check_gs, compress_pdf 등 11개 함수
   - ffmpeg-sidecar, ghostscript 관련 로직
   - 비교적 독립적이어서 이동이 쉬움

3. **점진적 검증**:
   - 각 모듈 이동 후 `cargo check` 실행
   - 오류 즉시 수정
   - 한 모듈 완료 후 다음 모듈 진행

## 자동화 도구

함수 추출 스크립트: `/tmp/extract_function.py`
```bash
python3 /tmp/extract_function.py /path/to/lib.rs function_name
```

## 참고 자료

- [Rust Module System](https://doc.rust-lang.org/book/ch07-00-managing-growing-projects-with-packages-crates-and-modules.html)
- [Tauri Command Pattern](https://tauri.app/v1/guides/features/command/)
- [Cargo Book - Project Structure](https://doc.rust-lang.org/cargo/guide/project-layout.html)
