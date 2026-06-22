# 비디오·GIF 처리

## 의존성
**FFmpeg 필수** — `binaries/ffmpeg` 사이드카 바이너리.  
FFmpeg 없으면 이 섹션의 모든 기능 불가.  
→ [../tools/overview.md](../tools/overview.md)

## Rust 모듈
| 파일 | 역할 |
|------|------|
| `src-tauri/src/modules/tool_ops/ffmpeg.rs` | FFmpeg 설치·경로 확인 |
| `src-tauri/src/modules/media_ops/video.rs` | 비디오 명령 facade |
| `src-tauri/src/modules/media_ops/video/compress.rs` | 비디오 압축 |
| `src-tauri/src/modules/media_ops/video/edit.rs` | trim/cut |
| `src-tauri/src/modules/media_ops/video/concat.rs` | 비디오 이어붙이기 |
| `src-tauri/src/modules/media_ops/video/gif.rs` | 비디오 → GIF |
| `src-tauri/src/modules/media_ops/video/progress.rs` | FFmpeg 진행률 파싱 |

## 비디오 명령

| 명령 | 파라미터 | 단축키 | 설명 |
|------|----------|--------|------|
| `compress_video` | `path, quality, dest` | Ctrl+Shift+P | 비디오 압축 |
| `trim_video` | `path, start, end, dest` | — | 구간 자르기 |
| `cut_video` | `path, cuts[], dest` | — | 다중 컷 |
| `concat_videos` | `paths[], dest` | — | 이어붙이기 |
| `get_video_thumbnail` | `path, size` | — | 첫 프레임 썸네일 |
| `get_video_thumbnail_path` | `path, size` | — | 썸네일 경로 반환 |

## GIF 명령

| 명령 | 파라미터 | 설명 |
|------|----------|------|
| `video_to_gif` | `path, fps, scale, dest` | 비디오 → GIF |
| `gif_to_mp4` | `path, dest` | GIF → MP4 |
| `compress_gif` | `path, dest` | GIF 압축 (Ghostscript) |

## PDF 압축
| 명령 | 의존 | 설명 |
|------|------|------|
| `compress_pdf` | Ghostscript | PDF 압축 |

## UI 컴포넌트

| 컴포넌트 | 역할 |
|---------|------|
| `VideoPlayer.tsx` | 재생·타임라인 |
| `VideoCropOverlay.tsx` | 구간 선택 오버레이 |
| `VideoEditToolbar.tsx` | 편집 도구 버튼 모음 |
| `GifCompressModal.tsx` | GIF 압축 옵션 |

## FFmpeg 설치 확인 명령
```typescript
invoke('check_ffmpeg')     // 설치 여부
invoke('download_ffmpeg')  // 다운로드
invoke('install_ffmpeg')   // 설치
```
