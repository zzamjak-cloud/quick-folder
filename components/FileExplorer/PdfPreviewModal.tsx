import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
// @ts-ignore — Vite ?url 임포트, TS 타입 정의 없음
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ThemeVars } from '../../types';
import { getFileName } from '../../utils/pathUtils';

// PDF.js Worker 경로 설정 (Vite ?url 임포트)
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/** 맞춤 모드 타입 */
type FitMode = 'width' | 'page' | 'none';

interface PdfPreviewModalProps {
  path: string;
  onClose: () => void;
  themeVars: ThemeVars | null;
}

/**
 * PDF 파일을 PDF.js Canvas로 렌더링하는 미리보기 모달.
 * 플랫폼(Windows/macOS) 무관하게 동일한 UI 제공.
 * 페이지 탐색, 줌 조절, 너비/페이지 맞춤 기능 포함.
 */
export default function PdfPreviewModal({ path, onClose, themeVars }: PdfPreviewModalProps) {
  const fileName = getFileName(path);

  // PDF 문서 및 페이지 상태
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');

  // 줌 및 맞춤 모드 상태
  const [scale, setScale] = useState(1.0);
  const [fitMode, setFitMode] = useState<FitMode>('width');

  // 로딩 상태
  const [loading, setLoading] = useState(true);

  // Canvas 및 컨테이너 ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 현재 진행 중인 렌더 태스크 ref (중복 렌더 방지)
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // PDF 문서 로드
  useEffect(() => {
    setLoading(true);
    const url = convertFileSrc(path);
    const loadingTask = pdfjsLib.getDocument(url);

    let loadedDoc: PDFDocumentProxy | null = null;

    loadingTask.promise.then((doc) => {
      loadedDoc = doc;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setCurrentPage(1);
      setPageInput('1');
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    return () => {
      // 컴포넌트 언마운트 또는 path 변경 시 로딩 취소 및 문서 해제
      loadingTask.destroy();
      loadedDoc?.destroy();
    };
  }, [path]);

  /**
   * 스케일을 계산한다.
   * fitMode에 따라 컨테이너 크기 기반으로 자동 계산하거나 scale 직접 사용.
   */
  const computeScale = useCallback(
    (pageWidth: number, pageHeight: number): number => {
      const container = containerRef.current;
      if (!container) return scale;
      const w = container.clientWidth;
      const h = container.clientHeight;

      if (fitMode === 'width') {
        return (w - 32) / pageWidth;
      } else if (fitMode === 'page') {
        return Math.min((w - 32) / pageWidth, (h - 32) / pageHeight);
      }
      return scale;
    },
    [fitMode, scale]
  );

  /**
   * 지정한 페이지를 Canvas에 렌더링한다.
   * 이전 렌더 태스크가 진행 중이면 취소 후 새 태스크 시작.
   */
  const renderPage = useCallback(
    async (doc: PDFDocumentProxy, pageNum: number) => {
      if (!canvasRef.current) return;

      // 이전 렌더 태스크 취소
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      const page = await doc.getPage(pageNum);
      const { width: pw, height: ph } = page.getViewport({ scale: 1 });
      const computedScale = computeScale(pw, ph);
      const viewport = page.getViewport({ scale: computedScale });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Canvas 크기를 뷰포트에 맞게 설정
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        canvas,
      });
      renderTaskRef.current = renderTask;

      try {
        await renderTask.promise;
      } catch (err: unknown) {
        // RenderingCancelledException은 정상적인 취소이므로 무시
        if (err instanceof Error && err.name === 'RenderingCancelledException') {
          return;
        }
        // 그 외 오류는 콘솔에 출력
        console.error('PDF 렌더 오류:', err);
      }
    },
    [computeScale]
  );

  // 페이지 또는 스케일 변경 시 재렌더
  useEffect(() => {
    if (pdfDoc) {
      renderPage(pdfDoc, currentPage);
    }
  }, [pdfDoc, currentPage, renderPage]);

  // 컨테이너 크기 변화 감지 → fitMode가 none이 아니면 재렌더
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !pdfDoc) return;

    const observer = new ResizeObserver(() => {
      if (fitMode !== 'none') {
        renderPage(pdfDoc, currentPage);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [pdfDoc, currentPage, fitMode, renderPage]);

  /** 이전 페이지로 이동 */
  const goToPrevPage = () => {
    const next = Math.max(1, currentPage - 1);
    setCurrentPage(next);
    setPageInput(String(next));
  };

  /** 다음 페이지로 이동 */
  const goToNextPage = () => {
    const next = Math.min(totalPages, currentPage + 1);
    setCurrentPage(next);
    setPageInput(String(next));
  };

  /** 페이지 입력창 확정 처리 */
  const handlePageInputCommit = () => {
    const num = parseInt(pageInput, 10);
    if (!isNaN(num) && num >= 1 && num <= totalPages) {
      setCurrentPage(num);
    } else {
      setPageInput(String(currentPage));
    }
  };

  /** 줌 퍼센트 증가 (10% 단위) */
  const zoomIn = () => {
    setFitMode('none');
    setScale(prev => Math.min(prev + 0.1, 5.0));
  };

  /** 줌 퍼센트 감소 (10% 단위) */
  const zoomOut = () => {
    setFitMode('none');
    setScale(prev => Math.max(prev - 0.1, 0.1));
  };

  /** 너비 맞춤 버튼 토글 */
  const setFitWidth = () => setFitMode('width');

  /** 페이지 맞춤 버튼 토글 */
  const setFitPage = () => setFitMode('page');

  // 현재 표시할 줌 퍼센트 계산 (fitMode가 none이 아니면 scale 기반 근사치)
  const displayPercent = Math.round(scale * 100);

  // 공통 색상
  const surface2 = themeVars?.surface2 ?? '#1e293b';
  const border = themeVars?.border ?? '#334155';
  const textColor = themeVars?.text ?? '#e5e7eb';
  const mutedColor = themeVars?.muted ?? '#94a3b8';
  const accentColor = themeVars?.accent ?? '#3b82f6';

  // 툴바 버튼 공통 스타일
  const toolbarBtn: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: mutedColor,
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 13,
  };

  // active 버튼 스타일 (너비/페이지 맞춤 선택 시)
  const activeBtnStyle = (active: boolean): React.CSSProperties => ({
    ...toolbarBtn,
    color: active ? accentColor : mutedColor,
    fontWeight: active ? 600 : 400,
    borderBottom: active ? `2px solid ${accentColor}` : '2px solid transparent',
  });

  return (
    <div
      className="fixed inset-0 z-[9998] flex flex-col"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      {/* 헤더: 파일명 + 닫기 버튼 */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{
          backgroundColor: surface2,
          borderBottom: `1px solid ${border}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        <span className="text-sm font-medium truncate" style={{ color: textColor }}>
          {fileName}
        </span>
        <button
          style={{ ...toolbarBtn, fontSize: 18 }}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* 툴바: 페이지 탐색 + 줌 조절 */}
      <div
        className="flex items-center gap-3 px-4 py-1 shrink-0 flex-wrap"
        style={{
          backgroundColor: surface2,
          borderBottom: `1px solid ${border}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 페이지 탐색 */}
        <div className="flex items-center gap-1">
          <button style={toolbarBtn} onClick={goToPrevPage} disabled={currentPage <= 1}>
            ◀
          </button>
          <input
            type="text"
            value={pageInput}
            onChange={e => setPageInput(e.target.value)}
            onBlur={handlePageInputCommit}
            onKeyDown={e => { if (e.key === 'Enter') handlePageInputCommit(); }}
            style={{
              width: 36,
              textAlign: 'center',
              background: 'rgba(255,255,255,0.08)',
              border: `1px solid ${border}`,
              borderRadius: 4,
              color: textColor,
              fontSize: 12,
              padding: '1px 4px',
            }}
          />
          <span style={{ color: mutedColor, fontSize: 12 }}>/ {totalPages}</span>
          <button style={toolbarBtn} onClick={goToNextPage} disabled={currentPage >= totalPages}>
            ▶
          </button>
        </div>

        {/* 구분선 */}
        <div style={{ width: 1, height: 18, backgroundColor: border }} />

        {/* 맞춤 버튼 */}
        <button style={activeBtnStyle(fitMode === 'width')} onClick={setFitWidth}>
          너비
        </button>
        <button style={activeBtnStyle(fitMode === 'page')} onClick={setFitPage}>
          페이지
        </button>

        {/* 구분선 */}
        <div style={{ width: 1, height: 18, backgroundColor: border }} />

        {/* 줌 조절 */}
        <div className="flex items-center gap-1">
          <button style={toolbarBtn} onClick={zoomOut}>−</button>
          <span style={{ color: mutedColor, fontSize: 12, minWidth: 36, textAlign: 'center' }}>
            {displayPercent}%
          </span>
          <button style={toolbarBtn} onClick={zoomIn}>+</button>
        </div>
      </div>

      {/* PDF 렌더링 영역 */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto flex justify-center items-start"
        style={{ backgroundColor: '#525659', padding: 16 }}
        onClick={e => e.stopPropagation()}
      >
        {loading ? (
          // 로딩 중 표시
          <div
            className="flex items-center justify-center w-full h-full"
            style={{ color: mutedColor, fontSize: 14 }}
          >
            로딩 중...
          </div>
        ) : (
          // PDF.js Canvas 출력
          <canvas
            ref={canvasRef}
            style={{
              display: 'block',
              boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
              maxWidth: '100%',
            }}
          />
        )}
      </div>
    </div>
  );
}
