import React, { useEffect, useRef, useState } from 'react';
import { FileText, Folder, HardDrive, Loader2, X } from 'lucide-react';
import type { FileEntry } from '../../types';
import type { ContextMenuSection, ThemeVars } from './types';
import type { PreviewState } from './hooks/usePreview';
import type { useModalStates } from './hooks/useModalStates';
import type { PendingDrop } from './hooks/useInternalDragDrop';
import type { FolderSizeDialogState } from './hooks/useFileOperations';
import type { LaigterParamsUI } from './MapMakerModal';
import ContextMenu from './ContextMenu';
import FileExplorerModalLayer from './FileExplorerModalLayer';
import { useEscapeKey } from './hooks/useEscapeKey';

type ModalState = ReturnType<typeof useModalStates>;
type FolderSizeChild = NonNullable<FolderSizeDialogState['children']>[number];

interface ExplorerModalBridgeFileOps {
  copyToast: string | null;
  folderSizeDialog: FolderSizeDialogState | null;
  closeFolderSizeDialog: () => void;
  permanentDeleteConfirm: { paths: string[] } | null;
  setPermanentDeleteConfirm: React.Dispatch<React.SetStateAction<{ paths: string[] } | null>>;
  executePermanentDelete: () => Promise<void>;
  elevatedDeleteConfirm: { paths: string[] } | null;
  setElevatedDeleteConfirm: React.Dispatch<React.SetStateAction<{ paths: string[] } | null>>;
  executeElevatedDelete: () => Promise<void>;
  ungroupConfirm: { path: string } | null;
  setUngroupConfirm: React.Dispatch<React.SetStateAction<{ path: string } | null>>;
  executeUngroupFolder: () => Promise<void>;
  operationProgress: { type: string; current: number; total: number; itemLabel?: string } | null;
  sheetPackDefaultName: string;
  handleGifToMp4: (paths: string[]) => Promise<void>;
  handlePixelateApply: (path: string, pixelSize: number, scale: number, maxColors: number) => Promise<void>;
  handleLaigterMapsExport: (
    inputPath: string,
    params: LaigterParamsUI,
    options: { saveNormal: boolean; saveParallax: boolean; saveSpecular: boolean; saveOcclusion: boolean },
  ) => Promise<void>;
  handleRemoveWhiteBgApply: (
    paths: string[],
    threshold: number,
    feather: number,
    seeds: [number, number][],
    trim: boolean,
  ) => Promise<void>;
  handleBulkRenameApply: (renames: { oldPath: string; newPath: string }[]) => Promise<void>;
  handleMergeFontsComplete: (outputPath: string) => void;
}

interface ExplorerModalBridgeClipboard {
  duplicateConfirm: {
    duplicates: string[];
    paths: string[];
    action: 'copy' | 'cut';
  } | null;
  setDuplicateConfirm: React.Dispatch<React.SetStateAction<{
    duplicates: string[];
    paths: string[];
    action: 'copy' | 'cut';
  } | null>>;
  executePaste: (paths: string[], action: 'copy' | 'cut', overwrite: boolean) => Promise<void>;
}

interface ExplorerModalBridgeProps {
  fileOps: ExplorerModalBridgeFileOps;
  modals: ModalState;
  preview: PreviewState;
  entries: FileEntry[];
  currentPath: string | null;
  themeVars: ThemeVars | null;
  recentPath: string;
  contextMenu: { x: number; y: number; paths: string[] } | null;
  contextMenuSections: ContextMenuSection[];
  clipboardHook: ExplorerModalBridgeClipboard;
  dropConfirm: PendingDrop | null;
  onCloseContextMenu: () => void;
  onFolderSizeChildOpen: (child: FolderSizeChild) => void;
  onReloadCurrentPath: () => void;
  onPreviewCropSave: (outputPath: string) => void;
  onNavigate: (path: string) => void;
  onGlobalSearchSelect: (entry: FileEntry) => void;
  onDuplicateFileDelete: (path: string) => Promise<void>;
  onFolderMergeComplete: () => void;
  onTagConfirm: (tag: string) => void;
  onTagCancel: () => void;
  onClearDropConfirm: () => void;
  onExecuteDrop: (info: PendingDrop, overwrite: boolean) => Promise<void>;
  onReloadPath: (path: string) => void;
}

