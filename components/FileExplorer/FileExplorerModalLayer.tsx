import React, { Suspense, lazy } from 'react';
import type { FileEntry } from '../../types';
import type { ThemeVars } from './types';
import type { PreviewState } from './hooks/usePreview';
import type { useModalStates } from './hooks/useModalStates';
import type { LaigterParamsUI } from './MapMakerModal';

const PreviewModals = lazy(() => import('./PreviewModals').then(module => ({ default: module.PreviewModals })));
const PixelateModal = lazy(() => import('./PixelateModal'));
const MapMakerModal = lazy(() => import('./MapMakerModal'));
const RemoveWhiteBgModal = lazy(() => import('./RemoveWhiteBgModal'));
const SheetPackerModal = lazy(() => import('./SheetPackerModal'));
const SheetUnpackModal = lazy(() => import('./SheetUnpackModal'));
const BulkRenameModal = lazy(() => import('./BulkRenameModal'));
const MarkdownEditor = lazy(() => import('./MarkdownEditor'));
const FontPreviewModal = lazy(() => import('./FontPreviewModal'));
const GifCompressModal = lazy(() => import('./GifCompressModal'));
const PdfPreviewModal = lazy(() => import('./PdfPreviewModal'));
const AudioPreviewModal = lazy(() => import('./AudioPreviewModal'));
const CodePreviewModal = lazy(() => import('./CodePreviewModal'));
const FbxPreviewModal = lazy(() => import('./FbxPreviewModal'));
const FontMergeModal = lazy(() => import('./FontMergeModal'));
const FolderMergeModal = lazy(() => import('./FolderMergeModal'));
const TerminalPresetModal = lazy(() => import('./TerminalPresetModal'));
const GoToFolderModal = lazy(() => import('./GoToFolderModal'));
const GlobalSearchModal = lazy(() => import('./GlobalSearchModal'));
const DuplicateFilesModal = lazy(() => import('./DuplicateFilesModal'));
const DiffViewerModal = lazy(() => import('./DiffViewerModal'));

type ModalState = ReturnType<typeof useModalStates>;

interface FileExplorerModalLayerProps {
  modals: ModalState;
  preview: PreviewState;
  entries: FileEntry[];
  currentPath: string | null;
  themeVars: ThemeVars | null;
  sheetPackDefaultName: string;
  recentPath: string;
  onReloadCurrentPath: () => void;
  onPreviewCropSave: (outputPath: string) => void;
  onGifToMp4: (paths: string[]) => Promise<void>;
  onPixelateApply: (path: string, pixelSize: number, scale: number, maxColors: number) => Promise<void>;
  onMapMakerExport: (
    inputPath: string,
    params: LaigterParamsUI,
    options: { saveNormal: boolean; saveParallax: boolean; saveSpecular: boolean; saveOcclusion: boolean },
  ) => Promise<void>;
  onRemoveWhiteBgApply: (
    paths: string[],
    threshold: number,
    feather: number,
    seeds: [number, number][],
    trim: boolean,
  ) => Promise<void>;
  onBulkRenameApply: (renames: { oldPath: string; newPath: string }[]) => Promise<void>;
  onNavigate: (path: string) => void;
  onGlobalSearchSelect: (entry: FileEntry) => void;
  onDuplicateFileDelete: (path: string) => Promise<void>;
  onMergeFontsComplete: (outputPath: string) => void;
  onFolderMergeComplete: () => void;
}

