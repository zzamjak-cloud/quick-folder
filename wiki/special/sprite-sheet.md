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

### 경계 처리 (회귀 방지)
`LaigterParams.tile` (기본 `true`, serde default로 구버전 설정 호환):
- `true`: 블러·소벨·오클루전 모두 wrap(주기) 샘플링 → 타일링 텍스처에 이음새 없는 맵
- `false`: clamp 샘플링 (비타일링 스프라이트용)

**주의**: 가장자리 픽셀을 평면 노멀 `(0,0,1)` 단색으로 강제하면 안 된다 — 외곽 1px 단색 라인이 생겨 타일링이 깨진다.
회귀 테스트: `laigter_maps.rs`의 `#[cfg(test)]` (순환 이동 불변성 + 외곽 단색 검사).
