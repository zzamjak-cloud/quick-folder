import React, { Suspense } from 'react';
import type { ThemeVars } from '../../types';
import type { TranslationKey } from '../../utils/i18n';

interface MarkdownEditorProps {
  path: string;
  themeVars: ThemeVars;
  onClose: () => void;
  t: (key: TranslationKey) => string;
}

const MarkdownEditorBody = React.lazy(() => import('./MarkdownEditorBody'));

export default function MarkdownEditor(props: MarkdownEditorProps) {
  const { themeVars, t } = props;
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
          {t('markdownEditor.loading')}
        </div>
      }
    >
      <MarkdownEditorBody {...props} />
    </Suspense>
  );
}
