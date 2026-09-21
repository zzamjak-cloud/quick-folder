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
| `pixelate_preview` | `input, pixel_size, scale, max_colors` | 픽셀화 미리보기 (base64) |
| `pixelate_image` | `input, pixel_size, scale, max_colors` | 픽셀화 저장 |

단축키: `Ctrl+Shift+P`

구현: `crates/quickfolder-core/src/image_ops/pixelate.rs`

#### 알고리즘 (선명도 핵심 4가지)

단순히 축소→확대하면 외곽이 뿌옇게 뭉개진다. 네 가지로 막는다.

| 단계 | 하는 일 | 안 하면 |
|------|---------|---------|
| **격자 위상 감지** (`detect_phase`) | 셀 경계 후보마다 실제 색 변화가 몰린 정도(enrichment)를 재서 가장 맞는 위상을 고른다 | 이미 픽셀 격자가 있는 이미지에서 블록이 두 색에 걸쳐 경계가 흐려진다 |
| **코어 최빈색** (`cell_representative_color`) | 셀 중앙 60%(`CORE_RATIO`)의 최빈색을 쓴다. 5bit RGB 버킷으로 묶고 승자 버킷 안에서만 평균 | 평균은 흐린 경계를 섞어 **원본에 없던 중간색**을 만들고, 단일 샘플(Nearest)은 하필 경계 픽셀이 뽑히면 그 색이 블록 전체를 대표한다 |
| **알파 이진화** | 코어 과반이 투명하면 알파 0, 아니면 255 | 안티앨리어싱된 반투명 외곽이 그대로 살아남아 **외곽선이 뿌옇게 보인다** (실측: 128px 결과의 외곽 블록 10.4%가 반투명이었다) |
| **정수배 NN 확대** (`upscale_nearest`) | 논리 해상도에서 정수배로만 키운다 | 소수 배율은 블록 폭이 들쭉날쭉해져 픽셀이 다시 뭉개진다 |

팔레트는 **빈도 가중 최원점(maximin) 초기화 + k-means**(`build_palette`). median-cut을 쓰지 않는
이유는 균등 인구 분할이 색 클러스터 경계를 존중하지 않아 인접한 두 색을 합치고 다른 색을
둘로 쪼개는 초기값을 만들기 때문이다 — k-means가 그 지역해에서 못 빠져나온다.

> `scale`(출력 크기)은 **정수배로 내림된다.** 논리 16px에 100을 요청하면 배율 6 → 96px가 나온다.
> 정확한 크기보다 픽셀의 선명함을 우선한 결정이다.

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
