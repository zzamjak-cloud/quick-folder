# 썸네일 캐시 시스템

## 캐시 레이어 (2단계)

```
1. 메모리 캐시 (thumbnailCache.ts)
   키: thumbKey(path, size) = `${path}::${size}`
   값: base64 data URL

2. 디스크 캐시 (Rust)
   위치: app_cache_dir/img_thumbnails/    ← 이미지
         app_cache_dir/psd_thumbnails/    ← PSD
   키: 파일경로 + 수정시각 + 크기 해시
```

## thumbnailCache.ts

### 위치
`components/FileExplorer/hooks/thumbnailCache.ts`

### exports
| 함수 | 설명 |
|------|------|
| `thumbKey(path, size)` | 캐시 키 생성 |
| `getThumb(path, size)` | 메모리 캐시 조회 (없으면 `undefined`) |
| `setThumb(path, size, dataUrl)` | 메모리 캐시 저장 |

## invokeQueue.ts / tauriInvoke.ts

### 위치
- `components/FileExplorer/hooks/invokeQueue.ts` — re-export (import 경로 유지)
- `utils/tauriInvoke.ts` — 실제 구현 (우선순위·취소·동시성)

### exports
| 함수 | 용도 |
|------|------|
| `queuedInvoke(cmd, args)` | 일반 우선순위 큐 |
| `queuedInvokeLow(cmd, args)` | 낮은 우선순위 (썸네일용) |
| `cancelAllQueued()` | 대기 중 모든 요청 취소 (폴더 이동 시 사용) |
| `invokeTauriCommand(cmd, args, priority)` | 저수준 invoke (테스트 mock 지원) |

## Rust 썸네일 명령

| 명령 | 입력 | 출력 | 설명 |
|------|------|------|------|
| `get_file_thumbnail` | `path, size: u32` | base64 string | 이미지 썸네일 |
| `get_file_thumbnail_path` | `path, size: u32` | 파일 경로 | 이미지 썸네일 경로 |
| `get_video_thumbnail` | `path, size: u32` | base64 string | 비디오 첫 프레임 |
| `get_video_thumbnail_path` | `path, size: u32` | 파일 경로 | 비디오 썸네일 경로 |
| `get_psd_thumbnail` | `path, size: u32` | base64 string | PSD 썸네일 |
| `get_file_icon` | `path: String` | base64 string | 네이티브 파일 아이콘 |
| `invalidate_thumbnail_cache` | `path: String` | — | 디스크 캐시 무효화 |

## 썸네일 로딩 흐름 (FileCard)
```
IntersectionObserver 진입
  → getThumb(path, size)  ← 메모리 캐시 확인
  → 캐시 미스: queuedInvokeLow('get_file_thumbnail', {path, size})
  → 응답: setThumb(path, size, dataUrl) + img src 업데이트
```

## 사전 로딩 (prewarmThumbnails)
`FileExplorer/index.tsx` — `loadDirectory` 완료 후 뷰포트 내 항목 썸네일 일괄 요청.

## 주의사항
- 썸네일은 반드시 **`queuedInvokeLow`** 사용. 일반 `invoke` 사용 시 폴더 전환 시 이전 요청이 취소되지 않아 UI 오염.
- 폴더 이동 시 `cancelAllQueued()` 호출 필수 (FileExplorer/index.tsx에서 처리).
- `ThumbnailSize` 타입: `40|60|80|100|120|160|200|240|280|320` — 이 값 외 사용 금지.
