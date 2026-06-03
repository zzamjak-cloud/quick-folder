# Rust 명령 레퍼런스

전체 `#[tauri::command]` 함수 목록. 등록 위치: `src-tauri/src/lib.rs`

## 파일 시스템

| 명령 | 파라미터 | 반환 | 설명 |
|------|----------|------|------|
| `open_folder` | `path: String` | `()` | OS 파일 탐색기로 열기 |
| `select_folder` | — | `Option<String>` | 네이티브 폴더 선택 다이얼로그 |
| `list_directory` | `path: String` | `Vec<FileEntry>` | 폴더 내용 나열 |
| `create_directory` | `path: String` | `()` | 새 폴더 생성 |
| `rename_item` | `path, new_name: String` | `String` | 이름 변경 (새 경로 반환) |
| `is_directory` | `path: String` | `bool` | 폴더 여부 확인 |
| `read_text_file` | `path: String` | `String` | 텍스트 파일 읽기 |
| `write_text_file` | `path, content: String` | `()` | 텍스트 파일 쓰기 |
| `create_text_file` | `path: String` | `()` | 빈 텍스트 파일 생성 |
| `list_system_roots` | — | `Vec<String>` | 루트 드라이브 목록 |

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

## 클립보드 & 시스템

| 명령 | 파라미터 | 설명 |
|------|----------|------|
| `copy_path` | `path: String` | 경로 텍스트 클립보드 복사 |
| `write_files_to_clipboard` | `paths: Vec<String>` | 파일을 OS 클립보드에 등록 |
| `read_files_from_clipboard` | — | OS 클립보드 파일 목록 |
| `paste_image_from_clipboard` | `dest: String` | 이미지 → PNG 저장, 경로 반환 |
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
| `search_files` | `dir, query: String` | 파일 검색 |

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
