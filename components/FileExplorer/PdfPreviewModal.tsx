import React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ThemeVars } from '../../types';
import { getFileName } from '../../utils/pathUtils';

interface PdfPreviewModalProps {
  path: string;
  onClose: () => void;
  themeVars: ThemeVars | null;
}

/**
 * PDF 파일을 브라우저 내장 뷰어로 표시하는 미리보기 모달.
 * convertFileSrc로 Tauri asset 프로토콜 URL 변환 후 iframe에 로드.
 * 페이지 탐색, 줌, 검색 등은 브라우저 기본 PDF 뷰어가 처리.
 */
export default function PdfPreviewModal({ path, onClose, themeVars }: PdfPreviewModalProps) {
  const fileName = getFileName(path);
  const pdfSrc = convertFileSrc(path);

  return (
    <div
      className="fixed inset-0 z-[9998] flex flex-col"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      {/* 헤더: 파일명 + 닫기 버튼 */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{
          backgroundColor: themeVars?.surface2 ?? '#1e293b',
          borderBottom: `1px solid ${themeVars?.border ?? '#334155'}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        <span
          className="text-sm font-medium truncate"
          style={{ color: themeVars?.text ?? '#e5e7eb' }}
        >
          {fileName}
        </span>
        <button
          className="text-lg px-2 hover:opacity-70"
          style={{
            color: themeVars?.muted ?? '#94a3b8',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* PDF 뷰어: 브라우저 내장 렌더러 사용 */}
      <div className="flex-1 min-h-0" onClick={e => e.stopPropagation()}>
        <iframe
          src={pdfSrc}
          className="w-full h-full border-none"
          title={fileName}
          style={{ backgroundColor: '#525659' }}
        />
      </div>
    </div>
  );
}
