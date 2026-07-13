import VideoPlayer from './VideoPlayer';
import type { ThemeVars } from './types';
import type { TranslationKey } from '../../utils/i18n';

interface VideoPreviewModalProps {
  path: string | null;
  themeVars: ThemeVars | null;
  onClose: () => void;
  onFileChanged?: () => void;
  t: (key: TranslationKey) => string;
}

export function VideoPreviewModal({ path, themeVars, onClose, onFileChanged, t }: VideoPreviewModalProps) {
  if (!path) return null;

  return (
    <VideoPlayer
      path={path}
      onClose={onClose}
      onFileChanged={onFileChanged}
      themeVars={themeVars}
      t={t}
    />
  );
}