export default function FileExplorerModalLayer({
  modals,
  preview,
  entries,
  currentPath,
  themeVars,
  sheetPackDefaultName,
  recentPath,
  onReloadCurrentPath,
  onPreviewCropSave,
  onGifToMp4,
  onPixelateApply,
  onMapMakerExport,
  onRemoveWhiteBgApply,
  onBulkRenameApply,
  onNavigate,
  onGlobalSearchSelect,
  onDuplicateFileDelete,
  onMergeFontsComplete,
  onFolderMergeComplete,
}: FileExplorerModalLayerProps) {
  const shouldRenderPreviewModals = Boolean(
    preview.previewImagePath ||
    preview.videoPlayerPath ||
    preview.previewTextPath ||
    preview.previewJsonPath ||
    preview.previewMdPath ||
    preview.hwpPreviewPath
  );

  return (
    <>
      {shouldRenderPreviewModals && (
        <Suspense fallback={null}>
          <PreviewModals
            preview={preview}
            themeVars={themeVars}
            previewEntry={entries.find((entry) => entry.path === preview.previewImagePath) ?? null}
            onCropSave={onPreviewCropSave}
            onRemoveBg={(path) => {
              modals.setRemoveWhiteBgPaths([path]);
            }}
            onOpenGifCompress={(paths) => modals.setGifCompressPaths(paths)}
            onGifToMp4={onGifToMp4}
            onOpenImageCompress={() => {}}
            onOpenImageResize={() => {}}
            onOpenMdEditor={(path) => modals.setMarkdownEditorPath(path)}
            onFileChanged={onReloadCurrentPath}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        {modals.pixelatePath && (
          <PixelateModal
            path={modals.pixelatePath}
            onClose={() => modals.setPixelatePath(null)}
            onApply={onPixelateApply}
            themeVars={themeVars}
          />
        )}

        {modals.mapMakerPath && (
          <MapMakerModal
            path={modals.mapMakerPath}
            onClose={() => modals.setMapMakerPath(null)}
            onExport={onMapMakerExport}
            themeVars={themeVars}
          />
        )}

        {modals.removeWhiteBgPaths && (
          <RemoveWhiteBgModal
            paths={modals.removeWhiteBgPaths}
            onClose={() => modals.setRemoveWhiteBgPaths(null)}
            onApply={onRemoveWhiteBgApply}
            themeVars={themeVars}
          />
        )}

        {modals.gifCompressPaths && (
          <GifCompressModal
            filePaths={modals.gifCompressPaths}
            onClose={() => modals.setGifCompressPaths(null)}
            onSuccess={onReloadCurrentPath}
            onError={(err) => console.error('GIF 압축 실패:', err)}
            themeVars={themeVars}
          />
        )}

        {modals.sheetPackPaths && currentPath && (
          <SheetPackerModal
            imagePaths={modals.sheetPackPaths}
            defaultName={sheetPackDefaultName}
            currentPath={currentPath}
            onClose={() => {
              modals.setSheetPackPaths(null);
              onReloadCurrentPath();
            }}
            themeVars={themeVars}
          />
        )}

        {modals.sheetUnpackPath && currentPath && (
          <SheetUnpackModal
            path={modals.sheetUnpackPath}
            currentPath={currentPath}
            onClose={() => {
              modals.setSheetUnpackPath(null);
              onReloadCurrentPath();
            }}
            themeVars={themeVars}
          />
        )}

        {modals.bulkRenamePaths && (
          <BulkRenameModal
            paths={modals.bulkRenamePaths}
            onClose={() => modals.setBulkRenamePaths(null)}
            onApply={onBulkRenameApply}
            themeVars={themeVars}
          />
        )}

        {modals.terminalPresetPath && (
          <TerminalPresetModal
            path={modals.terminalPresetPath}
            initialEditId={modals.terminalPresetEditId}
            onClose={() => {
              modals.setTerminalPresetPath(null);
              modals.setTerminalPresetEditId(null);
            }}
            themeVars={themeVars}
          />
        )}

        {modals.isGoToFolderOpen && (
          <GoToFolderModal
            isOpen={modals.isGoToFolderOpen}
            onClose={() => modals.setIsGoToFolderOpen(false)}
            onNavigate={onNavigate}
            themeVars={themeVars}
          />
        )}

        {modals.isGlobalSearchOpen && currentPath && currentPath !== recentPath && (
          <GlobalSearchModal
            isOpen={modals.isGlobalSearchOpen}
            onClose={() => modals.setIsGlobalSearchOpen(false)}
            currentPath={currentPath}
            onSelect={onGlobalSearchSelect}
            themeVars={themeVars}
          />
        )}

        {modals.duplicateFinderPath && (
          <DuplicateFilesModal
            rootPath={modals.duplicateFinderPath}
            onClose={() => modals.setDuplicateFinderPath(null)}
            onSelect={onGlobalSearchSelect}
            onDelete={onDuplicateFileDelete}
            themeVars={themeVars}
          />
        )}

        {modals.diffViewerPaths && (
          <DiffViewerModal
            leftPath={modals.diffViewerPaths[0]}
            rightPath={modals.diffViewerPaths[1]}
            themeVars={themeVars}
            onClose={() => modals.setDiffViewerPaths(null)}
          />
        )}

        {modals.markdownEditorPath && (
          <MarkdownEditor
            path={modals.markdownEditorPath}
            themeVars={themeVars}
            onClose={() => {
              modals.setMarkdownEditorPath(null);
              onReloadCurrentPath();
            }}
          />
        )}

        {modals.fontPreviewPath && (
          <FontPreviewModal
            path={modals.fontPreviewPath}
            onClose={() => modals.setFontPreviewPath(null)}
            themeVars={themeVars}
          />
        )}

        {modals.pdfPreviewPath && (
          <PdfPreviewModal
            path={modals.pdfPreviewPath}
            onClose={() => modals.setPdfPreviewPath(null)}
            themeVars={themeVars}
          />
        )}

        {modals.audioPreviewPath && (
          <AudioPreviewModal
            path={modals.audioPreviewPath}
            entries={entries}
            onClose={() => modals.setAudioPreviewPath(null)}
            themeVars={themeVars}
          />
        )}

        {preview.codePreviewPath && (
          <CodePreviewModal
            path={preview.codePreviewPath}
            onClose={() => preview.setCodePreviewPath(null)}
            themeVars={themeVars}
            editRequestToken={preview.codePreviewEditRequest}
          />
        )}

        {preview.fbxPreviewPath && (
          <FbxPreviewModal
            path={preview.fbxPreviewPath}
            onClose={() => preview.setFbxPreviewPath(null)}
            themeVars={themeVars}
          />
        )}

        {modals.fontMergePaths && modals.fontMergePaths.length === 2 && (
          <FontMergeModal
            paths={modals.fontMergePaths}
            onClose={() => modals.setFontMergePaths(null)}
            onApply={(outputPath) => {
              modals.setFontMergePaths(null);
              onMergeFontsComplete(outputPath);
            }}
            themeVars={themeVars}
          />
        )}

        {modals.folderMergeRequest && (
          <FolderMergeModal
            request={modals.folderMergeRequest}
            onClose={() => modals.setFolderMergeRequest(null)}
            onComplete={onFolderMergeComplete}
            themeVars={themeVars}
          />
        )}
      </Suspense>
    </>
  );
}
