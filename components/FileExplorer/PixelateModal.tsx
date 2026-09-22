import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Maximize2, Scan, Eye, X } from 'lucide-react';
import { ThemeVars } from './types';
import ModalShell from './ui/ModalShell';
import PanZoomView, { PanZoomHandle } from './ui/PanZoomView';
import { checkerboardStyle, getInputStyle, Spinner } from './ui/modalStyles';
import { getFileName } from '../../utils/pathUtils';
import { invokeTauriCommand as invoke } from '../../utils/tauriInvoke';
import type { TranslationKey } from '../../utils/i18n';

const COLOR_OPTIONS = [4, 8, 16, 32, 64, 128, 256] as const;
/// 픽셀 크기 상한 — 이보다 크면 논리 해상도가 너무 낮아 형태가 남지 않는다
const PIXEL_SIZE_MAX = 32;

/** data URL 이미지의 자연 크기를 읽는다 */
function loadImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = src;
  });
}

interface PixelateModalProps {
  path: string;
  onClose: () => void;
  onApply: (path: string, pixelSize: number, scale: number, maxColors: number) => Promise<void>;
  themeVars: ThemeVars | null;
  t: (key: TranslationKey) => string;
}

export default function PixelateModal({ path, onClose, onApply, themeVars, t }: PixelateModalProps) {
  // 실제 적용 값
  const [pixelSize, setPixelSize] = useState(8);
  // 원본 크기 유지: 이미지 규격은 그대로 두고 픽셀만 정리한다
  const [keepOriginalSize, setKeepOriginalSize] = useState(true);
  const [maxColors, setMaxColors] = useState(16);

  // 백엔드 scale 규약: 0 = 원본 크기 유지, 1 = 논리 해상도(픽셀 크기로 나눈 크기)
  const scale = keepOriginalSize ? 0 : 1;

  // 미리보기 상태. 미리보기 PNG 는 저장될 결과와 같은 이미지이므로,
  // 그 규격이 곧 출력 규격이고 1:1 로 그리면 그게 100% 다.
  const [preview, setPreview] = useState<string | null>(null);
  const [outputSize, setOutputSize] = useState<{ w: number; h: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [zoomPercent, setZoomPercent] = useState(1);

  // 전체화면 뷰어 ("보기") — 같은 미리보기 이미지를 크게 볼 뿐이라 다시 렌더하지 않는다
  const [fullView, setFullView] = useState(false);

  // 디바운스 타이머 ref
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 미리보기 요청 일련번호 — 늦게 도착한 옛 응답이 최신 결과를 덮어쓰지 않게 한다
  const previewSeq = useRef(0);
  const zoomViewRef = useRef<PanZoomHandle | null>(null);

  // 파일명 추출 (헤더 표시용)
  const fileName = useMemo(() => getFileName(path), [path]);

  const previewSrc = preview ? `data:image/png;base64,${preview}` : null;

  // 팝업이 닫히면 백엔드의 미리보기 디코딩 캐시를 즉시 버린다.
  // 큰 이미지는 수십 MB라 팝업이 닫힌 뒤까지 들고 있을 이유가 없다.
  useEffect(() => () => {
    void invoke('clear_pixelate_preview_cache').catch(() => {
      // 캐시 해제 실패는 사용자가 할 수 있는 일이 없다 — 다음 파일을 열면 어차피 교체된다
    });
  }, []);

  // 미리보기 요청 함수
  const fetchPreview = useCallback(async (ps: number, sc: number, mc: number) => {
    const seq = ++previewSeq.current;
    setLoading(true);
    setError('');
    try {
      const base64 = await invoke<string>('pixelate_preview', {
        input: path,
        pixelSize: ps,
        scale: sc,
        maxColors: mc,
      });
      const size = await loadImageSize(`data:image/png;base64,${base64}`);
      // 그 사이 더 새 요청이 나갔으면 이 결과는 버린다
      if (seq !== previewSeq.current) return;
      setPreview(base64);
      setOutputSize(size);
    } catch (e) {
      if (seq !== previewSeq.current) return;
      setError(t('pixelate.warning.previewFailed').replace('{message}', String(e)));
      setPreview(null);
    } finally {
      if (seq === previewSeq.current) setLoading(false);
    }
  }, [path, t]);

  // 파라미터 변경 시 200ms 디바운스 후 미리보기 갱신
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchPreview(pixelSize, scale, maxColors);
    }, 200);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [pixelSize, scale, maxColors, fetchPreview]);

  // 뷰어가 열려 있는 동안의 ESC는 뷰어만 닫는다.
  // ModalShell도 window에서 ESC를 듣고 있어, 캡처 단계에서 전파를 끊지 않으면 모달까지 닫힌다.
  useEffect(() => {
    if (!fullView) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setFullView(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [fullView]);

  // 저장 버튼 클릭
  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await onApply(path, pixelSize, scale, maxColors);
      onClose();
    } catch (e) {
      setError(t('pixelate.warning.saveFailed').replace('{message}', String(e)));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = getInputStyle(themeVars);

  // 미리보기 패널 헤더의 작은 버튼
  const paneButton = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    disabled?: boolean,
  ) => (
    <button
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-opacity hover:opacity-70 disabled:opacity-40 cursor-pointer disabled:cursor-default"
      style={{
        color: themeVars?.text ?? '#e5e7eb',
        backgroundColor: themeVars?.surface ?? '#111827',
        border: `1px solid ${themeVars?.border ?? '#334155'}`,
      }}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {label}
    </button>
  );

  /**
   * 미리보기 박스 공통 껍데기 (체커보드 + 테두리).
   *
   * 갱신 중에도 뷰를 **언마운트하지 않고** 스피너만 위에 겹친다. 슬라이더를 만질 때마다
   * 다시 마운트하면 사용자가 맞춰 둔 확대·이동 위치가 매번 날아간다.
   */
  const paneBox = (children: React.ReactNode) => (
    <div
      className="relative flex items-center justify-center rounded-md overflow-hidden w-full flex-1 min-h-0"
      style={{
        ...checkerboardStyle,
        border: `1px solid ${themeVars?.border ?? '#334155'}`,
      }}
    >
      {children}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Spinner themeVars={themeVars} />
        </div>
      )}
      {!loading && !preview && !error && (
        <span className="text-xs" style={{ color: themeVars?.muted }}>{t('pixelate.noPreview')}</span>
      )}
    </div>
  );

  return (
    <ModalShell
      title={t('pixelate.title').replace('{fileName}', fileName)}
      width="min(72rem, calc(100vw - 1.5rem))"
      height="min(88vh, 860px)"
      maxHeight="94vh"
      saving={saving}
      saveLabel={t('pixelate.save')}
      onClose={onClose}
      onSave={handleSave}
      themeVars={themeVars}
    >
      {/* 본문 — 미리보기가 남는 높이를 전부 차지하고 컨트롤은 아래에 고정된다 */}
      <div className="px-4 py-4 flex flex-col gap-4 flex-1 min-h-0">
        {/* 미리보기 — 하나의 큰 화면에서 확대·축소·이동을 모두 한다 */}
        <div className="flex flex-col gap-1.5 flex-1 min-h-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium truncate" style={{ color: themeVars?.muted }}>
              {t('pixelate.preview')}
              <span className="ml-1.5 opacity-70">{t('pixelate.zoomHint')}</span>
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] tabular-nums" style={{ color: themeVars?.muted }}>
                {Math.round(zoomPercent * 100)}%
              </span>
              {paneButton(t('pixelate.fit'), <Maximize2 size={11} />, () => zoomViewRef.current?.fit())}
              {paneButton('100%', <Scan size={11} />, () => zoomViewRef.current?.zoomTo(1))}
              {paneButton(
                t('pixelate.viewActual'),
                <Eye size={11} />,
                () => setFullView(true),
                !preview,
              )}
            </div>
          </div>
          {paneBox(
            previewSrc && outputSize && (
              <PanZoomView
                ref={zoomViewRef}
                src={previewSrc}
                width={outputSize.w}
                height={outputSize.h}
                initialFit="actual"
                zoomable
                alt={t('pixelate.preview')}
                onScaleChange={setZoomPercent}
              />
            ),
          )}
        </div>

        {/* 컨트롤 영역 */}
        <div className="flex flex-col gap-3 shrink-0">
          {/* 픽셀 크기 슬라이더 — 출력 크기는 여기서 자동으로 결정된다 */}
          <div className="flex items-center gap-3">
            <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 72 }}>
              {t('pixelate.pixelSize')}
            </label>
            <input
              type="range"
              min={1}
              max={PIXEL_SIZE_MAX}
              value={pixelSize}
              onChange={e => setPixelSize(Number(e.target.value))}
              onKeyDown={e => e.stopPropagation()}
              className="flex-1"
              style={{ accentColor: themeVars?.accent ?? '#3b82f6' }}
            />
            <span
              className="w-10 text-center text-xs"
              style={{ color: themeVars?.text ?? '#e5e7eb' }}
            >
              {pixelSize}
            </span>
          </div>

          {/* 원본 크기 유지 토글 + 결과 출력 크기 */}
          <div className="flex items-center gap-3">
            <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 72 }}>
              {t('pixelate.outputSize')}
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
              <input
                type="checkbox"
                checked={keepOriginalSize}
                onChange={e => setKeepOriginalSize(e.target.checked)}
                onKeyDown={e => e.stopPropagation()}
                style={{ accentColor: themeVars?.accent ?? '#3b82f6' }}
              />
              {t('pixelate.keepOriginalSize')}
            </label>
            <span className="text-xs ml-auto" style={{ color: themeVars?.muted }}>
              {outputSize ? `${outputSize.w}×${outputSize.h}` : '—'}
            </span>
          </div>

          {/* 컬러 수 드롭다운 */}
          <div className="flex items-center gap-3">
            <label className="text-xs flex-shrink-0" style={{ color: themeVars?.muted, width: 72 }}>
              {t('pixelate.colorCount')}
            </label>
            <select
              value={maxColors}
              onChange={e => setMaxColors(Number(e.target.value))}
              className="flex-1 px-2 py-1 text-xs rounded-md outline-none cursor-pointer"
              style={inputStyle}
            >
              {COLOR_OPTIONS.map(n => (
                <option key={n} value={n}>{t('pixelate.colorOption').replace('{count}', String(n))}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="text-xs" style={{ color: '#f87171' }}>{error}</div>
        )}
      </div>

      {/* 전체화면 뷰어 — 저장될 결과를 100%로 본다 (미리보기와 같은 이미지다) */}
      {fullView && previewSrc && outputSize && (
        <div
          className="fixed inset-0 flex flex-col"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10001 }}
        >
          <div
            className="flex shrink-0 items-center justify-between px-4 py-2"
            style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}
          >
            <span className="text-xs" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
              {t('pixelate.fullRender')} · {outputSize.w}×{outputSize.h} · 100%
            </span>
            <button
              className="p-1 hover:opacity-70 cursor-pointer"
              style={{ color: themeVars?.muted }}
              onClick={() => setFullView(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 min-h-0" style={checkerboardStyle}>
            <PanZoomView
              src={previewSrc}
              width={outputSize.w}
              height={outputSize.h}
              initialFit="actual"
              zoomable
              alt={t('pixelate.fullRender')}
            />
          </div>
        </div>
      )}
    </ModalShell>
  );
}
