import VideoPlayer from './VideoPlayer';
import type { ThemeVars } from './types';

interface VideoPreviewModalProps {
  path: string | null;
  themeVars: ThemeVars | null;
  onClose: () => void;
  onFileChanged?: () => void;
}

export function VideoPreviewModal({ path, themeVars, onClose, onFileChanged }: VideoPreviewModalProps) {
  if (!path) return null;

  return (
    <VideoPlayer
      path={path}
      onClose={onClose}
      onFileChanged={onFileChanged}
      themeVars={themeVars}
    />
  );
}
