import React from 'react';
import { ThemeVars } from '../types';

/** 체커보드 배경 (투명 영역 표시용) */
export const checkerboardStyle: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #808080 25%, transparent 25%), ' +
    'linear-gradient(-45deg, #808080 25%, transparent 25%), ' +
    'linear-gradient(45deg, transparent 75%, #808080 75%), ' +
    'linear-gradient(-45deg, transparent 75%, #808080 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
};

/** 공통 버튼 기본 스타일 */
export function getBtnBase(themeVars: ThemeVars | null): React.CSSProperties {
  return {
    padding: '5px 14px',
    fontSize: 12,
    borderRadius: 6,
    border: `1px solid ${themeVars?.border ?? '#334155'}`,
    backgroundColor: themeVars?.surface ?? '#111827',
    color: themeVars?.text ?? '#e5e7eb',
    cursor: 'pointer',
  };
}

/** 공통 입력 필드 스타일 */
export function getInputStyle(themeVars: ThemeVars | null): React.CSSProperties {
  return {
    backgroundColor: themeVars?.surface ?? '#111827',
    color: themeVars?.text ?? '#e5e7eb',
    border: `1px solid ${themeVars?.border ?? '#334155'}`,
    padding: '4px 8px',
    fontSize: 12,
    borderRadius: 4,
    outline: 'none',
    width: 60,
  };
}

/** 로딩 스피너 컴포넌트 */
export function Spinner({ themeVars }: { themeVars: ThemeVars | null }): React.JSX.Element {
  return React.createElement('div', { className: 'flex items-center justify-center' },
    React.createElement('div', {
      className: 'w-6 h-6 rounded-full border-2 border-t-transparent animate-spin',
      style: { borderColor: `${themeVars?.accent ?? '#3b82f6'} transparent transparent transparent` },
    })
  );
}
