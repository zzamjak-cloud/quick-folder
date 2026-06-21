import React, { Suspense } from 'react';
import type { ThemeVars } from '../../types';

interface MarkdownEditorProps {
  path: string;
  themeVars: ThemeVars;
  onClose: () => void;
}

const MarkdownEditorBody = React.lazy(() => import('./MarkdownEditorBody'));

export default function MarkdownEditor(props: MarkdownEditorProps) {
  const { themeVars } = props;
  return (
    <Suspense
      fallback={
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          style={{
            backgroundColor: 'rgba(0,0,0,0.7)',
            color: themeVars?.muted ?? '#aaa',
          }}
        >
          마크다운 편집기 로딩 중...
        </div>
      }
    >
      <MarkdownEditorBody {...props} />
    </Suspense>
  );
}