export default function ExplorerModalBridge({
  fileOps,
  modals,
  preview,
  entries,
  currentPath,
  themeVars,
  recentPath,
  contextMenu,
  contextMenuSections,
  clipboardHook,
  dropConfirm,
  onCloseContextMenu,
  onFolderSizeChildOpen,
  onReloadCurrentPath,
  onPreviewCropSave,
  onNavigate,
  onGlobalSearchSelect,
  onDuplicateFileDelete,
  onFolderMergeComplete,
  onTagConfirm,
  onTagCancel,
  onClearDropConfirm,
  onExecuteDrop,
  onReloadPath,
}: ExplorerModalBridgeProps) {
  return (
    <>
      {fileOps.copyToast && (
        <CopyToast message={fileOps.copyToast} themeVars={themeVars} />
      )}

      {fileOps.folderSizeDialog && (
        <FolderSizeInfoDialog
          dialog={fileOps.folderSizeDialog}
          themeVars={themeVars}
          onChildOpen={onFolderSizeChildOpen}
          onClose={fileOps.closeFolderSizeDialog}
        />
      )}

      {fileOps.permanentDeleteConfirm && (
        <ConfirmDialog
          message="파일을 삭제하면 되돌릴 수 없습니다. 정말 삭제하시겠습니까?"
          confirmLabel="확인"
          confirmColor="#ef4444"
          themeVars={themeVars}
          onCancel={() => fileOps.setPermanentDeleteConfirm(null)}
          onConfirm={fileOps.executePermanentDelete}
        />
      )}

      {fileOps.elevatedDeleteConfirm && (
        <ConfirmDialog
          message="파일 삭제에 실패했습니다. 관리자 권한으로 삭제하시겠습니까?"
          confirmLabel="관리자 권한으로 삭제"
          confirmColor="#ef4444"
          themeVars={themeVars}
          onCancel={() => fileOps.setElevatedDeleteConfirm(null)}
          onConfirm={fileOps.executeElevatedDelete}
        />
      )}

      {fileOps.ungroupConfirm && (
        <ConfirmDialog
          message="폴더를 제거하고 파일을 꺼내시겠습니까?"
          confirmLabel="확인"
          confirmColor={themeVars?.accent ?? '#3b82f6'}
          themeVars={themeVars}
          onCancel={() => fileOps.setUngroupConfirm(null)}
          onConfirm={fileOps.executeUngroupFolder}
        />
      )}

      {fileOps.operationProgress && (
        <OperationProgressToast progress={fileOps.operationProgress} themeVars={themeVars} />
      )}

      <FileExplorerModalLayer
        modals={modals}
        preview={preview}
        entries={entries}
        currentPath={currentPath}
        themeVars={themeVars}
        sheetPackDefaultName={fileOps.sheetPackDefaultName}
        recentPath={recentPath}
        onReloadCurrentPath={onReloadCurrentPath}
        onPreviewCropSave={onPreviewCropSave}
        onGifToMp4={fileOps.handleGifToMp4}
        onPixelateApply={fileOps.handlePixelateApply}
        onMapMakerExport={fileOps.handleLaigterMapsExport}
        onRemoveWhiteBgApply={fileOps.handleRemoveWhiteBgApply}
        onBulkRenameApply={fileOps.handleBulkRenameApply}
        onNavigate={onNavigate}
        onGlobalSearchSelect={onGlobalSearchSelect}
        onDuplicateFileDelete={onDuplicateFileDelete}
        onMergeFontsComplete={fileOps.handleMergeFontsComplete}
        onFolderMergeComplete={onFolderMergeComplete}
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sections={contextMenuSections}
          onClose={onCloseContextMenu}
        />
      )}

      {modals.tagPrompt && (
        <TagInputDialog
          defaultName={modals.tagPrompt.defaultName}
          themeVars={themeVars}
          onConfirm={onTagConfirm}
          onCancel={onTagCancel}
        />
      )}

      {clipboardHook.duplicateConfirm && (
        <OverwriteConfirmDialog
          duplicates={clipboardHook.duplicateConfirm.duplicates}
          message={`같은 이름의 파일이 ${clipboardHook.duplicateConfirm.duplicates.length}개 존재합니다.`}
          description="덮어씌우시겠습니까?"
          cancelLabel="취소"
          confirmLabel="덮어쓰기"
          themeVars={themeVars}
          onCancel={() => clipboardHook.setDuplicateConfirm(null)}
          onConfirm={async () => {
            const { paths, action } = clipboardHook.duplicateConfirm!;
            clipboardHook.setDuplicateConfirm(null);
            await clipboardHook.executePaste(paths, action, true);
          }}
        />
      )}

      {dropConfirm && currentPath && (
        <OverwriteConfirmDialog
          duplicates={dropConfirm.duplicates}
          message={`같은 이름의 파일이 ${dropConfirm.duplicates.length}개 존재합니다.`}
          description="덮어씌우시겠습니까? (아니오 = 중복 파일만 스킵)"
          cancelLabel="아니오"
          confirmLabel="네"
          themeVars={themeVars}
          onCancel={async () => {
            const info = dropConfirm;
            onClearDropConfirm();
            await onExecuteDrop(info, false);
            onReloadPath(currentPath);
          }}
          onConfirm={async () => {
            const info = dropConfirm;
            onClearDropConfirm();
            await onExecuteDrop(info, true);
            onReloadPath(currentPath);
          }}
        />
      )}
    </>
  );
}

