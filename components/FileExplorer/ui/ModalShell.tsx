import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { ThemeVars } from '../types';
import { getBtnBase } from './modalStyles';

interface ModalShellProps {
  title: string;
  maxWidth?: string;          // 기본 '40rem'
  width?: number | string;    // 고정 너비 (BulkRename용)
  minHeight?: string;          // 모달 박스 최소 높이
  height?: string;             // 모달 박스 고정 높이 (min/max와 함께 탭 전환 시 크기 고정용)
  maxHeight?: string;         // 최대 높이 (BulkRename용)
  saving?: boolean;
  saveLabel?: string;         // 기본 '저장'
  savingLabel?: string;       // 기본 `${saveLabel} 중...`
  overlayClose?: boolean;     // 오버레이 클릭 시 닫기 (기본 false)
  zIndex?: number;            // 기본 10000
  footerBtnStyle?: React.CSSProperties; // 푸터 버튼 스타일 오버라이드
  onClose: () => void;
  onSave: () => void;
  themeVars: ThemeVars | null;
  children: React.ReactNode;
}

/**
 * 모달 공통 셸 컴포넌트
 * - 오버레이, 컨테이너, 헤더(타이틀+X), 푸터(취소+저장) 포함
 * - ESC 키 핸들러 내장
 */
export default function ModalShell({
  title,
  maxWidth = '40rem',
  width,
  minHeight,
  height,
  maxHeight,
  saving = false,
  saveLabel = '저장',
  savingLabel,
  overlayClose = false,
  zIndex = 10000,
  footerBtnStyle,
  onClose,
  onSave,
  themeVars,
  children,
}: ModalShellProps) {
  const resolvedSavingLabel = savingLabel ?? `${saveLabel} 중...`;
  const btnBase = footerBtnStyle ?? getBtnBase(themeVars);

  // ESC 키로 닫기 (saving 중에는 무시)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saving, onClose]);

  return (
    <div
      className={`fixed inset-0 z-[${zIndex}] flex items-center justify-center`}
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', zIndex }}
      onClick={overlayClose ? onClose : undefined}
    >
      <div
        className="rounded-lg shadow-2xl flex flex-col"
        style={{
          backgroundColor: themeVars?.surface2 ?? '#1e293b',
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
          width: width ?? '100%',
          maxWidth: width ? undefined : maxWidth,
          minHeight,
          height,
          maxHeight,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          className="flex shrink-0 items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}
        >
          <span
            className="text-sm font-medium truncate flex-1 mr-2"
            style={{ color: themeVars?.text ?? '#e5e7eb' }}
          >
            {title}
          </span>
          <button
            className="p-1 hover:opacity-70 flex-shrink-0"
            style={{ color: themeVars?.muted }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* 본문 (children) */}
        {children}

        {/* 하단 버튼 */}
        <div
          className="flex shrink-0 justify-end gap-2 px-4 py-3"
          style={{ borderTop: `1px solid ${themeVars?.border ?? '#334155'}` }}
        >
          <button style={btnBase} onClick={onClose} disabled={saving}>
            취소
          </button>
          <button
            style={{
              ...btnBase,
              backgroundColor: themeVars?.accent ?? '#3b82f6',
              color: '#fff',
              border: 'none',
              opacity: saving ? 0.5 : 1,
            }}
            onClick={onSave}
            disabled={saving}
          >
            {saving ? resolvedSavingLabel : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
