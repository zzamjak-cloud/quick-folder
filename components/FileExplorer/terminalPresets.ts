export interface TerminalPreset {
  id: string;
  name: string;
  command: string;
  createdAt: number;
  updatedAt: number;
}

export type TerminalPresetStore = Record<string, TerminalPreset[]>;

const STORAGE_KEY = 'qf_terminal_presets_v1';

export function createTerminalPresetId() {
  return `preset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadTerminalPresetStore(): TerminalPresetStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function saveTerminalPresetStore(store: TerminalPresetStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getTerminalPresets(path: string) {
  return loadTerminalPresetStore()[path] ?? [];
}

export function deleteTerminalPreset(path: string, presetId: string) {
  const store = loadTerminalPresetStore();
  const nextPresets = (store[path] ?? []).filter(preset => preset.id !== presetId);
  const nextStore = { ...store };
  if (nextPresets.length > 0) {
    nextStore[path] = nextPresets;
  } else {
    delete nextStore[path];
  }
  saveTerminalPresetStore(nextStore);
}

export function normalizeTerminalPresetInput(value: string) {
  return value.trim();
}

export function isHighRiskTerminalCommand(command: string) {
  const patterns = [
    /\brm\s+-rf\b/i,
    /\bRemove-Item\b[\s\S]*\b-Recurse\b/i,
    /\bdel\b[\s\S]*\s\/s\b/i,
    /\brmdir\b[\s\S]*\s\/s\b/i,
    /\bformat\b\s+[a-z]:/i,
    /\bgit\s+reset\s+--hard\b/i,
    /\bgit\s+clean\s+-f/i,
  ];
  return patterns.some(pattern => pattern.test(command));
}
