import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ThemeVars } from './types';
import ModalShell from './ui/ModalShell';
import { checkerboardStyle, getInputStyle } from './ui/modalStyles';
import { getFileName, getBaseName } from '../../utils/pathUtils';
import { invokeTauriCommand as invoke } from '../../utils/tauriInvoke';
import type { TranslationKey } from '../../utils/i18n';

interface SheetUnpackModalProps {
  path: string;
  currentPath: string;
  onClose: () => void;
  themeVars: ThemeVars | null;
  t: (key: TranslationKey) => string;
}

export default function SheetUnpackModal({
  path,
  currentPath,
  onClose,
  themeVars,
  t,
}: SheetUnpackModalProps) {
  const formatMessage = useCallback((template: string, values: Record<string, string | number>) => (
    Object.entries(values).reduce(
      (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
      template,
    )
  ), []);

  // 열/행 상태
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(4);

  // 원본 이미지 미리보기 (base64)
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 프레임 수 계산
  const frameCount = cols * rows;

  // 파일명 추출
  const fileName = useMemo(() => getFileName(path), [path]);

  // 확장자 제외한 파일명 (저장용)
  const baseName = useMemo(() => getBaseName(path), [path]);

  // 마운트 시 원본 이미지 썸네일 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base64 = await invoke<string>('get_file_thumbnail', {
          path,
          size: 1024,
      });
      if (!cancelled) setPreview(base64);
    } catch (e) {
        if (!cancelled) setError(formatMessage(t('sheet.warning.previewLoadFailed'), { message: String(e) }));
      }
    })();
    return () => { cancelled = true; };
  }, [formatMessage, path, t]);

  // 저장 처리
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      await invoke('split_sprite_sheet', {
        input: path,
        cols,
        rows,
        outputDir: currentPath,
        baseName,
      });
      onClose();
    } catch (e) {
      setError(formatMessage(t('sheet.warning.saveFailed'), { message: String(e) }));
    } finally {
      setSaving(false);
    }
  }, [formatMessage, path, cols, rows, currentPath, baseName, onClose, t]);

  // 공통 스타일
  const inputStyle = getInputStyle(themeVars);

  // 프레임 미리보기 그리드 렌더링 — 고정 크기 셀로 클리핑
  const thumbSize = useMemo(() => {
    // 그리드 영역(약 380px)에 맞게 셀 크기 계산
    const maxGridWidth = 380;
    return Math.max(24, Math.min(80, Math.floor(maxGridWidth / cols)));
  }, [cols]);

  const frameGrid = useMemo(() => {
    if (!preview) return null;
    const frames: React.ReactNode[] = [];
    const imgW = thumbSize * cols;
    const imgH = thumbSize * rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        frames.push(
          <div
            key={idx}
            className="rounded overflow-hidden"
            style={{
              width: thumbSize,
              height: thumbSize,
              position: 'relative',
              border: `1px solid ${themeVars?.border ?? '#334155'}`,
              ...checkerboardStyle,
            }}
          >
            <img
              src={`data:image/png;base64,${preview}`}
              alt={formatMessage(t('sheet.frameAlt'), { index: idx + 1 })}
              style={{
                position: 'absolute',
                width: imgW,
                height: imgH,
                maxWidth: 'none',
                left: -(c * thumbSize),
                top: -(r * thumbSize),
                imageRendering: 'auto',
              }}
            />
          </div>
        );
      }
    }
    return frames;
  }, [formatMessage, preview, cols, rows, thumbSize, themeVars?.border, t]);

  return (
    <ModalShell
      title={formatMessage(t('sheetUnpack.title'), { fileName, cols, rows })}
      maxWidth="52rem"
      saving={saving}
      saveLabel={t('sheet.save')}
      onClose={onClose}
      onSave={handleSave}
      themeVars={themeVars}
    >
      {/* 본문 */}
      <div className="px-4 py-4 flex flex-col gap-4">
        {/* 미리보기 영역 — 좌: 원본, 우: 프레임 그리드 */}
        <div className="flex gap-3">
          {/* 원본 이미지 미리보기 */}
          <div className="flex-1 flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-medium" style={{ color: themeVars?.muted }}>{t('sheetUnpack.sourceImage')}</span>
            <div
              className="flex items-center justify-center rounded-md overflow-hidden w-full"
              style={{
                maxHeight: 300,
                ...checkerboardStyle,
                border: `1px solid ${themeVars?.border ?? '#334155'}`,
              }}
            >
              {preview ? (
                <img
                  src={`data:image/png;base64,${preview}`}
                  alt={t('sheetUnpack.sourceImage')}
                  style={{
                    maxWidth: '100%',
                    maxHeight: 300,
                    objectFit: 'contain',
                  }}
                />
              ) : (
                <div className="flex items-center justify-center" style={{ height: 200 }}>
                  {error ? (
                    <span className="text-xs" style={{ color: '#f87171' }}>{error}</span>
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
                      style={{ borderColor: `${themeVars?.accent ?? '#3b82f6'} transparent transparent transparent` }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 프레임 미리보기 그리드 */}
          <div className="flex-1 flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-medium" style={{ color: themeVars?.muted }}>
              {formatMessage(t('sheetUnpack.framePreview'), { count: frameCount })}
            </span>
            <div
              className="rounded-md overflow-auto w-full"
              style={{
                maxHeight: 300,
                border: `1px solid ${themeVars?.border ?? '#334155'}`,
                backgroundColor: themeVars?.surface ?? '#111827',
              }}
            >
              <div
                className="grid gap-1 p-2"
                style={{
                  gridTemplateColumns: `repeat(${cols}, ${thumbSize}px)`,
                }}
              >
                {frameGrid}
              </div>
            </div>
          </div>
        </div>

        {/* 열/행 입력 */}
        <div className="flex items-center gap-3">
          <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 56 }}>
            {t('sheet.cols')}
          </label>
          <input
            type="number"
            value={cols}
            min={1}
            max={64}
            onChange={e => setCols(Math.max(1, Number(e.target.value)))}
            onKeyDown={e => e.stopPropagation()}
            style={inputStyle}
          />
          <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 56 }}>
            {t('sheet.rows')}
          </label>
          <input
            type="number"
            value={rows}
            min={1}
            max={64}
            onChange={e => setRows(Math.max(1, Number(e.target.value)))}
            onKeyDown={e => e.stopPropagation()}
            style={inputStyle}
          />
          <span className="text-[10px]" style={{ color: themeVars?.muted }}>
            {formatMessage(t('sheetUnpack.frameCount'), { count: frameCount })}
          </span>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="text-xs" style={{ color: '#f87171' }}>{error}</div>
        )}
      </div>
    </ModalShell>
  );
}
