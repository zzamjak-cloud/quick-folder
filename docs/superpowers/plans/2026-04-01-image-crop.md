# 이미지 크롭(영역 추출) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미지 미리보기 모달에서 드래그로 사각형 영역을 선택하고, 해당 부분만 PNG 파일로 추출/저장하는 기능 추가

**Architecture:** Rust 백엔드에 `crop_image` 커맨드 추가 (image crate 활용). 프론트엔드는 Canvas 기반 `ImageCropOverlay` 컴포넌트를 새로 만들어 PreviewModals의 이미지 모달에 통합. 화면 좌표를 원본 이미지 픽셀 좌표로 변환하여 Rust에 전달.

**Tech Stack:** Rust (image crate), React 19, TypeScript, Canvas API, Tauri invoke

---

### Task 1: Rust `crop_image` 커맨드 추가

**Files:**
- Modify: `src-tauri/src/lib.rs` (커맨드 추가 + invoke_handler 등록)

- [ ] **Step 1: `crop_image` 커맨드 작성**

`lib.rs`에서 `remove_white_bg_save` 함수 앞 (배경 제거 섹션 시작 전, 약 482번 줄)에 다음 커맨드를 추가:

```rust
// ─── 이미지 크롭 ─────────────────────────────────────────────────────

#[tauri::command]
async fn crop_image(path: String, x: u32, y: u32, width: u32, height: u32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&path).map_err(|e| format!("이미지 열기 실패: {}", e))?;

        // 크롭 영역이 이미지 범위 내인지 검증
        let (iw, ih) = (img.width(), img.height());
        if x + width > iw || y + height > ih {
            return Err(format!(
                "크롭 영역이 이미지 범위를 벗어남: 이미지 {}x{}, 요청 ({},{}) {}x{}",
                iw, ih, x, y, width, height
            ));
        }

        let cropped = img.crop_imm(x, y, width, height);

        // 출력 경로: {stem}_crop.png
        let input_path = std::path::Path::new(&path);
        let parent = input_path.parent().unwrap_or(std::path::Path::new("."));
        let stem = input_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("image");

        let output_path = find_unique_path(parent, stem, "_crop", ".png");

        cropped
            .save_with_format(&output_path, image::ImageFormat::Png)
            .map_err(|e| format!("파일 저장 실패: {}", e))?;

        output_path
            .to_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "출력 경로 변환 실패".to_string())
    })
    .await
    .map_err(|e| format!("크롭 이미지 저장 실패: {}", e))?
}
```

- [ ] **Step 2: invoke_handler에 `crop_image` 등록**

`lib.rs` 하단의 `.invoke_handler(tauri::generate_handler![...])` 블록에서 `remove_white_bg_save,` 뒤에 추가:

```rust
        remove_white_bg_save,
        crop_image,
    ])
```

- [ ] **Step 3: 빌드 확인**

Run: `cd /Users/woody/Desktop/AI/QuickFolder/quick-folder && npm run tauri build -- --no-bundle 2>&1 | tail -5`

또는 개발 모드 컴파일 확인:

Run: `cd /Users/woody/Desktop/AI/QuickFolder/quick-folder/src-tauri && cargo check 2>&1 | tail -10`

Expected: 컴파일 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: crop_image Rust 커맨드 추가 — 이미지 영역 추출 후 {stem}_crop.png 저장"
```

---

### Task 2: `ImageCropOverlay` 컴포넌트 생성

**Files:**
- Create: `components/FileExplorer/ImageCropOverlay.tsx`

이 컴포넌트는 이미지 위에 겹쳐지는 Canvas 오버레이로, 드래그 선택·리사이즈·이동·Shift 비율 고정을 담당한다.

- [ ] **Step 1: 컴포넌트 파일 생성**

`components/FileExplorer/ImageCropOverlay.tsx` 파일을 생성:

```tsx
import React, { useRef, useState, useCallback, useEffect } from 'react';

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ImageCropOverlayProps {
  /** 이미지 요소의 표시 크기 */
  imageRect: { width: number; height: number; left: number; top: number };
  /** 원본 이미지의 실제 픽셀 크기 */
  naturalSize: { width: number; height: number };
  /** 테마 색상 */
  accentColor?: string;
  /** 크롭 저장 요청 (원본 픽셀 좌표) */
  onSave: (x: number, y: number, width: number, height: number) => void;
}

