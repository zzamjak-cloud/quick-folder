# 스프라이트 시트 & 맵메이커

## 스프라이트 시트 패킹 (SheetPackerModal.tsx)

### 위치
`components/FileExplorer/SheetPackerModal.tsx`

### Rust 명령
| 명령 | 파라미터 | 설명 |
|------|----------|------|
| `sprite_sheet_preview` | `paths[], cols, cell_w, cell_h` | 미리보기 (base64) |
| `save_sprite_sheet` | `paths[], cols, cell_w, cell_h, dest` | 시트 저장 |

### Rust 내부 구현
`helpers.rs::create_sprite_canvas(images, cell_w, cell_h, cols, rows)` — 이미지 그리드 배치 캔버스 생성

---

## 스프라이트 시트 언패킹 (SheetUnpackModal.tsx)

### 위치
`components/FileExplorer/SheetUnpackModal.tsx`

### Rust 명령
| 명령 | 파라미터 | 설명 |
|------|----------|------|
| `split_sprite_sheet` | `path, cols, rows, dest_dir` | 시트를 개별 이미지로 분리 |

---

## 맵메이커 / Laigter (MapMakerModal.tsx)

### 위치
`components/FileExplorer/MapMakerModal.tsx`  
`components/FileExplorer/LaigterLitPreview.tsx`

### Rust 명령
| 명령 | 파라미터 | 설명 |
|------|----------|------|
| `laigter_maps_preview` | `path` | 노멀맵 미리보기 (base64) |
| `laigter_maps_export` | `path, dest_dir` | 맵 파일 내보내기 |

`.laigter` 파일 선택 후 Space 키로 `LaigterLitPreview` 열림.
