import JsonViewerModal from './JsonViewerModal';
import type { ThemeVars } from './types';

interface JsonPreviewModalHostProps {
  path: string | null;
  data: unknown | null;
  editRequestToken: number;
  themeVars: ThemeVars | null;
  onClose: () => void;
}

export function JsonPreviewModalHost({
  path,
  data,
  editRequestToken,
  themeVars,
  onClose,
}: JsonPreviewModalHostProps) {
  if (!path || !data) return null;

  return (
    <JsonViewerModal
      path={path}
      data={data}
      onClose={onClose}
      themeVars={themeVars}
      editRequestToken={editRequestToken}
    />
  );
}
