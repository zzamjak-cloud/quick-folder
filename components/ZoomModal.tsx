import React from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import type { TranslationKey } from '../utils/i18n';

interface ZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  zoomPercent: number;
  setZoomPercent: (v: number | ((prev: number) => number)) => void;
  t: (key: TranslationKey) => string;
}

export function ZoomModal({ isOpen, onClose, zoomPercent, setZoomPercent, t }: ZoomModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('zoom.title')}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-[var(--qf-muted)]">{t('zoom.current')}</div>
          <div className="text-sm font-semibold text-[var(--qf-text)]">{zoomPercent}%</div>
        </div>
        <input type="range" min={50} max={150} step={10} value={zoomPercent} onChange={(e) => setZoomPercent(Number(e.target.value))} className="w-full" aria-label={t('zoom.sliderAria')} />
        <div className="flex items-center justify-between">
          <Button type="button" variant="secondary" onClick={() => setZoomPercent((p) => Math.max(50, p - 10))}>－</Button>
          <Button type="button" variant="ghost" onClick={() => setZoomPercent(100)}>{t('zoom.reset100')}</Button>
          <Button type="button" variant="secondary" onClick={() => setZoomPercent((p) => Math.min(150, p + 10))}>＋</Button>
        </div>
      </div>
    </Modal>
  );
}
