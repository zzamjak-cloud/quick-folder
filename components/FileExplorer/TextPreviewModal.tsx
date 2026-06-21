import { getFileName } from '../../utils/pathUtils';
import type { ThemeVars } from './types';

interface TextPreviewModalProps {
  path: string | null;
  content: string | null;
  themeVars: ThemeVars | null;
  onClose: () => void;
}

export function TextPreviewModal({ path, content, themeVars, onClose }: TextPreviewModalProps) {
  if (!path) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{
          backgroundColor: themeVars?.surface2 ?? '#1e293b',
          width: '70vw',
          maxWidth: 800,
          maxHeight: '85vh',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}
        >
          <span className="text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
            {getFileName(path)}
          </span>
          <button
            className="text-lg px-2 hover:opacity-70"
            style={{ color: themeVars?.muted ?? '#94a3b8' }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <pre
          className="flex-1 overflow-auto p-4 text-xs leading-relaxed whitespace-pre-wrap"
          style={{ color: themeVars?.text ?? '#e5e7eb', maxHeight: '75vh' }}
        >
          {content ?? '로딩 중...'}
        </pre>
      </div>
    </div>
  );
}
