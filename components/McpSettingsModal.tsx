import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, FolderPlus, RefreshCw, Trash2, X } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { mcpCommands } from '../utils/tauriCommands';
import type { McpClientStatus, McpSetupStatus } from '../utils/tauriCommandDomains/mcpCommands';
import { runDirectCommand } from '../utils/tauriCommandRunner';
import type { TranslationKey } from '../utils/i18n';
import { MCP_CHANGED_EVENT } from './FileExplorer/hooks/useAgentAvailability';

const ROOTS_STORAGE_KEY = 'qf_mcp_roots';

interface McpSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: (key: TranslationKey) => string;
}

type Notice = { kind: 'ok' | 'error'; text: string } | null;

function loadStoredRoots(): string[] {
  try {
    const raw = localStorage.getItem(ROOTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function McpSettingsModal({ isOpen, onClose, t }: McpSettingsModalProps) {
  const [status, setStatus] = useState<McpSetupStatus | null>(null);
  const [roots, setRoots] = useState<string[]>(loadStoredRoots);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await mcpCommands.mcpSetupStatus());
      // 우클릭 메뉴의 "AI Agent 요청하기" 노출 여부가 등록 상태를 따라간다
      window.dispatchEvent(new Event(MCP_CHANGED_EVENT));
    } catch (e) {
      setNotice({ kind: 'error', text: String(e) });
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setNotice(null);
      void refresh();
    }
  }, [isOpen, refresh]);

  const persistRoots = useCallback((next: string[]) => {
    setRoots(next);
    try {
      localStorage.setItem(ROOTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 저장 실패는 기능에 영향 없음 — 다음 실행 때 다시 고르면 된다
    }
  }, []);

  const addRoot = useCallback(async () => {
    try {
      const picked = await runDirectCommand<{ path: string; name: string } | null>('select_folder');
      if (!picked) return;
      if (roots.includes(picked.path)) return;
      persistRoots([...roots, picked.path]);
    } catch (e) {
      setNotice({ kind: 'error', text: String(e) });
    }
  }, [roots, persistRoots]);

  const removeRoot = useCallback(
    (path: string) => persistRoots(roots.filter(r => r !== path)),
    [roots, persistRoots],
  );

  const register = useCallback(
    async (client: McpClientStatus) => {
      setBusy(client.id);
      setNotice(null);
      try {
        const outcome = await mcpCommands.mcpRegister(client.id, roots);
        await refresh();
        setNotice({
          kind: 'ok',
          text: `${client.label} — ${outcome.configPath}${
            outcome.backupPath ? ` (${t('mcp.backupSaved')})` : ''
          }`,
        });
      } catch (e) {
        // 파일 쓰기가 막힌 환경을 위해 수동 등록용 조각을 클립보드로 넘긴다
        try {
          const snippet = await mcpCommands.mcpConfigSnippet(client.id, roots);
          await navigator.clipboard.writeText(snippet);
          setNotice({ kind: 'error', text: `${String(e)} — ${t('mcp.snippetCopied')}` });
        } catch {
          setNotice({ kind: 'error', text: String(e) });
        }
      } finally {
        setBusy(null);
      }
    },
    [roots, refresh, t],
  );

  const unregister = useCallback(
    async (client: McpClientStatus) => {
      setBusy(client.id);
      setNotice(null);
      try {
        await mcpCommands.mcpUnregister(client.id);
        await refresh();
        setNotice({ kind: 'ok', text: `${client.label} — ${t('mcp.unregistered')}` });
      } catch (e) {
        setNotice({ kind: 'error', text: String(e) });
      } finally {
        setBusy(null);
      }
    },
    [refresh, t],
  );

  const copySnippet = useCallback(
    async (client: McpClientStatus) => {
      try {
        const snippet = await mcpCommands.mcpConfigSnippet(client.id, roots);
        await navigator.clipboard.writeText(snippet);
        setNotice({ kind: 'ok', text: t('mcp.snippetCopied') });
      } catch (e) {
        setNotice({ kind: 'error', text: String(e) });
      }
    },
    [roots, t],
  );

  const serverMissing = status !== null && status.serverPath === null;
  const canRegister = roots.length > 0 && !serverMissing;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('mcp.title')}>
      <div className="space-y-5">
        <p className="text-xs leading-relaxed text-[var(--qf-muted)]">{t('mcp.description')}</p>

        {serverMissing && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-300 text-xs">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{t('mcp.serverMissing')}</span>
          </div>
        )}

        {/* 허용 폴더 — 비어 있으면 서버가 아무 경로도 열지 못하므로 등록을 막는다 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--qf-text)]">{t('mcp.roots.title')}</span>
            <Button variant="secondary" size="sm" onClick={addRoot}>
              <FolderPlus size={14} className="mr-1" />
              {t('mcp.roots.add')}
            </Button>
          </div>
          <p className="text-xs text-[var(--qf-muted)] mb-2">{t('mcp.roots.description')}</p>
          {roots.length === 0 ? (
            <div className="px-3 py-2 rounded-lg border border-dashed border-[var(--qf-border)] text-xs text-[var(--qf-muted)]">
              {t('mcp.roots.empty')}
            </div>
          ) : (
            <ul className="space-y-1">
              {roots.map(root => (
                <li
                  key={root}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--qf-surface-2)]"
                >
                  <span className="flex-1 text-xs truncate text-[var(--qf-text)]" title={root}>
                    {root}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRoot(root)}
                    className="p-1 rounded hover:bg-[var(--qf-surface-hover)] text-[var(--qf-muted)]"
                    aria-label={t('mcp.roots.remove')}
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 클라이언트별 등록 상태 */}
        <div>
          <div className="text-sm font-medium text-[var(--qf-text)] mb-2">{t('mcp.clients.title')}</div>
          <ul className="space-y-1.5">
            {(status?.clients ?? []).map(client => {
              const registered = client.state !== 'not_registered';
              const outdated = client.state === 'outdated';
              return (
                <li
                  key={client.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--qf-surface-2)]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-[var(--qf-text)]">{client.label}</span>
                      {client.state === 'registered' && (
                        <Check size={13} className="text-emerald-400" />
                      )}
                      {outdated && <RefreshCw size={12} className="text-amber-400" />}
                    </div>
                    <div className="text-[11px] truncate text-[var(--qf-muted)]" title={client.configPath}>
                      {outdated ? t('mcp.state.outdated') : client.configPath}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copySnippet(client)}
                    disabled={!canRegister}
                    title={t('mcp.action.copy')}
                  >
                    <Copy size={13} />
                  </Button>
                  {registered && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => unregister(client)}
                      disabled={busy === client.id}
                    >
                      <Trash2 size={13} />
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => register(client)}
                    disabled={!canRegister || busy === client.id}
                  >
                    {outdated
                      ? t('mcp.action.update')
                      : registered
                        ? t('mcp.action.reregister')
                        : t('mcp.action.register')}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>

        {notice && (
          <div
            className={`px-3 py-2 rounded-lg text-xs break-all ${
              notice.kind === 'ok'
                ? 'bg-emerald-500/10 text-emerald-300'
                : 'bg-red-500/10 text-red-300'
            }`}
          >
            {notice.text}
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-[var(--qf-muted)]">{t('mcp.restartNote')}</p>

        {status?.serverPath && (
          <p className="text-[11px] text-[var(--qf-muted)] break-all">
            {t('mcp.serverPath')}: {status.serverPath}
          </p>
        )}
      </div>
    </Modal>
  );
}