type DragMode = 'none' | 'create' | 'move' | 'nw' | 'ne' | 'sw' | 'se';

const HANDLE_SIZE = 8;
const MIN_CROP_SIZE = 10;

export default function ImageCropOverlay({
  imageRect,
  naturalSize,
  accentColor = '#4ade80',
  onSave,
}: ImageCropOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    origCrop: CropRect | null;
  }>({ mode: 'none', startX: 0, startY: 0, origCrop: null });

  // --- Canvas 렌더링 ---
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = imageRect;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    if (!crop) return;

    // 바깥 영역 어둡게
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, width, height);
    // 선택 영역 비우기
    ctx.clearRect(crop.x, crop.y, crop.w, crop.h);

    // 테두리
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);

    // 모서리 핸들
    ctx.fillStyle = accentColor;
    const handles = [
      { x: crop.x, y: crop.y },                          // nw
      { x: crop.x + crop.w, y: crop.y },                 // ne
      { x: crop.x, y: crop.y + crop.h },                 // sw
      { x: crop.x + crop.w, y: crop.y + crop.h },        // se
    ];
    for (const h of handles) {
      ctx.fillRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    }

    // 픽셀 크기 라벨
    const scaleX = naturalSize.width / imageRect.width;
    const scaleY = naturalSize.height / imageRect.height;
    const realW = Math.round(crop.w * scaleX);
    const realH = Math.round(crop.h * scaleY);
    const label = `${realW} × ${realH} px`;

    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    const textMetrics = ctx.measureText(label);
    const labelW = textMetrics.width + 12;
    const labelH = 20;
    const labelX = crop.x + (crop.w - labelW) / 2;
    const labelY = crop.y + crop.h + 4;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, labelW, labelH, 4);
    ctx.fill();

    ctx.fillStyle = accentColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, crop.x + crop.w / 2, labelY + labelH / 2);
  }, [crop, imageRect, naturalSize, accentColor]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  // --- 드래그 모드 판별 ---
  const getDragMode = useCallback((mx: number, my: number): DragMode => {
    if (!crop) return 'create';

    const corners: { mode: DragMode; x: number; y: number }[] = [
      { mode: 'nw', x: crop.x, y: crop.y },
      { mode: 'ne', x: crop.x + crop.w, y: crop.y },
      { mode: 'sw', x: crop.x, y: crop.y + crop.h },
      { mode: 'se', x: crop.x + crop.w, y: crop.y + crop.h },
    ];

    // 핸들 근처 (±10px)
    for (const c of corners) {
      if (Math.abs(mx - c.x) <= 10 && Math.abs(my - c.y) <= 10) {
        return c.mode;
      }
    }

    // 선택 영역 안이면 이동
    if (mx >= crop.x && mx <= crop.x + crop.w && my >= crop.y && my <= crop.y + crop.h) {
      return 'move';
    }

    // 바깥이면 새로 생성 (기존 선택 대체)
    return 'create';
  }, [crop]);

  // --- 커서 스타일 ---
  const getCursor = useCallback((mx: number, my: number): string => {
    const mode = getDragMode(mx, my);
    switch (mode) {
      case 'nw': case 'se': return 'nwse-resize';
      case 'ne': case 'sw': return 'nesw-resize';
      case 'move': return 'move';
      default: return 'crosshair';
    }
  }, [getDragMode]);

  // --- 마우스 이벤트 ---
  const getLocalPos = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = getLocalPos(e);
    const mode = getDragMode(pos.x, pos.y);
    dragRef.current = {
      mode,
      startX: pos.x,
      startY: pos.y,
      origCrop: crop ? { ...crop } : null,
    };
  }, [getLocalPos, getDragMode, crop]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pos = getLocalPos(e);
    const { mode, startX, startY, origCrop } = dragRef.current;
    const { width: cw, height: ch } = imageRect;

    if (mode === 'none') {
      canvas.style.cursor = getCursor(pos.x, pos.y);
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (mode === 'create') {
      let x = Math.min(startX, pos.x);
      let y = Math.min(startY, pos.y);
      let w = Math.abs(pos.x - startX);
      let h = Math.abs(pos.y - startY);

      // Shift: 정사각형 비율
      if (e.shiftKey) {
        const size = Math.max(w, h);
        w = size;
        h = size;
        if (pos.x < startX) x = startX - size;
        if (pos.y < startY) y = startY - size;
      }

      // 캔버스 범위 제한
      x = clamp(x, 0, cw);
      y = clamp(y, 0, ch);
      w = Math.min(w, cw - x);
      h = Math.min(h, ch - y);

      setCrop({ x, y, w, h });
    } else if (mode === 'move' && origCrop) {
      const dx = pos.x - startX;
      const dy = pos.y - startY;
      const x = clamp(origCrop.x + dx, 0, cw - origCrop.w);
      const y = clamp(origCrop.y + dy, 0, ch - origCrop.h);
      setCrop({ x, y, w: origCrop.w, h: origCrop.h });
    } else if (origCrop) {
      // 핸들 리사이즈
      let { x, y, w, h } = origCrop;
      const dx = pos.x - startX;
      const dy = pos.y - startY;

      if (mode === 'se') {
        w = clamp(origCrop.w + dx, MIN_CROP_SIZE, cw - x);
        h = clamp(origCrop.h + dy, MIN_CROP_SIZE, ch - y);
      } else if (mode === 'sw') {
        const newX = clamp(origCrop.x + dx, 0, origCrop.x + origCrop.w - MIN_CROP_SIZE);
        w = origCrop.w + (origCrop.x - newX);
        h = clamp(origCrop.h + dy, MIN_CROP_SIZE, ch - y);
        x = newX;
      } else if (mode === 'ne') {
        w = clamp(origCrop.w + dx, MIN_CROP_SIZE, cw - x);
        const newY = clamp(origCrop.y + dy, 0, origCrop.y + origCrop.h - MIN_CROP_SIZE);
        h = origCrop.h + (origCrop.y - newY);
        y = newY;
      } else if (mode === 'nw') {
        const newX = clamp(origCrop.x + dx, 0, origCrop.x + origCrop.w - MIN_CROP_SIZE);
        const newY = clamp(origCrop.y + dy, 0, origCrop.y + origCrop.h - MIN_CROP_SIZE);
        w = origCrop.w + (origCrop.x - newX);
        h = origCrop.h + (origCrop.y - newY);
        x = newX;
        y = newY;
      }

      if (e.shiftKey) {
        const size = Math.min(w, h);
        w = size;
        h = size;
      }

      setCrop({ x, y, w, h });
    }
  }, [getLocalPos, getCursor, imageRect]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { mode } = dragRef.current;
    if (mode === 'create' && crop && crop.w < MIN_CROP_SIZE && crop.h < MIN_CROP_SIZE) {
      setCrop(null); // 너무 작은 선택은 무시
    }
    dragRef.current = { mode: 'none', startX: 0, startY: 0, origCrop: null };
  }, [crop]);

  // --- 저장 핸들러 ---
  const handleSave = useCallback(() => {
    if (!crop || crop.w < MIN_CROP_SIZE || crop.h < MIN_CROP_SIZE) return;
    const scaleX = naturalSize.width / imageRect.width;
    const scaleY = naturalSize.height / imageRect.height;
    onSave(
      Math.round(crop.x * scaleX),
      Math.round(crop.y * scaleY),
      Math.round(crop.w * scaleX),
      Math.round(crop.h * scaleY),
    );
    setCrop(null);
  }, [crop, naturalSize, imageRect, onSave]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: imageRect.width,
          height: imageRect.height,
          cursor: 'crosshair',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      {crop && crop.w >= MIN_CROP_SIZE && crop.h >= MIN_CROP_SIZE && (
        <button
          onClick={(e) => { e.stopPropagation(); handleSave(); }}
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            background: accentColor,
            color: '#000',
            border: 'none',
            padding: '6px 16px',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          PNG 저장
        </button>
      )}
    </>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add components/FileExplorer/ImageCropOverlay.tsx
git commit -m "feat: ImageCropOverlay 컴포넌트 — Canvas 기반 드래그 영역 선택 UI"
```

---

### Task 3: PreviewModals에 크롭 통합

**Files:**
- Modify: `components/FileExplorer/PreviewModals.tsx`

PreviewModals의 이미지 모달에 ImageCropOverlay를 통합하고, crop_image 호출 + 토스트 + 파일목록 새로고침을 연결한다.

- [ ] **Step 1: PreviewModals props 확장 및 크롭 통합**

`components/FileExplorer/PreviewModals.tsx`를 아래와 같이 수정:

```tsx
import React, { useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import VideoPlayer from './VideoPlayer';
import ImageCropOverlay from './ImageCropOverlay';
import { ThemeVars } from './types';
import { PreviewState } from './hooks/usePreview';
import { getFileName } from '../../utils/pathUtils';

interface PreviewModalsProps {
  preview: PreviewState;
  themeVars: ThemeVars | null;
  onCropSave?: (outputPath: string) => void;
}

export function PreviewModals({ preview, themeVars, onCropSave }: PreviewModalsProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [imageRect, setImageRect] = useState<{ width: number; height: number; left: number; top: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // 이미지 로드 완료 시 표시 크기와 원본 크기 기록
  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    const container = imgContainerRef.current;
    if (!img || !container) return;
    const containerRect = container.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    setImageRect({
      width: imgRect.width,
      height: imgRect.height,
      left: imgRect.left - containerRect.left,
      top: imgRect.top - containerRect.top,
    });
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

  // 크롭 저장 핸들러
  const handleCropSave = useCallback(async (x: number, y: number, width: number, height: number) => {
    if (!preview.previewImagePath || saving) return;
    setSaving(true);
    try {
      const outputPath = await invoke<string>('crop_image', {
        path: preview.previewImagePath,
        x, y, width, height,
      });
      onCropSave?.(outputPath);
    } catch (e) {
      console.error('크롭 저장 실패:', e);
    } finally {
      setSaving(false);
    }
  }, [preview.previewImagePath, saving, onCropSave]);

  // 이미지 모달 닫을 때 크롭 상태도 초기화
  const handleCloseImage = useCallback(() => {
    setImageRect(null);
    setNaturalSize(null);
    preview.closeImagePreview();
  }, [preview]);

  // JPG/PNG만 크롭 지원 (PSD, ICNS 등 base64 데이터는 제외)
  const isCroppable = preview.previewImagePath &&
    /\.(jpe?g|png)$/i.test(preview.previewImagePath);

  return (
    <>
      {/* 비디오 플레이어 모달 */}
      {preview.videoPlayerPath && (
        <VideoPlayer
          path={preview.videoPlayerPath}
          onClose={() => preview.setVideoPlayerPath(null)}
          themeVars={themeVars}
        />
      )}

      {/* 이미지/PSD 미리보기 모달 */}
      {preview.previewImagePath && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={handleCloseImage}
          onKeyDown={(e) => { if (e.key === 'Escape') handleCloseImage(); }}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] rounded-lg overflow-hidden shadow-2xl"
            style={{ backgroundColor: themeVars?.surface2 ?? '#1e293b' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}>
              <span className="text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                {getFileName(preview.previewImagePath)}
              </span>
              <button
                className="text-lg px-2 hover:opacity-70"
                style={{ color: themeVars?.muted ?? '#94a3b8' }}
                onClick={handleCloseImage}
              >
                ✕
              </button>
            </div>
            {/* 이미지 + 크롭 오버레이 */}
            <div
              ref={imgContainerRef}
              className="relative flex items-center justify-center p-4"
              style={{ minWidth: 300, minHeight: 200 }}
            >
              {preview.previewLoading ? (
                <span className="text-sm" style={{ color: themeVars?.muted ?? '#94a3b8' }}>로딩 중...</span>
              ) : preview.previewImageData ? (
                <>
                  <img
                    ref={imgRef}
                    src={preview.previewImageData}
                    alt="미리보기"
                    className="max-w-[85vw] max-h-[80vh] object-contain"
                    onLoad={handleImageLoad}
                    draggable={false}
                  />
                  {isCroppable && imageRect && naturalSize && (
                    <div style={{
                      position: 'absolute',
                      left: imageRect.left,
                      top: imageRect.top,
                      width: imageRect.width,
                      height: imageRect.height,
                    }}>
                      <ImageCropOverlay
                        imageRect={imageRect}
                        naturalSize={naturalSize}
                        accentColor={themeVars?.accent ?? '#4ade80'}
                        onSave={handleCropSave}
                      />
                    </div>
                  )}
                </>
              ) : (
                <span className="text-sm" style={{ color: themeVars?.muted ?? '#94a3b8' }}>미리보기를 생성할 수 없습니다</span>
              )}
              {saving && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.4)', borderRadius: 8,
                }}>
                  <span style={{ color: '#fff', fontSize: 14 }}>저장 중...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 텍스트 미리보기 모달 */}
      {preview.previewTextPath && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={preview.closeTextPreview}
        >
          <div
            className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
            style={{
              backgroundColor: themeVars?.surface2 ?? '#1e293b',
              width: '70vw', maxWidth: 800, maxHeight: '85vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}>
              <span className="text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                {getFileName(preview.previewTextPath)}
              </span>
              <button
                className="text-lg px-2 hover:opacity-70"
                style={{ color: themeVars?.muted ?? '#94a3b8' }}
                onClick={preview.closeTextPreview}
              >
                ✕
              </button>
            </div>
            {/* 텍스트 내용 */}
            <pre
              className="flex-1 overflow-auto p-4 text-xs leading-relaxed whitespace-pre-wrap"
              style={{ color: themeVars?.text ?? '#e5e7eb', maxHeight: '75vh' }}
            >
              {preview.previewTextContent ?? '로딩 중...'}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add components/FileExplorer/PreviewModals.tsx
git commit -m "feat: 이미지 미리보기 모달에 크롭 오버레이 통합"
```

---

### Task 4: 호출부에서 onCropSave 연결

**Files:**
- Modify: `components/FileExplorer/index.tsx` (PreviewModals에 onCropSave prop 전달)

PreviewModals를 사용하는 곳에서 `onCropSave` 콜백을 전달하여 토스트 알림 + 파일 목록 새로고침을 수행한다.

- [ ] **Step 1: PreviewModals 사용부 찾기 및 onCropSave 연결**

`components/FileExplorer/index.tsx`에서 `<PreviewModals` 를 찾아 `onCropSave` prop 추가:

```tsx
<PreviewModals
  preview={preview}
  themeVars={themeVars}
  onCropSave={(outputPath) => {
    showCopyToast(`크롭 저장 완료: ${getFileName(outputPath)}`);
    if (currentPath) {
      loadDirectory(currentPath);
    }
  }}
/>
```

`loadDirectory`는 현재 파일 목록을 다시 불러오는 함수이며, `showCopyToast`는 토스트 알림을 표시한다. 둘 다 index.tsx에 이미 존재한다.

- [ ] **Step 2: import 확인**

`getFileName`이 이미 import 되어 있는지 확인. 없으면 추가:

```tsx
import { getFileName } from '../../utils/pathUtils';
```

- [ ] **Step 3: 프론트엔드 빌드 확인**

Run: `cd /Users/woody/Desktop/AI/QuickFolder/quick-folder && npm run build 2>&1 | tail -10`

Expected: 빌드 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add components/FileExplorer/index.tsx
git commit -m "feat: 크롭 저장 시 토스트 알림 + 파일 목록 새로고침 연결"
```

---

### Task 5: 수동 테스트 및 최종 확인

- [ ] **Step 1: `npm run tauri dev`로 앱 실행**

Run: `npm run tauri dev`

- [ ] **Step 2: 테스트 시나리오 수행**

1. 파일 탐색기에서 JPG 또는 PNG 파일 선택 후 Enter (모달 열기)
2. 이미지 위에서 드래그 → 녹색 테두리 선택 영역 표시 확인
3. 모서리 핸들 드래그 → 크기 조절 확인
4. 선택 영역 안 드래그 → 이동 확인
5. Shift + 드래그 → 정사각형 비율 고정 확인
6. 빈 영역 재드래그 → 이전 선택 대체 확인
7. "PNG 저장" 클릭 → `{stem}_crop.png` 파일 생성 확인
8. 토스트 알림 표시 확인
9. 파일 목록에 새 파일 표시 확인
10. PSD/동영상에서는 크롭 UI가 나타나지 않는 것 확인

- [ ] **Step 3: 최종 커밋 (필요 시)**

수동 테스트 중 발견된 문제가 있으면 수정 후 커밋.