function CopyToast({ message, themeVars }: {
  message: string;
  themeVars: ThemeVars | null;
}) {
  return (
    <div
      className="absolute top-2 left-1/2 -translate-x-1/2 z-[9999] px-3 py-1.5 rounded-md text-xs shadow-lg animate-fade-in"
      style={{
        backgroundColor: themeVars?.surface ?? '#1e293b',
        color: themeVars?.text ?? '#f8fafc',
        border: `1px solid ${themeVars?.border ?? '#334155'}`,
      }}
    >
      {message}
    </div>
  );
}

function ConfirmDialog({ message, confirmLabel, confirmColor, themeVars, onCancel, onConfirm }: {
  message: string;
  confirmLabel: string;
  confirmColor: string;
  themeVars: ThemeVars | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onCancel}
      tabIndex={-1}
      ref={el => el?.focus()}
      onKeyDown={e => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        if (e.key === 'Enter') void onConfirm();
        if (e.key === 'Escape') onCancel();
      }}
    >
      <div
        className="rounded-lg shadow-2xl p-5 max-w-sm w-full mx-4"
        style={{
          backgroundColor: themeVars?.surface2 ?? '#1e293b',
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        <p className="text-sm mb-4" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            className="px-3 py-1.5 text-xs rounded-md transition-colors"
            style={{
              backgroundColor: themeVars?.surface ?? '#334155',
              color: themeVars?.text ?? '#e5e7eb',
              border: `1px solid ${themeVars?.border ?? '#475569'}`,
            }}
            onClick={onCancel}
          >
            취소
          </button>
          <button
            className="px-3 py-1.5 text-xs rounded-md text-white transition-colors"
            style={{ backgroundColor: confirmColor }}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function OperationProgressToast({ progress, themeVars }: {
  progress: { type: string; current: number; total: number; itemLabel?: string };
  themeVars: ThemeVars | null;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2" style={{ pointerEvents: 'none' }}>
      <div className="rounded-lg px-4 py-3 flex flex-col gap-2 min-w-[220px] max-w-sm shadow-xl" style={{ backgroundColor: themeVars?.surface2 ?? '#1e293b', border: `1px solid ${themeVars?.border ?? '#334155'}`, pointerEvents: 'auto' }}>
        <div className="flex items-center gap-3">
          <div className="animate-spin w-4 h-4 border-2 border-t-transparent rounded-full flex-shrink-0" style={{ borderColor: `${themeVars?.accent ?? '#4ade80'} transparent ${themeVars?.accent ?? '#4ade80'} ${themeVars?.accent ?? '#4ade80'}` }} />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium block" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
              {progress.type} 중… ({progress.total}개 항목)
            </span>
            {progress.itemLabel && (
              <span className="text-[11px] truncate block mt-0.5" style={{ color: themeVars?.muted ?? '#94a3b8' }} title={progress.itemLabel}>
                {progress.itemLabel}
              </span>
            )}
          </div>
        </div>
        <div className="h-0.5 w-full rounded overflow-hidden" style={{ backgroundColor: `${themeVars?.accent ?? '#4ade80'}25` }}>
          <div className="h-full w-1/3 rounded animate-[qf-pulse-bar_1.2s_ease-in-out_infinite]" style={{ backgroundColor: themeVars?.accent ?? '#4ade80' }} />
        </div>
        <style>{`@keyframes qf-pulse-bar { 0%,100% { transform: translateX(-20%); opacity: 0.6; } 50% { transform: translateX(180%); opacity: 1; } }`}</style>
      </div>
    </div>
  );
}

function OverwriteConfirmDialog({ duplicates, message, description, cancelLabel, confirmLabel, themeVars, onCancel, onConfirm }: {
  duplicates: string[];
  message: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  themeVars: ThemeVars | null;
  onCancel: () => void | Promise<void>;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="rounded-lg shadow-2xl max-w-sm w-full mx-4 overflow-hidden"
        style={{
          backgroundColor: themeVars?.surface2 ?? '#1f2937',
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
        }}
      >
        <div className="px-5 pt-5 pb-3">
          <p className="text-sm font-medium mb-2" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
            {message}
          </p>
          <p className="text-xs mb-3" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
            {description}
          </p>
          <div
            className="text-xs rounded-md px-3 py-2 max-h-[120px] overflow-y-auto"
            style={{ backgroundColor: themeVars?.surface ?? '#111827' }}
          >
            {duplicates.map((name, i) => (
              <div key={i} className="py-0.5 truncate" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                {name}
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: themeVars?.border ?? '#334155' }}>
          <button
            className="px-4 py-1.5 text-xs rounded-md transition-colors hover:opacity-80"
            style={{
              backgroundColor: themeVars?.surface ?? '#111827',
              color: themeVars?.text ?? '#e5e7eb',
              border: `1px solid ${themeVars?.border ?? '#334155'}`,
            }}
            onClick={() => void onCancel()}
          >
            {cancelLabel}
          </button>
          <button
            className="px-4 py-1.5 text-xs rounded-md transition-colors hover:opacity-80"
            style={{
              backgroundColor: themeVars?.accent ?? '#3b82f6',
              color: '#fff',
            }}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function FolderSizeInfoDialog({ dialog, themeVars, onChildOpen, onClose }: {
  dialog: FolderSizeDialogState;
  themeVars: ThemeVars | null;
  onChildOpen: (child: FolderSizeChild) => void;
  onClose: () => void;
}) {
  useEscapeKey(onClose);

  const mutedColor = themeVars?.muted ?? '#94a3b8';
  const textColor = themeVars?.text ?? '#e5e7eb';
  const borderColor = themeVars?.border ?? '#334155';

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="폴더 용량 정보"
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] rounded-lg shadow-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: themeVars?.surface2 ?? '#1e293b',
          border: `1px solid ${borderColor}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${borderColor}` }}>
          <div className="flex items-center gap-2 min-w-0">
            <HardDrive size={16} className="shrink-0" style={{ color: themeVars?.accent ?? '#3b82f6' }} />
            <span className="text-sm font-medium truncate" style={{ color: textColor }} title={dialog.folderName}>
              폴더 용량 정보
            </span>
          </div>
          <button
            type="button"
            className="p-1 rounded-md hover:opacity-75"
            style={{ color: mutedColor }}
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-4 overflow-hidden">
          <div className="mb-4 min-w-0">
            <div className="text-xs mb-1" style={{ color: mutedColor }}>폴더</div>
            <div className="text-sm font-medium truncate" style={{ color: textColor }} title={dialog.path}>
              {dialog.folderName}
            </div>
            <div className="mt-1 text-[11px] truncate" style={{ color: mutedColor }} title={dialog.path}>
              {dialog.path}
            </div>
          </div>

          {dialog.status === 'loading' && (
            <div className="flex items-center gap-2 rounded-md px-3 py-3" style={{ backgroundColor: themeVars?.surface ?? '#111827', color: textColor }}>
              <Loader2 size={16} className="animate-spin shrink-0" />
              <span className="text-sm">폴더 용량 계산 중...</span>
            </div>
          )}

          {dialog.status === 'error' && (
            <div className="rounded-md px-3 py-3 text-sm" style={{ backgroundColor: '#7f1d1d33', color: '#fecaca', border: '1px solid #ef444455' }}>
              폴더 용량 확인 실패: {dialog.error}
            </div>
          )}

          {dialog.status === 'ready' && (
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <InfoPopupRow label="전체 용량" value={dialog.sizeText ?? '-'} themeVars={themeVars} />
                <InfoPopupRow label="정확한 바이트" value={`${dialog.bytes ?? '0'} bytes`} themeVars={themeVars} />
                <InfoPopupRow label="파일" value={`${(dialog.fileCount ?? 0).toLocaleString()}개`} themeVars={themeVars} />
                <InfoPopupRow label="폴더" value={`${(dialog.folderCount ?? 0).toLocaleString()}개`} themeVars={themeVars} />
              </div>

              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium" style={{ color: textColor }}>용량 상위 항목</span>
                  <span className="text-[11px]" style={{ color: mutedColor }}>
                    {(dialog.children?.length ?? 0).toLocaleString()}개
                  </span>
                </div>
                {dialog.children && dialog.children.length > 0 ? (
                  <div className="max-h-[52vh] overflow-y-auto pr-1 space-y-2">
                    {dialog.children.map(child => (
                      <FolderSizeChildRow
                        key={child.path}
                        child={child}
                        themeVars={themeVars}
                        onOpen={onChildOpen}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md px-3 py-3 text-sm" style={{ backgroundColor: themeVars?.surface ?? '#111827', color: mutedColor }}>
                    표시할 하위 항목이 없습니다.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end px-4 py-3" style={{ borderTop: `1px solid ${borderColor}` }}>
          <button
            type="button"
            className="px-4 py-1.5 text-xs rounded-md transition-colors hover:opacity-80"
            style={{
              backgroundColor: themeVars?.accent ?? '#3b82f6',
              color: '#fff',
              border: 'none',
            }}
            onClick={onClose}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

function FolderSizeChildRow({ child, themeVars, onOpen }: {
  child: FolderSizeChild;
  themeVars: ThemeVars | null;
  onOpen: (child: FolderSizeChild) => void;
}) {
  const mutedColor = themeVars?.muted ?? '#94a3b8';
  const textColor = themeVars?.text ?? '#e5e7eb';
  const accentColor = themeVars?.accent ?? '#3b82f6';
  const percentText = `${child.percent >= 10 ? child.percent.toFixed(0) : child.percent.toFixed(1)}%`;
  const barWidth = child.bytes > 0 ? Math.max(2, child.percent) : 0;
  const detail = child.isDir
    ? `파일 ${child.fileCount.toLocaleString()}개 · 폴더 ${child.folderCount.toLocaleString()}개`
    : '파일';

  return (
    <button
      type="button"
      className="w-full cursor-pointer rounded-md px-3 py-2 text-left transition-opacity hover:opacity-85 focus:outline-none focus:ring-2"
      style={{ backgroundColor: themeVars?.surface ?? '#111827' }}
      title={child.path}
      onClick={() => onOpen(child)}
    >
      <div className="mb-2 flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {child.isDir ? (
            <Folder size={14} className="shrink-0" style={{ color: accentColor }} />
          ) : (
            <FileText size={14} className="shrink-0" style={{ color: mutedColor }} />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium" style={{ color: textColor }}>{child.name}</div>
            <div className="truncate text-[11px]" style={{ color: mutedColor }}>{detail}</div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-medium" style={{ color: textColor }}>{child.bytesText}</div>
          <div className="text-[11px]" style={{ color: mutedColor }}>{percentText}</div>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: `${accentColor}22` }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${barWidth}%`,
            backgroundColor: child.isDir ? accentColor : mutedColor,
          }}
        />
      </div>
    </button>
  );
}

function InfoPopupRow({ label, value, themeVars }: {
  label: string;
  value: string;
  themeVars: ThemeVars | null;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md px-3 py-2"
      style={{ backgroundColor: themeVars?.surface ?? '#111827' }}
    >
      <span className="text-xs shrink-0" style={{ color: themeVars?.muted ?? '#94a3b8' }}>{label}</span>
      <span className="text-sm font-medium text-right truncate" style={{ color: themeVars?.text ?? '#e5e7eb' }} title={value}>
        {value}
      </span>
    </div>
  );
}

function TagInputDialog({ defaultName, themeVars, onConfirm, onCancel }: {
  defaultName: string;
  themeVars: ThemeVars | null;
  onConfirm: (tag: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);
  useEscapeKey(onCancel);
  useEffect(() => { inputRef.current?.select(); }, []);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="rounded-lg shadow-2xl w-72 overflow-hidden"
        style={{
          backgroundColor: themeVars?.surface2 ?? '#1f2937',
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
        }}
      >
        <div className="px-4 pt-4 pb-2">
          <p className="text-xs font-medium mb-2" style={{ color: themeVars?.text ?? '#e5e7eb' }}>프로젝트 태그 입력</p>
          <input
            ref={inputRef}
            className="w-full px-2 py-1.5 text-xs rounded-md outline-none"
            style={{
              backgroundColor: themeVars?.surface ?? '#111827',
              color: themeVars?.text ?? '#e5e7eb',
              border: `1px solid ${themeVars?.border ?? '#334155'}`,
            }}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (value.trim()) onConfirm(value.trim());
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onCancel();
              }
            }}
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 px-4 py-3">
          <button
            className="px-3 py-1 text-xs rounded-md transition-colors hover:opacity-80"
            style={{ backgroundColor: themeVars?.surface ?? '#111827', color: themeVars?.text ?? '#e5e7eb', border: `1px solid ${themeVars?.border ?? '#334155'}` }}
            onClick={onCancel}
          >취소</button>
          <button
            className="px-3 py-1 text-xs rounded-md transition-colors hover:opacity-80"
            style={{ backgroundColor: themeVars?.accent ?? '#3b82f6', color: '#fff', border: 'none' }}
            onClick={() => value.trim() && onConfirm(value.trim())}
          >확인</button>
        </div>
      </div>
    </div>
  );
}
