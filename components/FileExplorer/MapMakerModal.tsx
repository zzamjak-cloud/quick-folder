import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ThemeVars } from './types';
import ModalShell from './ui/ModalShell';
import { checkerboardStyle, Spinner } from './ui/modalStyles';
import { getFileName } from '../../utils/pathUtils';
import LaigterLitPreview, { LaigterLitPreviewTextures, PreviewDisplayMode } from './LaigterLitPreview';

export interface LaigterParamsUI {
  bumpStrength: number;
  blurSigma: number;
  heightInvert: boolean;
  normalYFlip: boolean;
  specularExponent: number;
  specularGradientMix: number;
  specularGain: number;
  occlusionStrength: number;
}

interface PreviewPayload extends LaigterLitPreviewTextures {
  width: number;
  height: number;
}

const DEFAULT_PARAMS: LaigterParamsUI = {
  bumpStrength: 2.5,
  blurSigma: 1.2,
  heightInvert: false,
  normalYFlip: true,
  specularExponent: 8,
  specularGradientMix: 0.45,
  specularGain: 1,
  occlusionStrength: 0.85,
};

type ViewTab = 'diffuse' | 'normal' | 'parallax' | 'specular' | 'occlusion' | 'lit';
type LitLightTab = 'light1' | 'light2';

interface MapMakerModalProps {
  path: string;
  onClose: () => void;
  onExport: (
    inputPath: string,
    params: LaigterParamsUI,
    options: { saveNormal: boolean; saveParallax: boolean; saveSpecular: boolean; saveOcclusion: boolean },
  ) => Promise<void>;
  themeVars: ThemeVars | null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

interface SliderRowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  themeVars: ThemeVars | null;
}

