# 썸네일 캐시 시스템

## 캐시 레이어 (2단계)

```
1. 메모리 캐시 (thumbnailCache.ts)
   키: thumbKey(path, size, modified) = `v4|${path}|${size}|${modified}`
   값: asset URL 또는 base64 data URL

2. 디스크 캐시 (Rust)
   위치: app_cache_dir/img_thumbnails/    ← 이미지
         app_cache_dir/psd_thumbnails/    ← PSD
         app_cache_dir/video_thumbnails/  ← 비디오
         app_cache_dir/drive_thumbnails/  ← Google Drive file ID 기반 이미지·비디오
         app_cache_dir/file_icons/        ← OS 네이티브 아이콘
   키: 썸네일은 생성 세대 + 파일경로 + 수정시각 + 파일크기 + 표시크기 해시
       Google Drive는 fileId + 표시크기 + 생성 세대
       아이콘은 platform + ext/folder + 표시크기 해시
   pruning: 전체 10GB 초과 시 mtime이 오래된 PNG부터 삭제
            캐시 hit 때 mtime을 갱신해 최근 사용 항목을 보존
   negative cache: 생성 결과가 없으면 같은 키의 `.none` sentinel 저장
                   재시작 후에도 깨진/미지원 파일 재시도 방지
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
| `get_psd_thumbnail_path` | `path, size: u32` | 파일 경로 | PSD 썸네일 경로 |
| `get_video_thumbnail` | `path, size: u32` | base64 string | 비디오 첫 프레임 |
| `get_video_thumbnail_path` | `path, size: u32` | 파일 경로 | 비디오 썸네일 경로 |
| `get_psd_thumbnail` | `path, size: u32` | base64 string | PSD 썸네일 |
| `get_file_icon` | `path, size: u32` | base64 string | 네이티브 파일 아이콘 (`file_icons` 디스크 캐시 사용) |
| `invalidate_thumbnail_cache` | `path: String` | — | 디스크 캐시 무효화 |

## Google Drive file ID 캐시

Google Drive 경로는 `get_google_drive_file_id`와 같은 ID 추출 로직을 내부에서 재사용한다. 파일 ID를 얻으면 `app_cache_dir/drive_thumbnails/{fileId}_{size}_v3.png`를 먼저 조회하고, 없을 때만 OS/File Provider 썸네일을 먼저 요청한다. OS 썸네일이 없을 때만 일반 이미지 디코딩으로 폴백한다. 파일 ID를 얻지 못하면 기존 path 기반 `img_thumbnails`/`video_thumbnails` 캐시로 폴백한다.
`_v5` 세대는 QuickLook(정사각 잘림/왜곡)을 쓰던 잘린 캐시(`_v4` 이하)를 자동 미스 처리해 디코딩/임베드 기반 비율 보존 썸네일로 다시 생성하기 위한 버전이다. 캐시 무효화 시 현재 세대와 기존 세대 파일을 같이 제거한다.

### 클라우드 이미지 비율 보존 (절대 잘림 금지) + 메모리 가드
`generate_cloud_image_thumbnail_bytes`는 **실제 이미지 디코딩 우선**(`image::thumbnail` = 비율 보존), 디코딩 실패 시에만 QuickLook 폴백이다. QuickLook(`get_os_thumbnail`)은 비정사각 이미지를 정사각으로 잘라/왜곡해 반환하므로 이미지 썸네일에는 신뢰하지 않는다. dataless 클라우드 파일은 디코딩이 다운로드를 유발할 수 있으나 잘림 방지를 우선한다.
- **메모리 가드**: 파일 읽기(다운로드, I/O)는 동시성 제한 없이 24-wide 유지하되, 메모리를 크게 쓰는 **디코딩만** `HeavyOpPermit`(동시 `MAX_HEAVY_OPS`=3)으로 제한한다 — 대용량 이미지가 동시에 디코딩될 때 RGBA 버퍼 폭증으로 OOM/크래시 나는 것을 방지. `std::fs::read`(퍼밋 밖) → `image::load_from_memory`(퍼밋 안)로 I/O와 디코딩을 분리한다. ICO/ICNS는 작고 특수 처리라 기존 경로 사용.

### 영상 썸네일 비율 보존
영상도 **비율 보존 네이티브 추출만** 사용한다(`get_native_video_thumbnail`: macOS AVFoundation `maximumSize` / Windows shell `SIIGBF_RESIZETOFIT` — 둘 다 비율 유지). 과거 클라우드 영상은 QuickLook 우선이었으나 정사각으로 잘려 PSD·이미지와 동일하게 제거했다. 네이티브 추출 실패 시 아이콘 폴백(잘린 썸네일을 만들지 않음).
프론트는 Google Drive 같은 cloud path에서 path 기반 `img_thumbnails`/`video_thumbnails` URL을 선반영하지 않는다. Rust가 실제 cache path를 반환한 뒤에만 `<img>`에 넣어 새로고침 직후 asset 404를 피한다.
PSD/PSB는 그리드에서 `get_psd_thumbnail_path`를 사용한다.

### PSD 썸네일 경량 추출 (용량 무관) — 단, 크기별 분기
`generate_psd_thumbnail_bytes`는 **요청 크기(size)에 따라** 경로가 갈린다:
- **그리드(size 1~320)**: 임베드 썸네일(8BIM 1036, JPEG) 우선 추출(`extract_psd_embedded_thumbnail`). 파일 앞부분(헤더+이미지 리소스, 레이어 데이터 *이전*)만 읽어 용량 무관·합성 없음. 임베드가 없으면 전체 파싱 폴백.
- **미리보기/컬럼뷰**: 그리드와 **별도 명령·캐시·생성 함수**를 쓴다(아래 "미리보기 전용 전체 렌더" 참고). 임베드(~160px)를 건너뛰고 항상 전체 합성 → 선명.
- 스페이스바 미리보기(`usePreview`)는 원본(size 0) 대신 **2048px 캡**으로 호출 — 4000px+ 원본 풀렌더 낭비를 막아 렌더·base64·표시를 빠르게. 컬럼뷰(`useColumnView`)는 1024.

### 미리보기 전용 전체 렌더 (`get_psd_thumbnail`) — 그리드와 완전 분리
미리보기는 size가 커도 **임베드 단축 없이 항상 전체 합성**으로 선명해야 한다. 그리드(`get_psd_thumbnail_path` → `generate_psd_thumbnail_bytes`, 임베드 우선·빠름)와 다음과 같이 분리한다:
- 미리보기 명령 `get_psd_thumbnail`은 `generate_psd_preview_bytes` 사용 → 임베드 건너뛰고 `render_psd_full`(공용 전체 합성 헬퍼)로 전체 파싱.
- **캐시 분리**: 로컬 미리보기는 `psd_previews` 디렉터리(그리드 `psd_thumbnails`와 별도)에 캐시 → 과거 저해상도 임베드 캐시와 키 충돌 없음. 클라우드는 `ensure_google_drive_thumbnail`(fileId+size+`_v5`, size 1024/2048은 그리드 40~320과 겹치지 않음).
- **클라우드 dataless여도 전체 다운로드 감수**: 미리보기는 사용자의 명시적 1회 동작이므로 `render_psd_full`의 `std::fs::read`가 전체 다운로드를 유발해 선명 렌더. (그리드는 dataless면 임베드만 — 부분 읽기 유지)
- **OOM 가드**: 미리보기 전체 합성 상한 `MAX_PREVIEW_PARSE_BYTES = 1GB`(그리드는 200MB). 초과 시 임베드 폴백.
- **`render_psd_full`은 `HeavyOpPermit`을 직접 잡지 않는다** — 로컬 경로는 호출자(`ensure_cached_thumbnail`/`cached_thumbnail`, `use_heavy_op=true`)가 이미 퍼밋 보유. 여기서 또 잡으면 **이중 획득 → 슬롯(MAX_HEAVY_OPS=3) 고갈 → 데드락/직렬화**로 미리보기 "로딩중"이 길어진다(회귀 주의).
- **그리드는 여전히 임베드(~160px)** — 그리드 줌을 키워도 임베드 한계로 더 선명해지지 않는다(속도 우선 설계). 선명한 큰 화면은 미리보기가 담당.

### 미리보기 = 끝부분 merged composite만 부분 읽기 (`extract_psd_merged_composite`)
대용량 PSD(수백 MB~GB)는 전체 레이어 합성(`psd.rgba()`)이 **전체 파일 읽기 + 모든 레이어 소프트 합성**이라 수~십수 초 걸리고, 클라우드면 전체 다운로드까지 유발한다. 핵심: **최종 이미지는 캔버스 크기일 뿐 작다**(예: 138MB PSD인데 캔버스 720×1280 — 138MB는 레이어·XMP 메타데이터). 그래서 미리보기는 레이어를 합성하지 않고, PSD 끝의 **merged composite(Photoshop 최대 호환성 저장 시 담기는 평탄화 전체 해상도 이미지)** 만 읽는다.

`extract_psd_merged_composite(path, size)` 동작:
1. 헤더에서 width/height/channels/depth/color_mode 파싱.
2. Color Mode·Image Resources 섹션은 **길이만 읽고 `seek`로 건너뜀**(XMP 14MB 등 내용 안 읽음).
3. Layer & Mask Information 섹션 **길이(PSD=4B / PSB=8B)만 읽고 그만큼 `seek`로 건너뜀** → 거대한 레이어 데이터(예: 129MB) 다운로드/파싱 회피.
4. 파일 끝 Image Data 섹션만 읽어 디코드: 압축 raw(0)/RLE(1·PackBits), planar 채널 → RGBA.
- **클라우드 효과**: File Provider는 seek+부분 읽기로 해당 구간만 받음 → 138MB 중 **~0.5MB만 다운로드**(검증됨). 레이어 합성도 안 함 → 즉시.
- **지원 범위**: 8-bit, RGB/Grayscale, raw/RLE. 그 외(16/32-bit, CMYK/Lab, ZIP, 최대호환성 끔)는 `None` → **임베드 썸네일 → 전체 레이어 합성(`render_psd_full`)** 순 폴백.
- **메모리 가드**: 캔버스 100MP 초과는 폴백.

`generate_psd_preview_bytes` 폴백 순서: **merged composite → 임베드 → 전체 합성(≤1GB)**.

프론트(`usePreview.handlePreviewImage`)는 PSD를 `get_psd_thumbnail`(size **1280**) 단건 호출. `imageLoadRequestRef` 토큰으로 빠른 전환 시 오래된 응답을 무시. 첫 렌더 후 `psd_previews`(로컬)/drive(클라우드) 캐시 HIT로 재방문 즉시 표시. 컬럼뷰(`useColumnView`, size 1024)도 같은 명령이라 자동 적용.

### 미리보기 프리워밍 (`usePreviewPrewarm` + `prewarm_psd_preview`)
스페이스바 미리보기를 즉시 띄우기 위해 **선택된 PSD의 composite를 백그라운드로 미리 데운다**.
- 프론트 `usePreviewPrewarm`(`usePreviewRouting.ts`): `selectedPaths`가 단일 PSD일 때 250ms 디바운스 후 `queuedInvokeLow('prewarm_psd_preview', {path, size:1280})`. 저우선 큐라 폴더 이동 시 `cancelAllQueued`로 자동 취소. 맥 PSB는 QuickLook으로 미리보기하므로 프리워밍 제외.
- Rust `prewarm_psd_preview`: `resolve_psd_preview_cache`(미리보기 표시 명령 `get_psd_thumbnail`과 **동일 캐시 키 공유**)를 호출해 캐시만 데우고 **바이트는 반환하지 않음**(IPC 경량). composite는 ~0.5MB 부분 읽기라 프리워밍 비용이 작다.
- 효과: 파일을 선택만 해두면 스페이스바 시 캐시 HIT → 즉시 표시.
- 로컬 썸네일 캐시 키는 `thumbnail-v4` (Rust `stable_thumbnail_cache_key` ↔ 프론트 `getPersistentThumbUrl` 동일해야 함). 임베드 최적화 도입 후 작게 캐시된 미리보기(size 0/1024)를 무효화하려고 v3→v4로 올렸다.
- 주의: 임베드 썸네일은 Photoshop 저장 옵션에 의존한다. 구버전/스크립트 생성 PSD는 1036 리소스가 없어(예: XMP만 큰 경우) QuickLook/형제 이미지로만 표시된다.
- **PSB(대용량 포맷)도 동일 추출 경로**를 쓴다(헤더 version 2지만 이미지 리소스 섹션은 4바이트 길이로 동일). 단, `classify_file`(`types.rs`)에서 `psb`를 `FileType::Image`로 분류해야 FileCard 썸네일 효과가 실행된다. 분류가 빠지면 썸네일 시도조차 안 한다.

### CloudStorage PSD — 부분 읽기로 임베드 추출 (비율 보존, QuickLook 미사용)
구글드라이브 File Provider는 **부분 다운로드**를 지원한다(앞 128KB 읽으면 ~4MB 청크만 받음, 전체 X). 임베드 썸네일(1036)은 파일 앞부분에 있으므로, **dataless여도 앞부분만 읽어 추출**한다 → 대용량(수십~수백 MB) PSD도 전체 다운로드 없이 비율 보존 썸네일을 얻는다.
- dataless 판정은 `is_dataless_cloud_file`(macOS **SF_DATALESS 플래그**). blocks 기준은 부분 읽기 후 0이 아니게 되어 오판하므로 플래그로 판정한다.
- 클라우드 PSD 경로: dataless → `extract_psd_embedded_thumbnail`만(부분 읽기). 다운로드됨 → `generate_psd_thumbnail_bytes`(임베드+전체파싱, 둘 다 비율 보존).
- **QuickLook(`get_os_thumbnail`)은 PSD 경로에서 쓰지 않는다** — 비정사각을 정사각으로 잘라/왜곡하기 때문(이미지 경로와 동일 원칙). 임베드도 없고 전체파싱도 불가(dataless)면 아이콘 폴백.
- 캐시 세대 `_v5`: QuickLook 잘림/스킵으로 저장된 `_v4` 이하 캐시·negative cache를 무효화한다.

### 동일 이름 이미지 형제
`useDirectoryLoader`의 `attachPsdThumbnailSiblings`가 PSD와 동일 이름 이미지(png/jpg/…)를 찾으면 `FileEntry.thumbnailPath`로 지정한다. FileCard는 이 경우 PSD 대신 형제 이미지를 `get_file_thumbnail_path`로 썸네일링한다(QuickLook/원본 파싱 회피). 단, 형제가 PSD와 다른 내용이면 부정확할 수 있는 휴리스틱.

### 동시성 레인 / 중복 다운로드 제거
- 일반 우선순위(`MAX_CONCURRENT=6`)와 저우선(썸네일, `MAX_LOW_CONCURRENT=24`)을 **독립 레인**으로 처리한다(`tauriInvoke.ts`). 클라우드 썸네일은 파일당 File Provider 네트워크 왕복이 지배적이라 동시 다운로드 수가 곧 처리량 — 네트워크 대기형이므로 높여도 안전(CPU 합성은 Rust heavy-op 퍼밋이 별도 제한). `ensure_thumbnails_batch`는 청크(12) 병렬.
- **in-flight dedup**(`ensure_google_drive_thumbnail`의 `drive_thumbnail_inflight_lock`): 같은 fileId+size를 prewarm 배치와 가시 카드가 동시에 요청하면 같은 청크를 두 번 다운로드한다. per-key 락으로 직렬화하고 락 획득 후 캐시를 재확인해 **한 번만 다운로드**한다(PSD는 파일당 ~4MB 청크라 효과 큼).

## 썸네일 로딩 흐름 (FileCard)
```
IntersectionObserver 진입 전 선요청
  → getThumb(path, size)  ← 메모리 캐시 확인
  → 캐시 미스: queuedInvokeLow('get_file_thumbnail', {path, size})
  → 응답: setThumb(path, size, dataUrl) + img src 업데이트
