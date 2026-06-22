import type { Dispatch, SetStateAction } from 'react';
import { Folder } from 'lucide-react';
import type { ThemeVars, ToastMessage } from '../types';
import type { AppLanguage, TranslationKey } from '../utils/i18n';
import type { useAutoUpdate } from '../hooks/useAutoUpdate';
import type { useCategoryManagement } from '../hooks/useCategoryManagement';
import type { useThemeManagement } from '../hooks/useThemeManagement';
import {
  COLORS,
  FOLDER_TEXT_COLORS,
  normalizeHexColor,
} from '../hooks/useThemeManagement';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { ThemeSettingsModal } from './ThemeSettingsModal';
import { ZoomModal } from './ZoomModal';
import { LanguageSettingsModal } from './LanguageSettingsModal';
import { UpdateModal } from './UpdateModal';
import { UpdateFailedModal } from './UpdateFailedModal';
import { HelpModal } from './HelpModal';
import TaskQueuePanel from './TaskQueuePanel';
import { ToastContainer } from './ToastContainer';

type CategoryManagement = ReturnType<typeof useCategoryManagement>;
type ThemeManagement = ReturnType<typeof useThemeManagement>;
type AutoUpdateState = ReturnType<typeof useAutoUpdate>;

interface AppModalsProps {
  isBgModalOpen: boolean;
  setIsBgModalOpen: Dispatch<SetStateAction<boolean>>;
  isZoomModalOpen: boolean;
  setIsZoomModalOpen: Dispatch<SetStateAction<boolean>>;
  isLanguageModalOpen: boolean;
  setIsLanguageModalOpen: Dispatch<SetStateAction<boolean>>;
  isHelpModalOpen: boolean;
  setIsHelpModalOpen: Dispatch<SetStateAction<boolean>>;
  theme: ThemeManagement;
  themeVars: ThemeVars | null;
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
  t: (key: TranslationKey) => string;
  catMgmt: CategoryManagement;
  autoUpdate: AutoUpdateState;
  addToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

export function AppModals({
  isBgModalOpen,
  setIsBgModalOpen,
  isZoomModalOpen,
  setIsZoomModalOpen,
  isLanguageModalOpen,
  setIsLanguageModalOpen,
  isHelpModalOpen,
  setIsHelpModalOpen,
  theme,
  themeVars,
  language,
  onLanguageChange,
  t,
  catMgmt,
  autoUpdate,
  addToast,
  toasts,
  removeToast,
}: AppModalsProps) {
  return (
    <>
      <ThemeSettingsModal isOpen={isBgModalOpen} onClose={() => setIsBgModalOpen(false)} theme={theme} />
      <ZoomModal isOpen={isZoomModalOpen} onClose={() => setIsZoomModalOpen(false)} zoomPercent={theme.zoomPercent} setZoomPercent={theme.setZoomPercent} />
      <LanguageSettingsModal
        isOpen={isLanguageModalOpen}
        language={language}
        onLanguageChange={onLanguageChange}
        onClose={() => setIsLanguageModalOpen(false)}
        t={t}
      />

      <Modal
        isOpen={catMgmt.isCatModalOpen}
        onClose={() => catMgmt.setIsCatModalOpen(false)}
        title={catMgmt.editingCategory ? t('app.category.modal.editTitle') : t('app.category.modal.addTitle')}
      >
        <form onSubmit={catMgmt.handleSaveCategory} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--qf-muted)] mb-1">{t('app.category.modal.nameLabel')}</label>
            <input type="text" required value={catMgmt.catFormTitle} onChange={(e) => catMgmt.setCatFormTitle(e.target.value)} className="w-full bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none" placeholder={t('app.category.modal.namePlaceholder')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--qf-muted)] mb-2">{t('app.category.modal.colorLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button key={color.value} type="button" onClick={() => catMgmt.setCatFormColor(color.value)} className={`w-8 h-8 rounded-full transition-transform ${catMgmt.catFormColor === color.value ? 'ring-2 ring-offset-2 ring-offset-[var(--qf-surface)] ring-white scale-110' : 'hover:scale-110 opacity-70 hover:opacity-100'}`} style={{ backgroundColor: color.value }} title={color.name} />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input type="color" value={normalizeHexColor(catMgmt.catFormColor) ?? '#60a5fa'} onChange={(e) => catMgmt.setCatFormColor(e.target.value)} className="h-10 w-12 rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface-2)] p-1" aria-label={t('app.category.modal.customColorAria')} />
              <input type="text" value={catMgmt.catFormColor} onChange={(e) => catMgmt.setCatFormColor(e.target.value)} placeholder="#60a5fa" className="flex-1 bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs" />
              <Button type="button" variant="secondary" onClick={() => { const v = normalizeHexColor(catMgmt.catFormColor); if (v) catMgmt.setCatFormColor(v); else addToast(t('app.category.modal.invalidColor'), 'error'); }}>{t('common.apply')}</Button>
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => catMgmt.setIsCatModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit">{catMgmt.editingCategory ? t('common.saveChanges') : t('common.add')}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={catMgmt.isFolderModalOpen}
        onClose={() => catMgmt.setIsFolderModalOpen(false)}
        title={catMgmt.editingShortcut ? t('app.folder.modal.editTitle') : t('app.folder.modal.addTitle')}
      >
        <form onSubmit={catMgmt.handleSaveFolder} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--qf-muted)] mb-1">{t('app.folder.modal.nameLabel')}</label>
            <input type="text" required value={catMgmt.folderFormName} onChange={(e) => catMgmt.setFolderFormName(e.target.value)} className="w-full bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none" placeholder={t('app.folder.modal.namePlaceholder')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--qf-muted)] mb-1">{t('app.folder.modal.pathLabel')}</label>
            <div className="relative">
              <input type="text" required value={catMgmt.folderFormPath} onChange={(e) => catMgmt.setFolderFormPath(e.target.value)} className="w-full bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg pl-3 pr-10 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs" placeholder={t('app.folder.modal.pathPlaceholder')} />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-[var(--qf-muted)]"><Folder size={14} /></div>
            </div>
            <p className="text-xs text-[var(--qf-muted)] mt-1">{t('app.folder.modal.pathHelp')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--qf-muted)] mb-2">{t('app.folder.modal.colorLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {FOLDER_TEXT_COLORS.map((color) => (
                <button key={color.value || color.name} type="button" onClick={() => catMgmt.setFolderFormColor(color.value)} className={`w-8 h-8 rounded-full transition-transform ${catMgmt.folderFormColor === color.value ? 'ring-2 ring-offset-2 ring-offset-[var(--qf-surface)] ring-white scale-110' : 'hover:scale-110 opacity-70 hover:opacity-100'}`} style={{ backgroundColor: color.value || (themeVars?.text ?? '#e5e7eb'), border: color.value ? undefined : '1px solid rgba(255,255,255,0.18)' }} title={color.name} />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input type="color" value={normalizeHexColor(catMgmt.folderFormColor) ?? '#ffffff'} onChange={(e) => catMgmt.setFolderFormColor(e.target.value)} className="h-10 w-12 rounded-md border border-[var(--qf-border)] bg-[var(--qf-surface-2)] p-1" aria-label={t('app.folder.modal.customColorAria')} />
              <input type="text" value={catMgmt.folderFormColor} onChange={(e) => catMgmt.setFolderFormColor(e.target.value)} placeholder="#ffffff" className="flex-1 bg-[var(--qf-surface-2)] border border-[var(--qf-border)] rounded-lg px-3 py-2 text-[var(--qf-text)] focus:ring-2 focus:ring-[var(--qf-accent)] focus:border-transparent outline-none font-mono text-xs" />
              <Button type="button" variant="secondary" onClick={() => { if (!catMgmt.folderFormColor) return; const v = normalizeHexColor(catMgmt.folderFormColor); if (v) catMgmt.setFolderFormColor(v); else addToast(t('app.category.modal.invalidColor'), 'error'); }}>{t('common.apply')}</Button>
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => catMgmt.setIsFolderModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit">{catMgmt.editingShortcut ? t('common.saveChanges') : t('common.add')}</Button>
          </div>
        </form>
      </Modal>

      {autoUpdate.updateInfo && (
        <UpdateModal
          isOpen={autoUpdate.isUpdateModalOpen}
          onClose={() => autoUpdate.setIsUpdateModalOpen(false)}
          onUpdate={autoUpdate.handleUpdate}
          version={autoUpdate.updateInfo.version}
          currentVersion={autoUpdate.currentAppVersion}
          releaseNotes={autoUpdate.updateInfo.body}
          isDownloading={autoUpdate.isDownloading}
          downloadProgress={autoUpdate.downloadProgress}
          isWindows={autoUpdate.isWindows}
          onOpenSacSettings={autoUpdate.openSacSettings}
        />
      )}

      {autoUpdate.previousUpdateFailed && (
        <UpdateFailedModal
          isOpen={true}
          onClose={autoUpdate.dismissPreviousUpdateFailed}
          fromVersion={autoUpdate.previousUpdateFailed.fromVersion}
          toVersion={autoUpdate.previousUpdateFailed.toVersion}
          isWindows={autoUpdate.isWindows}
          onOpenSacSettings={autoUpdate.openSacSettings}
        />
      )}

      <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
      <TaskQueuePanel themeVars={themeVars} />
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
}
