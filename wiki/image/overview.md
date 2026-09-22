# 이미지 처리

## Rust 모듈
`src-tauri/src/modules/image_ops.rs`

## 지원 입력 형식
`image` crate: JPEG, PNG, GIF, WebP, BMP, ICO  
`psd` crate: PSD (Adobe Photoshop)

## 기능별 Rust 명령

### 정보 조회
| 명령 | 파라미터 | 설명 |
|------|----------|------|
| `get_image_dimensions` | `path` | 가로·세로 픽셀 반환 |

### 자르기
| 명령 | 파라미터 | 설명 |
|------|----------|------|
| `crop_image` | `path, x, y, width, height, dest` | 이미지 자르기 |

UI: `ImageCropOverlay.tsx` — 드래그로 영역 선택

### 압축
| 명령 | 파라미터 | 설명 |
|------|----------|------|
| `compress_image_preview` | `path, quality` | 압축 미리보기 (base64 반환) |
| `compress_image` | `path, quality, dest` | 실제 압축 저장 |

### 리사이즈
| 명령 | 파라미터 | 설명 |
|------|----------|------|
| `resize_image` | `path, width, height, dest` | 이미지 리사이즈 |

### 픽셀화 (PixelateModal.tsx)
| 명령 | 파라미터 | 설명 |
|------|----------|------|
| `pixelate_preview` | `input, pixel_size, scale, max_colors` | 픽셀화 미리보기 (base64) — **저장 결과와 같은 이미지** |
| `pixelate_image` | `input, pixel_size, scale, max_colors` | 픽셀화 저장 |
| `clear_pixelate_preview_cache` | — | 미리보기 디코딩 캐시 해제 (팝업 닫을 때) |

단축키: `Ctrl+Shift+P`

구현: `crates/quickfolder-core/src/image_ops/pixelate.rs`

#### 파라미터는 `pixel_size` 하나가 기준이다

UI에는 **픽셀 크기** 슬라이더(1~32)와 **원본 크기 유지** 체크박스만 있다. 출력 크기를 따로
고르게 하지 않는다 — 두 값이 서로를 제약해(`pixel_size ≤ scale/2`) 어느 쪽을 움직여야
원하는 결과가 나오는지 알기 어려웠다. 지금은 출력 크기가 `pixel_size`에서 파생된다.

| `scale` | 출력 | 용도 |
|---------|------|------|
| `0` | 원본 규격 그대로 (`expand_to_grid`) | **원본 크기 유지** — 크기는 안 건드리고 픽셀만 정리. AI 생성 이미지의 흐린 블록 경계 정돈 |
| `1` | 논리 해상도 (`w/pixel_size × h/pixel_size`) | 실제 픽셀아트 에셋으로 축소 |
| `>1` | 긴 변이 `scale` 이하가 되도록 정수배 확대 | CLI·MCP 전용 (UI는 안 씀) |

`scale = 0` 은 위상 앞 자투리(`0..offset`)도 셀로 포함한다(`cell_bounds(include_leading)`).
안 그러면 위상이 감지된 이미지에서 좌·상단에 칠되지 않은 띠가 남는다. 축소 출력에서는
반대로 그 자투리를 버린다 — 자투리가 블록 하나를 통째로 차지해 비율이 틀어진다.

#### 알고리즘 (선명도 핵심 4가지)

단순히 축소→확대하면 외곽이 뿌옇게 뭉개진다. 네 가지로 막는다.

| 단계 | 하는 일 | 안 하면 |
|------|---------|---------|
| **격자 위상 감지** (`detect_phase`) | 셀 경계 후보마다 실제 색 변화가 몰린 정도(enrichment)를 재서 가장 맞는 위상을 고른다 | 이미 픽셀 격자가 있는 이미지에서 블록이 두 색에 걸쳐 경계가 흐려진다 |
| **코어 최빈색** (`cell_representative_color`) | 셀 중앙 60%(`CORE_RATIO`)의 최빈색을 쓴다. 5bit RGB 버킷으로 묶고 승자 버킷 안에서만 평균 | 평균은 흐린 경계를 섞어 **원본에 없던 중간색**을 만들고, 단일 샘플(Nearest)은 하필 경계 픽셀이 뽑히면 그 색이 블록 전체를 대표한다 |
| **알파 이진화** | 코어 과반이 투명하면 알파 0, 아니면 255 | 안티앨리어싱된 반투명 외곽이 그대로 살아남아 **외곽선이 뿌옇게 보인다** (실측: 128px 결과의 외곽 블록 10.4%가 반투명이었다) |
| **정수배 NN 확대** (`upscale_nearest`) | 논리 해상도에서 정수배로만 키운다 | 소수 배율은 블록 폭이 들쭉날쭉해져 픽셀이 다시 뭉개진다 |

