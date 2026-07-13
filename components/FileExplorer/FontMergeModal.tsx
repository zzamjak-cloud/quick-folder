import React, { useState, useEffect } from 'react';
import { ArrowUpDown } from 'lucide-react';
import ModalShell from './ui/ModalShell';
import { getInputStyle } from './ui/modalStyles';
import { ThemeVars } from './types';
import { getFileName, getExtension, getBaseName, getParentDir } from '../../utils/pathUtils';
import { invokeTauriCommand as invoke } from '../../utils/tauriInvoke';
import type { TranslationKey } from '../../utils/i18n';

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────

/** Rust 커맨드 get_font_info 응답 형태 */
interface FontInfo {
  name: string;
  family: string;
  style: string;
  glyph_count: number;
}

export interface FontMergeModalProps {
  /** 정확히 2개의 폰트 파일 경로 */
  paths: string[];
  onClose: () => void;
  /** 병합 완료 후 출력 경로 전달 콜백 */
  onApply: (outputPath: string) => void;
  themeVars: ThemeVars | null;
  t: (key: TranslationKey) => string;
}

function formatMessage(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────

export default function FontMergeModal({
  paths,
  onClose,
  onApply,
  themeVars,
  t,
}: FontMergeModalProps) {
  // A/B 순서 상태 (교체 버튼으로 반전)
  const [order, setOrder] = useState<[string, string]>([paths[0], paths[1]]);

  // 각 폰트의 정보 로딩 상태
  const [fontInfoA, setFontInfoA] = useState<FontInfo | null>(null);
  const [fontInfoB, setFontInfoB] = useState<FontInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // 출력 파일명 입력 상태
  const [outputName, setOutputName] = useState('');

  // 병합 진행 여부
  const [merging, setMerging] = useState(false);

  /** python -m pip install fonttools (ffmpeg/GS 자동 설치와 동일 UX) */
  const [installingFonttools, setInstallingFonttools] = useState(false);

  // 에러 메시지
  const [error, setError] = useState<string | null>(null);

  // ─── 폰트 정보 로드 ───────────────────────────
  useEffect(() => {
    const loadFontInfos = async () => {
      setLoading(true);
      setError(null);
      try {
        const [infoA, infoB] = await Promise.all([
          invoke<FontInfo>('get_font_info', { path: order[0] }),
          invoke<FontInfo>('get_font_info', { path: order[1] }),
        ]);
        setFontInfoA(infoA);
        setFontInfoB(infoB);

        // 기본 출력 파일명 생성: {A이름}_{B이름}_Merged + 원본 확장자
        const ext = getExtension(order[0]) || '.ttf';
        setOutputName(`${infoA.name}_${infoB.name}_Merged${ext}`);
      } catch (e) {
        setError(formatMessage(t('fontMerge.error.infoLoadFailed'), { message: String(e) }));
      } finally {
        setLoading(false);
      }
    };

    loadFontInfos();
  }, [order, t]);

  // ─── A↔B 순서 교체 ────────────────────────────
  const handleSwap = () => {
    setOrder(([a, b]) => [b, a]);
  };

  // ─── 병합 실행 ────────────────────────────────
  const handleMerge = async () => {
    if (!outputName.trim()) {
      setError(t('fontMerge.error.outputNameRequired'));
      return;
    }

    const parentDir = getParentDir(order[0]);
    const sep = order[0].includes('/') ? '/' : '\\';
    const outputPath = `${parentDir}${sep}${outputName.trim()}`;

    setError(null);

    try {
      const hasFonttools = await invoke<boolean>('check_fonttools');
      if (!hasFonttools) {
        setInstallingFonttools(true);
        try {
          await invoke('download_fonttools');
        } catch (installErr) {
          setError(
            formatMessage(t('fontMerge.error.fonttoolsInstallFailed'), { message: String(installErr) })
          );
          return;
        } finally {
          setInstallingFonttools(false);
        }
      }

      setMerging(true);
      await invoke('merge_fonts', {
        basePath: order[0],
        mergePath: order[1],
        outputPath,
      });
      onApply(outputPath);
      onClose();
    } catch (e) {
      const msg = String(e);

      // Python / fonttools 미설치 안내
      if (msg.includes('python') || msg.includes('Python')) {
        setError(
          t('fontMerge.error.pythonMissing')
        );
      } else if (msg.includes('fonttools') || msg.includes('No module named')) {
        setError(
          t('fontMerge.error.fonttoolsRequired')
        );
      } else {
        setError(formatMessage(t('fontMerge.error.mergeFailed'), { message: msg }));
      }
    } finally {
      setMerging(false);
    }
  };

  // ─── 스타일 헬퍼 ─────────────────────────────

  /** 폰트 정보 카드 스타일 */
  const cardStyle: React.CSSProperties = {
    backgroundColor: themeVars?.surface ?? '#111827',
    border: `1px solid ${themeVars?.border ?? '#334155'}`,
    borderRadius: 6,
    padding: '10px 14px',
  };

  /** 레이블 스타일 */
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: themeVars?.muted ?? '#94a3b8',
    marginBottom: 6,
  };

  /** 폰트 이름 텍스트 스타일 */
  const fontNameStyle: React.CSSProperties = {
    fontSize: 13,
    color: themeVars?.text ?? '#e5e7eb',
    fontWeight: 500,
  };

  /** 글리프 수 및 스타일 서브텍스트 */
  const subTextStyle: React.CSSProperties = {
    fontSize: 11,
    color: themeVars?.muted ?? '#94a3b8',
    marginTop: 2,
  };

  /** 교체 버튼 스타일 */
  const swapBtnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 12px',
    fontSize: 12,
    borderRadius: 6,
    border: `1px solid ${themeVars?.accent ?? '#3b82f6'}`,
    backgroundColor: 'transparent',
    color: themeVars?.accent ?? '#3b82f6',
    cursor: 'pointer',
  };

  /** 출력 파일명 입력 필드 스타일 */
  const inputStyle: React.CSSProperties = {
    ...getInputStyle(themeVars),
    width: '100%',
    fontSize: 13,
    padding: '6px 10px',
  };

  // ─── 폰트 카드 렌더 헬퍼 ─────────────────────

  const renderFontCard = (info: FontInfo | null, pathStr: string) => {
    if (loading) {
      return (
        <div style={cardStyle}>
          <span style={{ fontSize: 12, color: themeVars?.muted }}>{t('fontMerge.loading')}</span>
        </div>
      );
    }
    if (!info) {
      return (
        <div style={cardStyle}>
          <span style={{ fontSize: 12, color: themeVars?.muted }}>{getFileName(pathStr)}</span>
        </div>
      );
    }
    return (
      <div style={cardStyle}>
        <div style={fontNameStyle}>
          {info.name} <span style={{ fontWeight: 400, opacity: 0.7 }}>{info.style}</span>
        </div>
        <div style={subTextStyle}>
          {formatMessage(t('fontMerge.glyphSummary'), {
            count: info.glyph_count.toLocaleString(),
            fileName: getFileName(pathStr),
          })}
        </div>
      </div>
    );
  };

  // ─── 렌더 ─────────────────────────────────────

  return (
    <ModalShell
      title={t('fontMerge.title')}
      maxWidth="36rem"
      saving={merging || installingFonttools}
      saveLabel={t('fontMerge.merge')}
      savingLabel={installingFonttools ? t('fontMerge.fonttoolsInstalling') : t('fontMerge.merging')}
      cancelLabel={t('common.cancel')}
      onClose={onClose}
      onSave={handleMerge}
      themeVars={themeVars}
    >
      <div className="px-4 py-4 flex flex-col gap-4">

        {/* A 폰트 (베이스) */}
        <div>
          <div style={labelStyle}>{t('fontMerge.baseFont')}</div>
          {renderFontCard(fontInfoA, order[0])}
        </div>

        {/* A↔B 교체 버튼 */}
        <div className="flex justify-center">
          <button style={swapBtnStyle} onClick={handleSwap} disabled={loading || merging || installingFonttools}>
            <ArrowUpDown size={13} />
            {t('fontMerge.swap')}
          </button>
        </div>

        {/* B 폰트 (병합 소스) */}
        <div>
          <div style={labelStyle}>{t('fontMerge.mergeSourceFont')}</div>
          {renderFontCard(fontInfoB, order[1])}
        </div>

        {/* 출력 파일명 */}
        <div>
          <div style={labelStyle}>{t('fontMerge.outputName')}</div>
          <input
            type="text"
            value={outputName}
            onChange={e => setOutputName(e.target.value)}
            style={inputStyle}
            spellCheck={false}
            disabled={merging || installingFonttools}
            placeholder={t('fontMerge.outputPlaceholder')}
          />
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div
            style={{
              fontSize: 12,
              color: '#f87171',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 6,
              padding: '8px 12px',
              whiteSpace: 'pre-line',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