```
FileCard는 실제 그리드 스크롤 컨테이너를 `IntersectionObserver.root`로 사용하고, `rootMargin`으로 화면 진입 전에 썸네일 요청을 시작한다. Google Drive 같은 cloud path는 더 큰 선요청 범위와 eager 이미지 로드를 사용해 File Provider 지연을 흡수한다. 카드가 선요청 범위를 벗어나면 pending 요청을 취소해 빠른 스크롤 중 지나간 항목이 큐를 계속 점유하지 않게 한다.

## 사전 로딩 (prewarmThumbnails)
`useDirectoryLoader` — `loadDirectory` 완료 후 앞쪽 최대 120개 이미지/비디오/PSD 항목을 `ensure_thumbnails_batch` 1회로 묶어 Rust에서 캐시를 보장한다(클라우드 포함). 개별 카드의 lazy 로딩은 그대로라 batch 실패 시 단건 요청으로 폴백된다.
- **결과를 메모리 캐시에 주입**: `ensure_thumbnails_batch`는 입력과 **1:1 순서**로 `cachedPath`를 반환하고(Rust에서 join 실패 시에도 순서·개수 보장), prewarm이 이를 카드의 `thumbKey(entry.path, size, modified)`로 `setThumb`한다. → prewarm된 항목은 카드가 마운트/스크롤 진입 시 `getThumb` 동기 HIT로 **IPC 없이 즉시 표시**(특히 cloud는 카드가 경로를 동기적으로 알 다른 방법이 없어 효과 큼). PSD-형제 항목은 요청 경로(형제 이미지)와 무관하게 **원래 PSD 엔트리 키**로 주입한다.
- 최초 화면의 첫 페인트는 카드가 즉시 발사하는 단건 요청이 담당하므로, 주입의 이득은 주로 스크롤 진입 항목 + 저우선 레인 여유에 있다.

## 가시 카드 우선순위 / 큐 오버플로우 주의
- 저우선 큐가 가득 차면 **가장 오래된(=먼저 보인 상단) 항목부터 제거**된다(`tauriInvoke.ts`). 한 폴더의 가시 카드가 한꺼번에 요청하면 상단 요청이 버려져 "하단부터 뜨는" 증상이 생긴다. → `MAX_LOW_QUEUE_SIZE`는 가시 카드 수+프리페치 마진을 넉넉히 수용해야 한다(현재 512).
- 이미지 카드는 가시화 시 썸네일 외에 `get_image_dimensions`도 요청한다. 이를 **썸네일 표시 이후로 지연**해(FileCard, `thumbnail` 의존) 초기 진입 시 큐를 2배로 점유하지 않게 한다. 안 그러면 카드당 2요청 → 큐 오버플로우 → 상단 썸네일 누락.
- 카드는 프리페치 마진(`rootMargin`, 클라우드 1800px)을 벗어나면 pending 요청을 스스로 취소하므로, 스크롤 staleness는 취소가 처리한다. 큐 제거는 안전판일 뿐 평상시엔 발생하지 않아야 한다.

## 주의사항
- 썸네일은 반드시 **`queuedInvokeLow`** 사용. 일반 `invoke` 사용 시 폴더 전환 시 이전 요청이 취소되지 않아 UI 오염.
- 폴더 이동 시 `cancelAllQueued()` 호출 필수 (FileExplorer/index.tsx에서 처리).
- `ThumbnailSize` 타입: `40|60|80|100|120|160|200|240|280|320` — 이 값 외 사용 금지.
- 네이티브 아이콘 캐시는 파일 내용이 아니라 OS/확장자/폴더 타입 기준이다. 파일별 커스텀 아이콘을 정확히 보여야 하는 기능에서는 별도 키 정책이 필요하다.
