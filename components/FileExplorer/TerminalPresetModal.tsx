import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, Play, Plus, Save, Terminal, Trash2 } from 'lucide-react';
import { ThemeVars } from './types';
import ModalShell from './ui/ModalShell';
import { getFileName } from '../../utils/pathUtils';
import {
  createTerminalPresetId,
  isHighRiskTerminalCommand,
  loadTerminalPresetStore,
  normalizeTerminalPresetInput,
  saveTerminalPresetStore,
  type TerminalPreset,
  type TerminalPresetStore,
} from './terminalPresets';

interface TerminalPresetModalProps {
  path: string;
  initialEditId?: string | null;
  themeVars: ThemeVars | null;
  onClose: () => void;
}

export default function TerminalPresetModal({ path, initialEditId, themeVars, onClose }: TerminalPresetModalProps) {
  const [store, setStore] = useState<TerminalPresetStore>(() => loadTerminalPresetStore());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [error, setError] = useState('');
  const appliedInitialEditIdRef = useRef<string | null>(null);

  const presets = useMemo(() => store[path] ?? [], [store, path]);
  const selectedTitle = getFileName(path) || path;
  const editingPreset = editingId ? presets.find(preset => preset.id === editingId) : null;

  const btnStyle: React.CSSProperties = {
    padding: '5px 10px',
    fontSize: 12,
    borderRadius: 6,
    border: `1px solid ${themeVars?.border ?? '#334155'}`,
    backgroundColor: themeVars?.surface ?? '#111827',
    color: themeVars?.text ?? '#e5e7eb',
    cursor: 'pointer',
  };

  const iconBtnStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    border: `1px solid ${themeVars?.border ?? '#334155'}`,
    backgroundColor: themeVars?.surface ?? '#111827',
    color: themeVars?.text ?? '#e5e7eb',
    cursor: 'pointer',
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: themeVars?.surface ?? '#111827',
    color: themeVars?.text ?? '#e5e7eb',
    border: `1px solid ${themeVars?.border ?? '#334155'}`,
  };

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
      setError('프리셋 이름을 입력하세요');
      return;
    }
    if (!presetCommand) {
      setError('실행할 명령어를 입력하세요');
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
      await invoke('open_terminal', { path });
    } catch (e) {
      setError(`터미널 실행 실패: ${e}`);
    }
  };

  const handleRun = async (preset: TerminalPreset) => {
    setError('');
    try {
      await invoke('run_terminal_command', { path, command: preset.command });
    } catch (e) {
      setError(`프리셋 실행 실패: ${e}`);
    }
  };

  return (
    <ModalShell
      title={`터미널 프리셋 - ${selectedTitle}`}
      width={620}
      maxHeight="85vh"
      saveLabel={editingPreset ? '수정 저장' : '프리셋 저장'}
      overlayClose
      footerBtnStyle={btnStyle}
      onClose={onClose}
      onSave={handleSave}
      themeVars={themeVars}
    >
      <div className="flex flex-col gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            style={{ ...btnStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={handleOpenTerminal}
          >
            <Terminal size={13} />
            터미널 열기
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
            placeholder="프리셋 이름"
          />
          <input
            value={command}
            onChange={e => setCommand(e.target.value)}
            className="rounded-md px-2 py-1.5 text-xs outline-none font-mono"
            style={inputStyle}
            placeholder="npm run build"
          />
          <button
            type="button"
            style={{ ...iconBtnStyle, width: 34 }}
            onClick={handleSave}
            title={editingPreset ? '수정 저장' : '프리셋 저장'}
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
          <div className="rounded-md px-3 py-8 text-center text-xs" style={{ color: themeVars?.muted ?? '#94a3b8', border: `1px dashed ${themeVars?.border ?? '#334155'}` }}>
            이 폴더에 저장된 터미널 프리셋이 없습니다.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {presets.map(preset => {
              const risky = isHighRiskTerminalCommand(preset.command);
              return (
                <div
                  key={preset.id}
                  className="rounded-md px-3 py-2"
                  style={{ backgroundColor: themeVars?.surface ?? '#111827', border: `1px solid ${themeVars?.border ?? '#334155'}` }}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      style={{ ...iconBtnStyle, color: risky ? '#fbbf24' : themeVars?.accent ?? '#3b82f6' }}
                      onClick={() => handleRun(preset)}
                      title="터미널에서 실행"
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
                      title="삭제"
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
