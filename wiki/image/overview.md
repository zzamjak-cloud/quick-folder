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
| `pixelate_preview` | `path, block_size` | 픽셀화 미리보기 (base64) |
| `pixelate_image` | `path, block_size, dest` | 픽셀화 저장 |

단축키: `Ctrl+Shift+P`

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
