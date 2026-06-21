import HwpPreviewModal from './HwpPreviewModal';
import type { ThemeVars } from './types';

interface HwpPreviewModalHostProps {
  path: string | null;
  themeVars: ThemeVars | null;
  onClose: () => void;
}

export function HwpPreviewModalHost({ path, themeVars, onClose }: HwpPreviewModalHostProps) {
  if (!path) return null;

  return (
    <HwpPreviewModal
      path={path}
      themeVars={themeVars}
      onClose={onClose}
    />
  );
}
