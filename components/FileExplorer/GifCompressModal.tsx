import React, { useState } from 'react';
import { X } from 'lucide-react';
import { ThemeVars } from './types';
import { invokeTauriCommand as invoke } from '../../utils/tauriInvoke';
import { ensureFfmpeg } from '../../utils/ffmpegSetup';
import type { TranslationKey } from '../../utils/i18n';

interface GifCompressModalProps {
  filePaths: string[];
  onClose: () => void;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  themeVars: ThemeVars | null;
  t: (key: TranslationKey) => string;
}

type CompressionQuality = 'high' | 'medium' | 'low';

function formatMessage(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export default function GifCompressModal({
  filePaths,
  onClose,
  onSuccess,
  onError,
  themeVars,
  t,
}: GifCompressModalProps) {
  const [quality, setQuality] = useState<CompressionQuality>('medium');
  const [reduceSize, setReduceSize] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleCompress = async () => {
    setIsCompressing(true);
    setErrorText(null);
    try {
      // FFmpeg 미설치 시 사용자 동의 후 원 배포처에서 다운로드 (라이선스 정책상 번들하지 않음)
      try {
        if (!(await ensureFfmpeg(t, setCurrentFile))) {
          setErrorText(t('ffmpeg.declined'));
          return;
        }
      } catch {
        setErrorText(t('gifCompress.error.ffmpegMissing'));
        return;
      }

      const failures: string[] = [];
      for (let i = 0; i < filePaths.length; i += 1) {
        const path = filePaths[i];
        const name = path.split(/[\\/]/).pop() ?? path;
        setCurrentIndex(i + 1);
        setCurrentFile(name);
        try {
          await invoke('compress_gif', { path, quality, reduceSize });
        } catch (e) {
          failures.push(`${name}: ${String(e)}`);
        }
      }

      if (failures.length > 0) {
        const message = failures.join('\n');
        setErrorText(message);
        onError?.(message);
        return;
      }

      onSuccess?.();
      onClose();
    } catch (e) {
      console.error('GIF 압축 실패:', e);
      const message = String(e);
      setErrorText(message);
      onError?.(message);
    } finally {
      setIsCompressing(false);
      setCurrentIndex(0);
      setCurrentFile('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-xl p-6 shadow-2xl"
        style={{
          backgroundColor: themeVars?.surface ?? '#1e293b',
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
          width: '420px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <h2
            className="text-lg font-semibold"
            style={{ color: themeVars?.text ?? '#e2e8f0' }}
          >
            {t('gifCompress.title')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            disabled={isCompressing}
          >
            <X size={18} style={{ color: themeVars?.text ?? '#94a3b8', opacity: 0.6 }} />
          </button>
        </div>

        {filePaths.length > 1 && (
          <div
            className="mb-4 rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: themeVars?.surface2 ?? '#0f172a',
              color: themeVars?.text ?? '#e2e8f0',
              border: `1px solid ${themeVars?.border ?? '#334155'}`,
            }}
          >
            {formatMessage(t('gifCompress.targetCount'), { count: filePaths.length })}
            {isCompressing && currentIndex > 0
              ? ` · ${formatMessage(t('gifCompress.progress'), { current: currentIndex, total: filePaths.length })}`
              : ''}
            {currentFile ? (
              <span className="block truncate mt-1" title={currentFile} style={{ color: themeVars?.muted ?? '#94a3b8' }}>
                {currentFile}
              </span>
            ) : null}
          </div>
        )}

        {/* 압축 품질 선택 */}
        <div className="mb-6">
          <label
            className="block text-sm font-medium mb-3"
            style={{ color: themeVars?.text ?? '#e2e8f0' }}
          >
            {t('gifCompress.qualityLabel')}
          </label>
          <div className="space-y-2">
            {[
              { value: 'high' as const, label: t('gifCompress.quality.high.label'), desc: t('gifCompress.quality.high.desc') },
              { value: 'medium' as const, label: t('gifCompress.quality.medium.label'), desc: t('gifCompress.quality.medium.desc') },
              { value: 'low' as const, label: t('gifCompress.quality.low.label'), desc: t('gifCompress.quality.low.desc') },
            ].map((option) => (
              <label
                key={option.value}
                className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                style={{
                  backgroundColor: quality === option.value
                    ? (themeVars?.accent ?? '#4ade80') + '20'
                    : 'transparent',
                  border: `1px solid ${
                    quality === option.value
                      ? (themeVars?.accent ?? '#4ade80')
                      : (themeVars?.border ?? '#334155')
                  }`,
                }}
              >
                <input
                  type="radio"
                  name="quality"
                  value={option.value}
                  checked={quality === option.value}
                  onChange={(e) => setQuality(e.target.value as CompressionQuality)}
                  className="mt-0.5"
                  style={{ accentColor: themeVars?.accent ?? '#4ade80' }}
                />
                <div className="flex-1">
                  <div
                    className="text-sm font-medium"
                    style={{ color: themeVars?.text ?? '#e2e8f0' }}
                  >
                    {option.label}
                  </div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: themeVars?.text ?? '#94a3b8', opacity: 0.7 }}
                  >
                    {option.desc}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* 크기 50% 줄이기 옵션 */}
        <div className="mb-6">
          <label
            className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
            style={{
              backgroundColor: reduceSize
                ? (themeVars?.accent ?? '#4ade80') + '20'
                : 'transparent',
              border: `1px solid ${
                reduceSize
                  ? (themeVars?.accent ?? '#4ade80')
                  : (themeVars?.border ?? '#334155')
              }`,
            }}
          >
            <input
              type="checkbox"
              checked={reduceSize}
              onChange={(e) => setReduceSize(e.target.checked)}
              className="mt-0.5"
              style={{ accentColor: themeVars?.accent ?? '#4ade80' }}
            />
            <div className="flex-1">
              <div
                className="text-sm font-medium"
                style={{ color: themeVars?.text ?? '#e2e8f0' }}
              >
                {t('gifCompress.reduceSizeLabel')}
              </div>
              <div
                className="text-xs mt-0.5"
                style={{ color: themeVars?.text ?? '#94a3b8', opacity: 0.7 }}
              >
                {t('gifCompress.reduceSizeDesc')}
              </div>
            </div>
          </label>
        </div>

        {/* 버튼 */}
        {errorText && (
          <div
            className="mb-4 rounded-lg px-3 py-2 text-xs whitespace-pre-line max-h-24 overflow-auto"
            style={{
              backgroundColor: 'rgba(239,68,68,0.12)',
              color: '#fca5a5',
              border: '1px solid rgba(239,68,68,0.35)',
            }}
          >
            {errorText}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isCompressing}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: themeVars?.surface ?? '#1e293b',
              border: `1px solid ${themeVars?.border ?? '#334155'}`,
              color: themeVars?.text ?? '#e2e8f0',
              opacity: isCompressing ? 0.5 : 1,
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleCompress}
            disabled={isCompressing}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: themeVars?.accent ?? '#4ade80',
              color: '#000',
              opacity: isCompressing ? 0.7 : 1,
            }}
          >
            {isCompressing ? t('gifCompress.compressing') : t('gifCompress.compress')}
          </button>
        </div>
      </div>
    </div>
  );
}