#### 미리보기 캐시

미리보기가 저장과 같은 전체 경로를 돌게 됐으므로, 속도는 캐시로 만회한다. 비싼 단계는
둘 다 **컬러 수와 무관**하다는 점을 이용한다.

| 캐시 대상 | 무엇에 의존 | 아끼는 것 |
|-----------|-------------|-----------|
| 디코딩본 (RGBA 1개) | 파일 | `image::open` + RGBA 변환 |
| 논리 이미지 (최대 8개) | (셀 크기, 원본 크기 유지) | 위상 감지 + 전체 픽셀 주사 |

2048x1536 실측(릴리스):

| 동작 | 시간 |
|------|------|
| 첫 미리보기 | 141ms |
| 컬러 수만 변경 | **48ms** |
| 픽셀 크기 변경 | 97ms |
| 이전 픽셀 크기로 복귀 | **51ms** |

- **한 파일분만** 유지한다. 다른 파일을 미리보기 시작하면 이전 항목을 통째로 버린다.
- 팝업이 닫히면 `clear_pixelate_preview_cache` 로 **즉시** 해제한다(모달 언마운트 effect).
  4000x4000 이미지면 64MB라 팝업이 닫힌 뒤까지 들고 있을 이유가 없다.
- 40MP 를 넘는 이미지는 아예 캐시하지 않는다(`PREVIEW_CACHE_MAX_PIXELS`).
- 파일 크기·수정 시각이 바뀌면 캐시를 무시하고 다시 읽는다.
- `pixelate_image`(저장)는 캐시를 쓰지 않는다 — 배치 처리에서 여러 파일이 동시에 도는데
  한 칸짜리 캐시가 계속 교체되기만 하고 락 경합만 는다.

#### 성능 — 느리면 여기부터 본다

2048x1536 기준 단계별 실측(릴리스, 원본 크기 유지 + 16컬러):

| 단계 | 시간 | 비고 |
|------|------|------|
| `image::open` | 28ms | 미리보기는 캐시로 2회차부터 건너뛴다 |
| `detect_phase` | 25ms | 전체 픽셀 2회 주사 — 남은 가장 큰 덩어리. 논리 캐시에 함께 걸린다 |
| `downsample_to_logical` | 11ms | |
| `quantize_colors` | 19ms | |
| `expand_to_grid` | 2ms | |
| PNG 인코딩 | 5ms | 블록이 커서 잘 압축된다 |

세 가지가 결과를 바꾸지 않으면서 크게 먹혔다(전부 골든 지문 동일):

- **셀마다 `HashMap` 을 새로 만들지 않는다** (`ModeScratch`). 버킷 키가 15비트뿐이라 배열
  하나를 이미지당 한 번 잡고 셀마다 건드린 키만 되돌린다 — 47ms → 11ms.
- **경계 강도 주사를 행 우선으로** 바꾸고 원시 버퍼를 반복자로 짝지어 훑는다. 열을 따라
  내려가면 매 접근이 한 행씩 건너뛰어 캐시를 놓친다. 누적 순서는 그대로라 결과가 같다.
- **팔레트 최원점 초기화의 최근접 거리를 증분 갱신**한다. 센터를 추가할 때마다 전체 센터를
  다시 훑으면 O(k² x 색수)가 된다 — 새 센터와의 거리로 min 만 갱신하면 O(k x 색수)다.
- `expand_to_grid`·`upscale_nearest` 는 한 행만 채우고 나머지 행은 통째로 복사한다.

> **`tauri dev` 가 유독 느리면 프로파일을 확인한다.** 이 크레이트는 `Cargo.toml` 의
> `[profile.dev.package.quickfolder-core] opt-level = 1` 로 개발 빌드에서도 최적화해
> 컴파일한다. 0 이면 같은 픽셀화가 미리보기 300ms / 저장 810ms 로 10배 가까이 느려져,
> 개발 중에 "느리다"는 판단 자체가 빗나간다.

팔레트는 **빈도 가중 최원점(maximin) 초기화 + k-means**(`build_palette`). median-cut을 쓰지 않는
이유는 균등 인구 분할이 색 클러스터 경계를 존중하지 않아 인접한 두 색을 합치고 다른 색을
둘로 쪼개는 초기값을 만들기 때문이다 — k-means가 그 지역해에서 못 빠져나온다.

> `scale > 1` 의 확대는 **정수배로 내림된다.** 논리 16px에 100을 요청하면 배율 6 → 96px가 나온다.
> 정확한 크기보다 픽셀의 선명함을 우선한 결정이다. 원본 규격을 정확히 맞춰야 하면 `scale = 0`
> 을 쓴다 — 확대 대신 셀 영역을 되칠하므로 1px도 어긋나지 않는다.