/** 라벨은 위 한 줄, 슬라이더+숫자 입력은 아래 한 줄 (좁은 패널에서 겹침 방지) */
function SliderRow({ label, value, onChange, min, max, step, themeVars }: SliderRowProps) {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  const fmt = useCallback((v: number) => (decimals === 0 ? String(Math.round(v)) : v.toFixed(decimals)), [decimals]);
  const [draft, setDraft] = useState(() => fmt(value));

  useEffect(() => {
    setDraft(fmt(value));
  }, [value, fmt]);

  const commitDraft = useCallback(() => {
    const n = parseFloat(draft.replace(/,/g, '.'));
    if (!Number.isFinite(n)) {
      setDraft(fmt(value));
      return;
    }
    onChange(clamp(n, min, max));
  }, [draft, min, max, onChange, value, fmt]);

  const border = themeVars?.border ?? '#334155';
  const surface = themeVars?.surface ?? '#111827';
  const text = themeVars?.text ?? '#e5e7eb';

  return (
    <div className="flex flex-col gap-1 py-1.5 min-w-0">
      <span className="text-[12px] leading-snug text-left" style={{ color: text }}>
        {label}
      </span>
      <div className="flex w-full min-w-0 items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(clamp(Number(e.target.value), min, max))}
          className="min-w-0 flex-1 h-2 cursor-pointer accent-[color:var(--map-accent)]"
          style={{ ['--map-accent' as string]: themeVars?.accent ?? '#3b82f6' }}
        />
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${label} 값`}
          className="w-[4.5rem] shrink-0 rounded px-1.5 py-1 text-right text-[12px] tabular-nums"
          style={{
            backgroundColor: surface,
            color: text,
            border: `1px solid ${border}`,
            outline: 'none',
          }}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
    </div>
  );
}

type LightState = {
  x: number;
  y: number;
  z: number;
  diff: number;
  spec: number;
  scatter: number;
  color: [number, number, number];
  specColor: [number, number, number];
};

export default function MapMakerModal({ path, onClose, onExport, themeVars }: MapMakerModalProps) {
  const [params, setParams] = useState<LaigterParamsUI>(DEFAULT_PARAMS);
  const [viewTab, setViewTab] = useState<ViewTab>('lit');
  const [litLightTab, setLitLightTab] = useState<LitLightTab>('light1');
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  /** fit: 패널에 맞춤(기본), actual: 미리보기 텍스처 1픽셀=1CSS px·스크롤 */
  const [previewDisplayMode, setPreviewDisplayMode] = useState<PreviewDisplayMode>('fit');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [saveNormal, setSaveNormal] = useState(true);
  const [saveParallax, setSaveParallax] = useState(true);
  const [saveSpecular, setSaveSpecular] = useState(true);
  const [saveOcclusion, setSaveOcclusion] = useState(true);

  const [parallaxPreview, setParallaxPreview] = useState(true);
  const [heightScale, setHeightScale] = useState(0.08);
  const [ambientIntensity, setAmbientIntensity] = useState(0.35);
  const [normalRotationDeg, setNormalRotationDeg] = useState(0);
  const [toonShading, setToonShading] = useState(false);
  const [pixelatedPreview, setPixelatedPreview] = useState(false);
  const [pixelCells, setPixelCells] = useState(48);

  const [light2Enabled, setLight2Enabled] = useState(true);
  const [l0, setL0] = useState<LightState>({
    x: 0.28, y: 0.22, z: 0.55, diff: 1.1, spec: 0.65, scatter: 24,
    color: [1, 0.95, 0.88], specColor: [1, 1, 1],
  });
  const [l1, setL1] = useState<LightState>({
    x: 0.72, y: 0.78, z: 0.5, diff: 0.45, spec: 0.25, scatter: 48,
    color: [0.65, 0.75, 1], specColor: [1, 1, 1],
  });

  const fileName = useMemo(() => getFileName(path), [path]);
  const border = themeVars?.border ?? '#334155';
  const muted = themeVars?.muted ?? '#94a3b8';
  const text = themeVars?.text ?? '#e5e7eb';
  const surface = themeVars?.surface ?? '#111827';
  const accent = themeVars?.accent ?? '#3b82f6';

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await invoke<PreviewPayload>('laigter_maps_preview', {
        input: path,
        params,
        maxSide: 512,
      });
      setPreview(data);
    } catch (e) {
      setError(`미리보기 실패: ${e}`);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [path, params]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPreview();
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchPreview]);

  const handleSave = async () => {
    if (!saveNormal && !saveParallax && !saveSpecular && !saveOcclusion) {
      setError('저장할 맵을 하나 이상 선택하세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onExport(path, params, {
        saveNormal,
        saveParallax,
        saveSpecular,
        saveOcclusion,
      });
      onClose();
    } catch (e) {
      setError(`저장 실패: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const tabBtn = (id: ViewTab, label: string) => (
    <button
      key={id}
      type="button"
      className="px-2.5 py-1.5 text-[12px] rounded-md transition-colors cursor-pointer shrink-0"
      style={{
        backgroundColor: viewTab === id ? accent : surface,
        color: viewTab === id ? '#fff' : text,
        border: `1px solid ${viewTab === id ? 'transparent' : border}`,
      }}
      onClick={() => setViewTab(id)}
    >
      {label}
    </button>
  );

  const previewModeBtn = (mode: PreviewDisplayMode, label: string) => (
    <button
      key={mode}
      type="button"
      className="rounded px-2 py-1 text-[11px] transition-colors cursor-pointer"
      style={{
        backgroundColor: previewDisplayMode === mode ? accent : surface,
        color: previewDisplayMode === mode ? '#fff' : text,
        border: `1px solid ${previewDisplayMode === mode ? 'transparent' : border}`,
      }}
      onClick={() => setPreviewDisplayMode(mode)}
    >
      {label}
    </button>
  );

  const litLightTabBtn = (id: LitLightTab, label: string) => (
    <button
      key={id}
      type="button"
      className="flex-1 px-2 py-1.5 text-[12px] rounded-md transition-colors cursor-pointer"
      style={{
        backgroundColor: litLightTab === id ? accent : surface,
        color: litLightTab === id ? '#fff' : text,
        border: `1px solid ${litLightTab === id ? 'transparent' : border}`,
      }}
      onClick={() => setLitLightTab(id)}
    >
      {label}
    </button>
  );

  const previewSrc = (b64: string | undefined) => (b64 ? `data:image/png;base64,${b64}` : undefined);

  const litTextures: LaigterLitPreviewTextures | null = preview
    ? {
        diffuse: preview.diffuse,
        normal: preview.normal,
        parallax: preview.parallax,
        specular: preview.specular,
        occlusion: preview.occlusion,
      }
    : null;

  const sectionTitle = (title: string, subtitle?: string) => (
    <div className="pt-3 first:pt-0">
      <div className="text-[13px] font-semibold" style={{ color: text }}>{title}</div>
      {subtitle && (
        <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: muted }}>{subtitle}</p>
      )}
    </div>
  );

  return (
    <ModalShell
      title={`Map Maker — ${fileName}`}
      width="min(72rem, calc(100vw - 1.5rem))"
      height="min(86vh, 820px)"
      maxHeight="94vh"
      saving={saving}
      saveLabel="맵 저장"
      savingLabel="저장 중..."
      onClose={onClose}
      onSave={handleSave}
      themeVars={themeVars}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3 lg:flex-row lg:gap-0">
          {/* 왼쪽: 미리보기 */}
          <div
            className="flex min-h-0 flex-1 flex-col lg:border-r lg:pr-4"
            style={{ borderColor: border }}
          >
            <div className="mb-2 flex shrink-0 flex-wrap gap-1.5">
              {tabBtn('lit', '조명')}
              {tabBtn('diffuse', '확산')}
              {tabBtn('normal', '노멀')}
              {tabBtn('specular', '스펙큘러')}
              {tabBtn('parallax', '파랄락스')}
              {tabBtn('occlusion', '오클루전')}
            </div>

            {preview && (
              <div className="mb-1.5 flex flex-wrap items-center justify-center gap-1.5 text-[11px]" style={{ color: muted }}>
                <span className="shrink-0">표시:</span>
                {previewModeBtn('fit', '화면 맞춤')}
                {previewModeBtn('actual', '원본 크기')}
                <span className="hidden min-[480px]:inline shrink-0 opacity-80">
                  (원본 크기 = 미리보기 해상도 1:1, 파일 전체는 저장 시)
                </span>
              </div>
            )}

            <div
              className={`relative flex min-h-0 flex-1 rounded-lg ${
                previewDisplayMode === 'fit'
                  ? 'items-center justify-center overflow-hidden'
                  : 'items-start justify-start overflow-auto'
              }`}
              style={{ ...checkerboardStyle, border: `1px solid ${border}`, minHeight: 200 }}
            >
              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/45">
                  <Spinner themeVars={themeVars} />
                </div>
              )}
              {error && (
                <div className="absolute bottom-2 left-2 right-2 z-20 px-2 text-center text-xs text-red-300">{error}</div>
              )}
              {viewTab === 'lit' && litTextures && preview && (
                <div
                  className={`absolute inset-2 flex min-h-0 ${
                    previewDisplayMode === 'fit'
                      ? 'items-center justify-center overflow-hidden'
                      : 'items-start justify-start overflow-visible'
                  }`}
                >
                  <LaigterLitPreview
                    textures={litTextures}
                    textureWidth={preview.width}
                    textureHeight={preview.height}
                    displayMode={previewDisplayMode}
                    themeVars={themeVars}
                    parallaxEnabled={parallaxPreview}
                    heightScale={heightScale}
                    ambientIntensity={ambientIntensity}
                    ambientColor={[0.35, 0.38, 0.45]}
                    normalRotationDeg={normalRotationDeg}
                    toonShading={toonShading}
                    pixelated={pixelatedPreview}
                    pixelCells={pixelCells}
                    light0={l0}
                    light1Enabled={light2Enabled}
                    light1={l1}
                  />
                </div>
              )}
              {viewTab !== 'lit' && preview && (
                previewDisplayMode === 'fit' ? (
                  <img
                    src={previewSrc(
                      viewTab === 'diffuse' ? preview.diffuse
                        : viewTab === 'normal' ? preview.normal
                          : viewTab === 'parallax' ? preview.parallax
                            : viewTab === 'specular' ? preview.specular
                              : preview.occlusion,
                    )}
                    alt=""
                    className="max-h-full max-w-full object-contain p-2"
                    style={{ imageRendering: viewTab === 'diffuse' && pixelatedPreview ? 'pixelated' : 'auto' }}
                  />
                ) : (
                  <div className="p-2">
                    <img
                      src={previewSrc(
                        viewTab === 'diffuse' ? preview.diffuse
                          : viewTab === 'normal' ? preview.normal
                            : viewTab === 'parallax' ? preview.parallax
                              : viewTab === 'specular' ? preview.specular
                                : preview.occlusion,
                      )}
                      alt=""
                      width={preview.width}
                      height={preview.height}
                      className="max-w-none max-h-none"
                      style={{ imageRendering: viewTab === 'diffuse' && pixelatedPreview ? 'pixelated' : 'auto' }}
                    />
                  </div>
                )
              )}
            </div>
            {preview && (
              <div className="mt-2 shrink-0 text-center text-[11px]" style={{ color: muted }}>
                미리보기 텍스처 {preview.width}×{preview.height}px · 맵 저장은 파일 원본 해상도
              </div>
            )}
          </div>

          {/* 오른쪽: 옵션 (고정 너비, 세로 스크롤) */}
          <div
            className="flex w-full shrink-0 flex-col overflow-y-auto overflow-x-hidden lg:w-[min(26rem,34vw)] lg:pl-4"
            style={{ maxHeight: '100%' }}
          >
            {viewTab === 'lit' ? (
              <>
                {sectionTitle('조명 미리보기', '실시간 조명은 화면용이며 저장되지 않습니다.')}
                {sectionTitle('씬 (Scene)')}
                <SliderRow label="파랄락스 깊이" value={heightScale} onChange={setHeightScale} min={0.01} max={0.2} step={0.005} themeVars={themeVars} />
                <label className="flex cursor-pointer items-center gap-2 py-1 text-[12px]" style={{ color: text }}>
                  <input type="checkbox" checked={parallaxPreview} onChange={e => setParallaxPreview(e.target.checked)} />
                  파랄락스 샘플링 사용
                </label>
                <SliderRow label="앰비언트" value={ambientIntensity} onChange={setAmbientIntensity} min={0} max={1.2} step={0.02} themeVars={themeVars} />
                <SliderRow label="노멀 Z 회전 (°)" value={normalRotationDeg} onChange={setNormalRotationDeg} min={-180} max={180} step={1} themeVars={themeVars} />
                <label className="flex cursor-pointer items-center gap-2 py-1 text-[12px]" style={{ color: text }}>
                  <input type="checkbox" checked={toonShading} onChange={e => setToonShading(e.target.checked)} />
                  툰 셰이딩
                </label>
                <label className="flex cursor-pointer items-center gap-2 py-1 text-[12px]" style={{ color: text }}>
                  <input type="checkbox" checked={pixelatedPreview} onChange={e => setPixelatedPreview(e.target.checked)} />
                  픽셀화 미리보기
                </label>
                {pixelatedPreview && (
                  <SliderRow label="픽셀 그리드" value={pixelCells} onChange={v => setPixelCells(Math.round(v))} min={8} max={128} step={1} themeVars={themeVars} />
                )}

                {sectionTitle('조명', 'Light 1은 기본, Light 2는 보조 조명입니다.')}
                <div className="mt-1 flex gap-1.5">
                  {litLightTabBtn('light1', 'Light 1')}
                  {litLightTabBtn('light2', 'Light 2')}
                </div>

                {litLightTab === 'light1' && (
                  <div
                    className="mt-2 rounded-lg p-2.5"
                    style={{ border: `1px solid ${border}`, backgroundColor: themeVars?.surface2 ?? '#0f172a' }}
                  >
                    <p className="mb-2 text-[11px] leading-snug" style={{ color: muted }}>
                      UV(0~1) 평면 위 조명 위치. Z는 깊이 방향입니다.
                    </p>
                    <SliderRow label="위치 X" value={l0.x} onChange={v => setL0(s => ({ ...s, x: v }))} min={0} max={1} step={0.01} themeVars={themeVars} />
                    <SliderRow label="위치 Y" value={l0.y} onChange={v => setL0(s => ({ ...s, y: v }))} min={0} max={1} step={0.01} themeVars={themeVars} />
                    <SliderRow label="위치 Z" value={l0.z} onChange={v => setL0(s => ({ ...s, z: v }))} min={0.05} max={1.5} step={0.02} themeVars={themeVars} />
                    <SliderRow label="확산 (Diffuse)" value={l0.diff} onChange={v => setL0(s => ({ ...s, diff: v }))} min={0} max={2} step={0.05} themeVars={themeVars} />
                    <SliderRow label="스펙큘러" value={l0.spec} onChange={v => setL0(s => ({ ...s, spec: v }))} min={0} max={2} step={0.05} themeVars={themeVars} />
                    <SliderRow label="스펙 산란 (광택)" value={l0.scatter} onChange={v => setL0(s => ({ ...s, scatter: v }))} min={4} max={128} step={1} themeVars={themeVars} />
                  </div>
                )}

                {litLightTab === 'light2' && (
                  <div
                    className="mt-2 rounded-lg p-2.5"
                    style={{ border: `1px solid ${border}`, backgroundColor: themeVars?.surface2 ?? '#0f172a' }}
                  >
                    <label className="mb-2 flex cursor-pointer items-center gap-2 text-[12px]" style={{ color: text }}>
                      <input type="checkbox" checked={light2Enabled} onChange={e => setLight2Enabled(e.target.checked)} />
                      Light 2 사용
                    </label>
                    <p className="mb-2 text-[11px] leading-snug" style={{ color: muted }}>
                      UV(0~1) 평면 위 조명 위치. Z는 깊이 방향입니다.
                    </p>
                    <div
                      className="flex flex-col gap-0.5"
                      style={{
                        opacity: light2Enabled ? 1 : 0.42,
                        pointerEvents: light2Enabled ? 'auto' : 'none',
                      }}
                    >
                      <SliderRow label="위치 X" value={l1.x} onChange={v => setL1(s => ({ ...s, x: v }))} min={0} max={1} step={0.01} themeVars={themeVars} />
                      <SliderRow label="위치 Y" value={l1.y} onChange={v => setL1(s => ({ ...s, y: v }))} min={0} max={1} step={0.01} themeVars={themeVars} />
                      <SliderRow label="위치 Z" value={l1.z} onChange={v => setL1(s => ({ ...s, z: v }))} min={0.05} max={1.5} step={0.02} themeVars={themeVars} />
                      <SliderRow label="확산 (Diffuse)" value={l1.diff} onChange={v => setL1(s => ({ ...s, diff: v }))} min={0} max={2} step={0.05} themeVars={themeVars} />
                      <SliderRow label="스펙큘러" value={l1.spec} onChange={v => setL1(s => ({ ...s, spec: v }))} min={0} max={2} step={0.05} themeVars={themeVars} />
                      <SliderRow label="스펙 산란 (광택)" value={l1.scatter} onChange={v => setL1(s => ({ ...s, scatter: v }))} min={4} max={128} step={1} themeVars={themeVars} />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {sectionTitle('맵 생성', '슬라이더 옆 숫자는 직접 입력할 수 있습니다.')}
                <SliderRow label="범프 강도" value={params.bumpStrength} onChange={v => setParams(p => ({ ...p, bumpStrength: v }))} min={0.2} max={6} step={0.05} themeVars={themeVars} />
                <SliderRow label="높이 블러 σ" value={params.blurSigma} onChange={v => setParams(p => ({ ...p, blurSigma: v }))} min={0} max={4} step={0.05} themeVars={themeVars} />
                <SliderRow label="스펙큘러 지수" value={params.specularExponent} onChange={v => setParams(p => ({ ...p, specularExponent: v }))} min={1} max={64} step={0.5} themeVars={themeVars} />
                <SliderRow label="스펙: 명도↔기울기" value={params.specularGradientMix} onChange={v => setParams(p => ({ ...p, specularGradientMix: v }))} min={0} max={1} step={0.02} themeVars={themeVars} />
                <SliderRow label="스펙큘러 게인" value={params.specularGain} onChange={v => setParams(p => ({ ...p, specularGain: v }))} min={0.1} max={2.5} step={0.05} themeVars={themeVars} />
                <SliderRow label="오클루전 강도" value={params.occlusionStrength} onChange={v => setParams(p => ({ ...p, occlusionStrength: v }))} min={0} max={2} step={0.05} themeVars={themeVars} />
                <label className="flex cursor-pointer items-center gap-2 py-1 text-[12px]" style={{ color: text }}>
                  <input type="checkbox" checked={params.heightInvert} onChange={e => setParams(p => ({ ...p, heightInvert: e.target.checked }))} />
                  높이맵 반전
                </label>
                <label className="flex cursor-pointer items-center gap-2 py-1 text-[12px]" style={{ color: text }}>
                  <input type="checkbox" checked={params.normalYFlip} onChange={e => setParams(p => ({ ...p, normalYFlip: e.target.checked }))} />
                  노멀 Y 플립 (엔진 호환)
                </label>

                {sectionTitle('저장할 파일')}
                <label className="flex cursor-pointer items-center gap-2 py-0.5 text-[12px]" style={{ color: text }}>
                  <input type="checkbox" checked={saveNormal} onChange={e => setSaveNormal(e.target.checked)} />
                  노멀맵 (_normal.png)
                </label>
                <label className="flex cursor-pointer items-center gap-2 py-0.5 text-[12px]" style={{ color: text }}>
                  <input type="checkbox" checked={saveParallax} onChange={e => setSaveParallax(e.target.checked)} />
                  파랄락스 (_parallax.png)
                </label>
                <label className="flex cursor-pointer items-center gap-2 py-0.5 text-[12px]" style={{ color: text }}>
                  <input type="checkbox" checked={saveSpecular} onChange={e => setSaveSpecular(e.target.checked)} />
                  스펙큘러 (_specular.png)
                </label>
                <label className="flex cursor-pointer items-center gap-2 py-0.5 text-[12px]" style={{ color: text }}>
                  <input type="checkbox" checked={saveOcclusion} onChange={e => setSaveOcclusion(e.target.checked)} />
                  오클루전 (_occlusion.png)
                </label>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
