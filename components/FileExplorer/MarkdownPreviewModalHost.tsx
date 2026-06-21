import MarkdownPreviewModal from './MarkdownPreviewModal';
import type { ThemeVars } from './types';

interface MarkdownPreviewModalHostProps {
  path: string | null;
  content: string | null;
  error: string | null;
  loading: boolean;
  themeVars: ThemeVars | null;
  onClose: () => void;
  onEdit: (path: string) => void;
}

export function MarkdownPreviewModalHost({
  path,
  content,
  error,
  loading,
  themeVars,
  onClose,
  onEdit,
}: MarkdownPreviewModalHostProps) {
  if (!path) return null;

  return (
    <MarkdownPreviewModal
      path={path}
      content={content}
      error={error}
      loading={loading}
      themeVars={themeVars}
      onClose={onClose}
      onEdit={() => onEdit(path)}
    />
  );
}
