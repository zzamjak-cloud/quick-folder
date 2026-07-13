import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Play, Plus, Save, Terminal, Trash2 } from 'lucide-react';
import { ThemeVars } from './types';
import ModalShell from './ui/ModalShell';
import {
  getModalButtonStyle,
  getModalIconButtonStyle,
  getModalInputBaseStyle,
  getModalPanelStyle,
  getModalSectionBorderStyle,
} from './ui/modalStyles';
import { getFileName } from '../../utils/pathUtils';
import { tauriCommands } from '../../utils/tauriCommands';
import {
  createTerminalPresetId,
  isHighRiskTerminalCommand,
  loadTerminalPresetStore,
  normalizeTerminalPresetInput,
  saveTerminalPresetStore,
  type TerminalPreset,
  type TerminalPresetStore,
} from './terminalPresets';
import type { TranslationKey } from '../../utils/i18n';

interface TerminalPresetModalProps {
  path: string;
  initialEditId?: string | null;
  themeVars: ThemeVars | null;
  onClose: () => void;
  t: (key: TranslationKey) => string;
}

function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? ''));
}

export default function TerminalPresetModal({ path, initialEditId, themeVars, onClose, t }: TerminalPresetModalProps) {
  const [store, setStore] = useState<TerminalPresetStore>(() => loadTerminalPresetStore());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [error, setError] = useState('');
  const appliedInitialEditIdRef = useRef<string | null>(null);

  const presets = useMemo(() => store[path] ?? [], [store, path]);
  const selectedTitle = getFileName(path) || path;
  const editingPreset = editingId ? presets.find(preset => preset.id === editingId) : null;

  const btnStyle = getModalButtonStyle(themeVars);
  const iconBtnStyle = getModalIconButtonStyle(themeVars);
  const inputStyle = getModalInputBaseStyle(themeVars);
  const sectionBorderStyle = getModalSectionBorderStyle(themeVars);
  const presetCardStyle = getModalPanelStyle(themeVars);
  const emptyPresetStyle = getModalPanelStyle(themeVars, {
    color: themeVars?.muted ?? '#94a3b8',
    borderStyle: 'dashed',
  });

  const persistPresets = (nextPresets: TerminalPreset[]) => {
    const nextStore = { ...store, [path]: nextPresets };
    if (nextPresets.length === 0) delete nextStore[path];
    saveTerminalPresetStore(nextStore);
    setStore(nextStore);
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCommand('');
    setError('');
  };

  const handleEdit = (preset: TerminalPreset) => {
    setEditingId(preset.id);
    setName(preset.name);
    setCommand(preset.command);
    setError('');
  };

  useEffect(() => {
    if (!initialEditId) return;
    if (appliedInitialEditIdRef.current === initialEditId) return;
    const preset = presets.find(item => item.id === initialEditId);
    if (preset) {
      handleEdit(preset);
      appliedInitialEditIdRef.current = initialEditId;
    }
  }, [initialEditId, presets]);

  const handleSave = () => {
    const presetName = normalizeTerminalPresetInput(name);
    const presetCommand = normalizeTerminalPresetInput(command);
    if (!presetName) {
      setError(t('terminalPreset.error.nameRequired'));
      return;
    }
    if (!presetCommand) {
      setError(t('terminalPreset.error.commandRequired'));
      return;
    }

    const now = Date.now();
    if (editingPreset) {
      persistPresets(presets.map(preset => (
        preset.id === editingPreset.id
          ? { ...preset, name: presetName, command: presetCommand, updatedAt: now }
          : preset
      )));
    } else {
      persistPresets([
        ...presets,
        {
          id: createTerminalPresetId(),
          name: presetName,
          command: presetCommand,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }
    resetForm();
  };

  const handleDelete = (presetId: string) => {
    persistPresets(presets.filter(preset => preset.id !== presetId));
    if (editingId === presetId) resetForm();
  };

  const handleOpenTerminal = async () => {
    setError('');
    try {
      await tauriCommands.openTerminal(path);
    } catch (e) {
      setError(formatMessage(t('terminalPreset.error.terminalOpenFailed'), { message: String(e) }));
    }
  };

  const handleRun = async (preset: TerminalPreset) => {
    setError('');
    try {
      await tauriCommands.runTerminalCommand(path, preset.command);
    } catch (e) {
      setError(formatMessage(t('terminalPreset.error.presetRunFailed'), { message: String(e) }));
    }
  };

  return (
    <ModalShell
      title={formatMessage(t('terminalPreset.title'), { folder: selectedTitle })}
      width={620}
      maxHeight="85vh"
      saveLabel={editingPreset ? t('terminalPreset.saveEdit') : t('terminalPreset.savePreset')}
      overlayClose
      footerBtnStyle={btnStyle}
      onClose={onClose}
      onSave={handleSave}
      themeVars={themeVars}
    >
      <div className="flex flex-col gap-3 px-4 py-3" style={sectionBorderStyle}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            style={{ ...btnStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={handleOpenTerminal}
          >
            <Terminal size={13} />
            {t('terminalPreset.openTerminal')}
          </button>
          <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
            {path}
          </span>
        </div>

        <div className="grid grid-cols-[140px_1fr_auto] gap-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="rounded-md px-2 py-1.5 text-xs outline-none"
            style={inputStyle}
            placeholder={t('terminalPreset.namePlaceholder')}
          />
          <input
            value={command}
            onChange={e => setCommand(e.target.value)}
            className="rounded-md px-2 py-1.5 text-xs outline-none font-mono"
            style={inputStyle}
            placeholder={t('terminalPreset.commandPlaceholder')}
          />
          <button
            type="button"
            style={{ ...iconBtnStyle, width: 34 }}
            onClick={handleSave}
            title={editingPreset ? t('terminalPreset.saveEdit') : t('terminalPreset.savePreset')}
          >
            {editingPreset ? <Save size={14} /> : <Plus size={14} />}
          </button>
        </div>

        {error && (
          <div className="rounded-md px-3 py-2 text-xs" style={{ color: '#fca5a5', backgroundColor: 'rgba(248,113,113,0.1)' }}>
            {error}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ maxHeight: 340 }}>
        {presets.length === 0 ? (
          <div className="rounded-md px-3 py-8 text-center text-xs" style={emptyPresetStyle}>
            {t('terminalPreset.empty')}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {presets.map(preset => {
              const risky = isHighRiskTerminalCommand(preset.command);
              return (
                <div
                  key={preset.id}
                  className="rounded-md px-3 py-2"
                  style={presetCardStyle}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      style={{ ...iconBtnStyle, color: risky ? '#fbbf24' : themeVars?.accent ?? '#3b82f6' }}
                      onClick={() => handleRun(preset)}
                      title={t('terminalPreset.runInTerminal')}
                    >
                      <Play size={13} />
                    </button>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => handleEdit(preset)}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
                          {preset.name}
                        </span>
                        {risky && <AlertTriangle size={12} color="#fbbf24" />}
                      </div>
                      <div className="mt-1 truncate font-mono text-[11px]" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
                        {preset.command}
                      </div>
                    </button>
                    <button
                      type="button"
                      style={iconBtnStyle}
                      onClick={() => handleDelete(preset.id)}
                      title={t('terminalPreset.delete')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
