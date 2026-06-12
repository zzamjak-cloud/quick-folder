# Rust 명령 레퍼런스

전체 `#[tauri::command]` 함수 목록. 등록 위치: `src-tauri/src/lib.rs`

## 파일 시스템

| 명령 | 파라미터 | 반환 | 설명 |
|------|----------|------|------|
| `open_folder` | `path: String` | `()` | OS 탐색기/기본 연결로 열기 (압축 내부 경로면 캐시에 꺼낸 뒤 연다) |
| `select_folder` | — | `Option<String>` | 네이티브 폴더 선택 다이얼로그 |
| `list_directory` | `path: String` | `Vec<FileEntry>` | 폴더/압축 가상 경로 내용 나열 |
| `materialize_archive_paths` | `paths: Vec<String>` | `Vec<String>` | 압축 내부 경로를 임시 실경로로 꺼내기 |
| `create_directory` | `path: String` | `()` | 새 폴더 생성 |
| `rename_item` | `path, new_name: String` | `String` | 이름 변경 (새 경로 반환) |
| `is_directory` | `path: String` | `bool` | 폴더 여부 확인 |
| `read_text_file` | `path: String` | `String` | 텍스트 파일 읽기 |
| `write_text_file` | `path, content: String` | `()` | 텍스트 파일 쓰기 |
| `create_text_file` | `path: String` | `()` | 빈 텍스트 파일 생성 |
| `calculate_folder_size` | `path: String` | `FolderSizeInfo` | 폴더 총 용량과 직계 하위 항목별 누적 용량 |
| `list_system_roots` | — | `Vec<String>` | 루트 드라이브 목록 |

### 압축 탐색 메모
- 지원 브라우징 포맷: `.zip`, `.rar`, `.7z`, `.tar`, `.tgz`, `.tar.gz`, `.tbz2`, `.tar.bz2`, `.txz`, `.tar.xz`
- 프런트는 `list_directory`와 `open_folder`만 써도 압축 내부 목록 조회와 내부 파일 열기를 처리할 수 있다.
- drag-out 또는 내부 복사에서는 `materialize_archive_paths`가 실제 파일 경로 목록을 돌려준다.

### `FolderSizeInfo` (calculate_folder_size 반환)

```rust
struct FolderSizeInfo {
    bytes: String,
    file_count: u64,
    folder_count: u64,
    children: Vec<FolderSizeChildInfo>,
}

struct FolderSizeChildInfo {
    name: String,
    path: String,
    is_dir: bool,
    bytes: String,
    file_count: u64,
    folder_count: u64,
}
```

- `children`은 선택한 폴더의 직계 하위 항목만 포함한다.
- 하위 폴더의 `bytes`는 해당 폴더 내부 전체 누적 용량이다.
- 반환 순서는 용량 내림차순이며, 같은 용량이면 이름 오름차순이다.

## 파일 관리

| 명령 | 파라미터 | 반환 | 설명 |
|------|----------|------|------|
| `copy_items` | `paths[], dest: String` | `()` | 복사 |
| `copy_items_with_progress` | `paths[], dest: String` | stream | 진행률 포함 복사 |
| `move_items` | `paths[], dest: String` | `()` | 이동 |
| `duplicate_items` | `paths: Vec<String>` | `()` | 같은 위치에 복제 |
| `delete_items` | `paths: Vec<String>` | `()` | 휴지통으로 삭제 |
| `delete_items_elevated` | `paths: Vec<String>` | `()` | 관리자 권한 삭제 |
| `restore_trash_items` | `paths: Vec<String>` | `()` | 휴지통에서 복원 |
| `check_duplicate_items` | `paths[], dest: String` | `Vec<String>` | 중복 파일 목록 반환 |
| `analyze_folder_merge` | `source, dest_parent: String` | `FolderMergeAnalysis` | 폴더 병합 전 비교 |
| `merge_folders` | `source, dest_parent, conflict_mode, is_move` | `()` | 스마트 폴더 병합 실행 |
| `compress_to_zip` | `paths[], dest: String` | `String` | ZIP 압축 (dest 경로 반환) |
| `extract_zip` | `zip_path, dest_dir: String` | `ExtractResult` | ZIP 해제 (부분 실패 보고) |

### `ExtractResult` (extract_zip 반환)

```rust
struct ExtractResult {
    dest_dir: String,          // 해제 폴더
    total: usize,              // 시도한 파일 수 (디렉토리 제외)
    extracted: usize,          // 성공한 파일 수
    failed: Vec<ExtractFailure>, // 실패 항목 { name, reason }
}
```

