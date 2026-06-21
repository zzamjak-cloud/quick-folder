import { ImagePreviewModal } from './ImagePreviewModal';
import { VideoPreviewModal } from './VideoPreviewModal';
import { TextPreviewModal } from './TextPreviewModal';
import { JsonPreviewModalHost } from './JsonPreviewModalHost';
import { MarkdownPreviewModalHost } from './MarkdownPreviewModalHost';
import { HwpPreviewModalHost } from './HwpPreviewModalHost';
import type { ThemeVars } from './types';
import type { PreviewState } from './hooks/usePreview';
import type { FileEntry } from '../../types';

interface PreviewModalsProps {
  preview: PreviewState;
  themeVars: ThemeVars | null;
  previewEntry?: FileEntry | null;
  onCropSave?: (outputPath: string) => void;
  onRemoveBg?: (path: string) => void;
  onOpenGifCompress?: (paths: string[]) => void;
  onGifToMp4?: (paths: string[]) => void;
  onOpenImageCompress?: (path: string) => void;
  onOpenImageResize?: (path: string) => void;
  onOpenMdEditor: (path: string) => void;
  onFileChanged?: () => void;
}

export function PreviewModals({
  preview,
  themeVars,
  previewEntry,
  onCropSave,
  onRemoveBg,
  onOpenGifCompress,
  onGifToMp4,
  onOpenImageCompress,
  onOpenImageResize,
  onOpenMdEditor,
  onFileChanged,
}: PreviewModalsProps) {
  return (
    <>
      <VideoPreviewModal
        path={preview.videoPlayerPath}
        onClose={() => preview.setVideoPlayerPath(null)}
        onFileChanged={onFileChanged}
        themeVars={themeVars}
      />
      <ImagePreviewModal
        preview={preview}
        themeVars={themeVars}
        previewEntry={previewEntry}
        onCropSave={onCropSave}
        onRemoveBg={onRemoveBg}
        onOpenGifCompress={onOpenGifCompress}
        onGifToMp4={onGifToMp4}
        onOpenImageCompress={onOpenImageCompress}
        onOpenImageResize={onOpenImageResize}
      />
      <TextPreviewModal
        path={preview.previewTextPath}
        content={preview.previewTextContent}
        themeVars={themeVars}
        onClose={preview.closeTextPreview}
      />
      <JsonPreviewModalHost
        path={preview.previewJsonPath}
        data={preview.previewJsonData}
        editRequestToken={preview.previewJsonEditRequest}
        themeVars={themeVars}
        onClose={preview.closeJsonPreview}
      />
      <MarkdownPreviewModalHost
        path={preview.previewMdPath}
        content={preview.previewMdContent}
        error={preview.previewMdError}
        loading={preview.previewMdLoading}
        themeVars={themeVars}
        onClose={preview.closeMdPreview}
        onEdit={(path) => {
          preview.closeMdPreview();
          onOpenMdEditor(path);
        }}
      />
      <HwpPreviewModalHost
        path={preview.hwpPreviewPath}
        themeVars={themeVars}
        onClose={() => preview.setHwpPreviewPath(null)}
      />
    </>
  );
}