#### 미리보기 패널 (모달)

미리보기는 **하나**이고, 거기 보이는 것이 곧 저장될 파일이다. 확대 미리보기와 실제 크기를
따로 두면 각 패널이 좁아져 이미지가 잘리고, 두 곳의 배율이 달라 어느 쪽이 결과인지
헷갈린다. 큰 화면 하나에서 **100%로 시작해** 휠로 확대하고 드래그로 옮긴다.

| 버튼 | 하는 일 |
|------|---------|
| **맞춤** | 이미지 전체가 보이도록 축소 |
| **100%** | 1:1 — 화면 중앙에 보이던 지점을 유지한 채 배율만 1로 |
| **보기** | 같은 이미지를 전체화면에서 100%로 (다시 렌더하지 않는다) |

> **미리보기 = 저장 결과.** 예전에는 속도를 위해 300px로 줄인 뒤 픽셀화했는데, 축소본에
> 셀을 다시 잡는 것은 사실상 다른 계산이라(Lanczos 평균 vs 셀 코어 최빈색) 미리보기와
> 저장 결과의 색이 달랐다. 지금은 `pixelate_preview` 와 `pixelate_image` 가 같은
> `build_logical` → `finish_pixelate` 경로를 그대로 돌린다.
> `preview_matches_the_saved_output` 테스트가 두 결과의 **픽셀 일치**를 고정한다.
> 속도는 축소 대신 캐시로 만회한다(아래).

미리보기 PNG 가 곧 출력물이므로 **그 규격이 출력 규격**이다. 따로 원본 크기를 조회하지
않고, 1:1 로 그린 것이 100% 다 — 배율 계산이 끼어들 자리가 없어 비율이 틀어질 수 없다.

확대·패닝은 `components/FileExplorer/ui/PanZoomView.tsx` 한 곳에 있다. 휠 리스너는
React `onWheel` 이 아니라 네이티브 `{ passive: false }` 로 붙인다 — React는 루트에 wheel을
passive로 걸어서 `preventDefault()` 가 먹지 않아 페이지가 같이 스크롤된다. 미리보기가
갱신돼도 뷰를 언마운트하지 않는다(스피너만 겹친다) — 슬라이더를 만질 때마다 확대·이동
위치가 날아가지 않게 하려는 것이다.

> **비율이 깨지면 먼저 `max-width` 를 의심한다.** Tailwind preflight 에 `img { max-width: 100% }`
> 가 있고, 이 제약은 인라인 `width` 보다 우선한다. 컨테이너보다 큰 이미지를 그리면 가로만
> 컨테이너 폭으로 잘려 들어가고 세로는 인라인 값 그대로 남아 **가로로 찌그러진다**.
> `PanZoomView` 와 `MapMakerModal` 의 원본 크기 이미지는 `maxWidth: 'none', maxHeight: 'none'`
> 을 명시해 이를 푼다 (`tests/ui/PanZoomView.test.tsx` 가 회귀를 막는다).

> 격자가 없는 일반 사진은 enrichment가 `MIN_PHASE_ENRICHMENT`(1.35)에 못 미쳐 위상 0으로
> 폴백한다. 억지로 격자를 씌우지 않는다.

같은 문제를 다루는 StyleStudio의 `src/lib/pixelart/pixelate.ts`(생성 직후 픽셀 정규화)와
접근이 같다. 그쪽은 격자 크기까지 자동 감지하지만, QuickFolder는 사용자가 `pixel_size`를
직접 주므로 위상만 감지한다.

### 배경 제거 (RemoveWhiteBgModal.tsx)
| 명령 | 파라미터 | 설명 |
|------|----------|------|
| `remove_white_bg_preview` | `path, threshold` | 배경 제거 미리보기 |
| `remove_white_bg_save` | `path, threshold, dest` | 배경 제거 저장 |

### 드로잉 주석
| 명령 | 파라미터 | 설명 |
|------|----------|------|
| `save_annotated_image` | `path, strokes, dest` | 주석 포함 이미지 저장 |

→ [../special/drawing.md](../special/drawing.md)

### 아이콘 변환
| 명령 | 설명 |
|------|------|
| `convert_to_ico` | PNG → Windows `.ico` |
| `convert_to_icns` | PNG → macOS `.icns` |

### GIF 압축 (GifCompressModal.tsx)
| 명령 | 의존 | 설명 |
|------|------|------|
| `compress_gif` | Ghostscript | GIF 압축 |

→ [../tools/overview.md](../tools/overview.md)

## UI 흐름
```
Space/Enter → usePreview.ts → PreviewModals.tsx
  ├── PreviewToolbar.tsx (줌, 자르기, 드로잉 토글)
  ├── ImageCropOverlay.tsx
  └── DrawingCanvas.tsx
```