- 항목 하나가 실패해도 `?`로 전체 중단하지 않고 나머지를 계속 해제한 뒤 `failed`에 모아 반환한다.
- 프론트엔드(JSON)는 camelCase: `{ destDir, total, extracted, failed: [{ name, reason }] }`.
- 회귀 방지 규칙은 [operations/overview.md](../operations/overview.md#zip-해제-회귀-방지-windows) 참조.

## 클립보드 & 시스템

| 명령 | 파라미터 | 설명 |
|------|----------|------|
| `copy_path` | `path: String` | 경로 텍스트 클립보드 복사 |
| `write_files_to_clipboard` | `paths: Vec<String>` | 파일을 OS 클립보드에 등록 |
| `read_files_from_clipboard` | — | OS 클립보드 파일 목록 |
| `paste_image_from_clipboard` | `dest: String` | 이미지 → PNG 저장, 경로 반환 |
| `open_terminal` | `path: String` | 폴더 경로에서 OS 터미널 열기 |
| `run_terminal_command` | `path, command: String` | 폴더 경로에서 명령을 새 터미널로 실행 |
| `open_external_url` | `url: String` | 브라우저로 URL 열기 |
| `open_sac_settings` | — | macOS 손쉬운 사용 설정 |
| `quick_look` | `path: String` | macOS QuickLook |
| `open_with_app` | `path, app: String` | 특정 앱으로 열기 |
| `open_in_photoshop` | `path: String` | Photoshop으로 열기 |

## 캐시 & 검색

| 명령 | 파라미터 | 설명 |
|------|----------|------|
| `read_cached_listing` | `path: String` | 캐시된 폴더 목록 |
| `write_cached_listing` | `path, entries` | 폴더 목록 캐시 저장 |
| `invalidate_thumbnail_cache` | `path: String` | 썸네일 캐시 무효화 |
| `get_recent_files` | `count: usize` | 최근 파일 목록 |
| `search_files` | `root, query, max_results` | 파일명 검색 (재귀) |
| `find_duplicate_files` | `root: String` | 내용 동일 파일 그룹 반환 (`Vec<DuplicateGroup>`, 재귀·xxh3) |

### `DuplicateGroup` (`find_duplicate_files` 반환)
```rust
struct DuplicateGroup {
    size: u64,
    files: Vec<FileEntry>,
}
```
- 프론트 타입: `DuplicateFileGroup` (`types.ts`)
- 구현: `system_ops/file_search.rs`
- 제한: `DUPLICATE_SCAN_MAX_DEPTH`(20), `MAX_DUPLICATE_SCAN_FILES`(100_000), `MAX_DUPLICATE_GROUPS`(500)

## 썸네일 & 아이콘

| 명령 | 파라미터 | 반환 | 설명 |
|------|----------|------|------|
| `get_file_thumbnail` | `path, size: u32` | base64 | 이미지 썸네일 |
| `get_file_thumbnail_path` | `path, size: u32` | 경로 | 이미지 썸네일 파일 경로 |
| `get_video_thumbnail` | `path, size: u32` | base64 | 비디오 첫 프레임 |
| `get_video_thumbnail_path` | `path, size: u32` | 경로 | 비디오 썸네일 경로 |
| `get_psd_thumbnail` | `path, size: u32` | base64 | PSD 썸네일 |
| `get_file_icon` | `path: String` | base64 | 네이티브 파일 아이콘 |

## 이미지 처리

| 명령 | 파라미터 | 설명 |
|------|----------|------|
| `get_image_dimensions` | `path` | 가로·세로 픽셀 |
| `pixelate_preview` | `path, block_size` | 픽셀화 미리보기 (base64) |
| `pixelate_image` | `path, block_size, dest` | 픽셀화 저장 |
| `crop_image` | `path, x, y, w, h, dest` | 자르기 |
| `save_annotated_image` | `path, strokes, dest` | 드로잉 주석 저장 |
| `compress_image_preview` | `path, quality` | 압축 미리보기 (base64) |
| `compress_image` | `path, quality, dest` | 압축 저장 |
| `resize_image` | `path, w, h, dest` | 리사이즈 |
| `remove_white_bg_preview` | `path, threshold` | 배경 제거 미리보기 |
| `remove_white_bg_save` | `path, threshold, dest` | 배경 제거 저장 |
| `convert_to_ico` | `path, dest` | .ico 변환 |
| `convert_to_icns` | `path, dest` | .icns 변환 |

## 비디오·GIF·PDF

| 명령 | 설명 |
|------|------|
| `compress_video` | 비디오 압축 |
| `trim_video` | 구간 자르기 |
| `cut_video` | 다중 컷 |
| `concat_videos` | 이어붙이기 |
| `video_to_gif` | GIF 변환 |
| `gif_to_mp4` | MP4 변환 |
| `compress_gif` | GIF 압축 (Ghostscript) |
| `compress_pdf` | PDF 압축 (Ghostscript) |

## 스프라이트 & 맵

| 명령 | 설명 |
|------|------|
| `sprite_sheet_preview` | 스프라이트 시트 미리보기 (base64) |
| `save_sprite_sheet` | 스프라이트 시트 저장 |
| `split_sprite_sheet` | 스프라이트 시트 분리 |
| `laigter_maps_preview` | Laigter 맵 미리보기 |
| `laigter_maps_export` | Laigter 맵 내보내기 |

## 폰트

| 명령 | 설명 |
|------|------|
| `get_font_info` | 폰트 메타데이터 |
| `read_font_bytes` | 폰트 파일 바이트 (base64) |
| `merge_fonts` | 폰트 병합 (FontTools 필요) |

## 외부 도구 설치 관리

| 명령 | 설명 |
|------|------|
| `check_ffmpeg` / `download_ffmpeg` / `install_ffmpeg` | FFmpeg |
| `check_gs` / `download_gs` / `install_gs` | Ghostscript |
| `check_fonttools` / `download_fonttools` / `install_fonttools` | FontTools |

## 기타

| 명령 | 설명 |
|------|------|
| `get_google_drive_file_id` | Google Drive 파일 ID |
| `set_google_drive_offline` | 오프라인 설정 |
| `extract_hwp_text` | HWP 텍스트 추출 |
