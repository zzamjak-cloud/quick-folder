import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, ShieldCheck, Square, Wrench } from 'lucide-react';
import { ThemeVars } from './types';
import ModalShell from './ui/ModalShell';
import {
  getModalButtonStyle,
  getModalInputBaseStyle,
  getModalPanelStyle,
  getModalSectionBorderStyle,
} from './ui/modalStyles';
import { getFileName } from '../../utils/pathUtils';
import { agentCommands, type AgentId, type AgentStatus } from '../../utils/tauriCommandDomains/agentCommands';
import { appendAgentLines, formatAgentStdout, type AgentLine } from './agentStreamFormat';
import type { TranslationKey } from '../../utils/i18n';

interface AgentRequestModalProps {
  path: string;
  themeVars: ThemeVars | null;
  onClose: () => void;
  t: (key: TranslationKey) => string;
}

function formatMessage(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? ''));
}

function createRequestId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 줄 종류별 색. 도구 호출과 최종 결과를 본문과 구분해 준다. */
function lineColor(kind: AgentLine['kind'], themeVars: ThemeVars | null): string {
  if (kind === 'error') return '#fca5a5';
  if (kind === 'tool') return themeVars?.accent ?? '#3b82f6';
  if (kind === 'result') return themeVars?.text ?? '#e5e7eb';
  return themeVars?.muted ?? '#94a3b8';
}

export default function AgentRequestModal({ path, themeVars, onClose, t }: AgentRequestModalProps) {
  const [agents, setAgents] = useState<AgentStatus[] | null>(null);
  const [agentId, setAgentId] = useState<AgentId | ''>('');
  const [prompt, setPrompt] = useState('');
  const [lines, setLines] = useState<AgentLine[]>([]);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  // 봉쇄가 보장되지 않는 에이전트는 사용자가 한 번 더 동의해야 실행된다
  const [acceptedRisk, setAcceptedRisk] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const folderName = getFileName(path) || path;
  const btnStyle = getModalButtonStyle(themeVars);
  const inputStyle = getModalInputBaseStyle(themeVars);
  const sectionBorderStyle = getModalSectionBorderStyle(themeVars);
  const logStyle = getModalPanelStyle(themeVars);

  // 실행 가능한 에이전트 = 등록됨 + CLI 있음
  const usable = useMemo(() => (agents ?? []).filter(a => a.registered && a.cliAvailable), [agents]);
  const selected = useMemo(() => usable.find(a => a.id === agentId) ?? null, [usable, agentId]);

  useEffect(() => {
    let cancelled = false;
    agentCommands
      .agentStatus()
      .then(list => {
        if (cancelled) return;
        setAgents(list);
        const first = list.find(a => a.registered && a.cliAvailable);
        if (first) setAgentId(first.id);
      })
      .catch(e => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 에이전트를 바꾸면 위험 동의를 다시 받는다
  useEffect(() => {
    setAcceptedRisk(false);
  }, [agentId]);

  // 새 줄이 붙으면 아래로 따라간다
  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines]);

  const handleRun = useCallback(async () => {
    if (running) return;
    if (!agentId) {
      setError(t('agentRequest.error.noAgent'));
      return;
    }
    if (!prompt.trim()) {
      setError(t('agentRequest.error.promptRequired'));
      return;
    }
    if (selected && !selected.confinesToFolder && !acceptedRisk) {
      setError(t('agentRequest.error.riskNotAccepted'));
      return;
    }

    const requestId = createRequestId();
    requestIdRef.current = requestId;
    setError('');
    setLines([]);
    setRunning(true);

    try {
      const code = await agentCommands.agentRun(requestId, agentId, path, prompt, event => {
        if (event.kind === 'stdout') {
          const parsed = formatAgentStdout(event.line, agentId);
          if (parsed.length > 0) setLines(prev => appendAgentLines(prev, parsed));
        } else if (event.kind === 'stderr' && event.line.trim()) {
          setLines(prev => appendAgentLines(prev, [{ kind: 'error', text: event.line.trim() }]));
        }
      });
      if (code !== 0) {
        setError(formatMessage(t('agentRequest.error.exitCode'), { code }));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      requestIdRef.current = null;
      setRunning(false);
    }
  }, [agentId, path, prompt, running, selected, acceptedRisk, t]);

  const handleCancel = useCallback(async () => {
    const requestId = requestIdRef.current;
    if (!requestId) return;
    try {
      await agentCommands.agentCancel(requestId);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // 모달이 닫힐 때 실행 중이던 요청을 남기지 않는다
  useEffect(() => {
    return () => {
      const requestId = requestIdRef.current;
      if (requestId) void agentCommands.agentCancel(requestId);
    };
  }, []);

  const noUsableAgent = agents !== null && usable.length === 0;

  return (
    <ModalShell
      title={formatMessage(t('agentRequest.title'), { folder: folderName })}
      width={640}
      maxHeight="85vh"
      saveLabel={t('agentRequest.run')}
      savingLabel={t('agentRequest.running')}
      saving={running}
      cancelLabel={t('agentRequest.close')}
      overlayClose={!running}
      footerBtnStyle={btnStyle}
      onClose={onClose}
      onSave={handleRun}
      themeVars={themeVars}
    >
      <div className="flex flex-col gap-3 px-4 py-3" style={sectionBorderStyle}>
        <div className="flex items-center gap-2">
          <Bot size={14} style={{ color: themeVars?.accent ?? '#3b82f6', flexShrink: 0 }} />
          <select
            value={agentId}
            onChange={e => setAgentId(e.target.value as AgentId)}
            disabled={running || usable.length === 0}
            className="rounded-md px-2 py-1.5 text-xs outline-none"
            style={inputStyle}
          >
            {usable.length === 0 && <option value="">{t('agentRequest.noAgentOption')}</option>}
            {usable.map(agent => (
              <option key={agent.id} value={agent.id}>{agent.label}</option>
            ))}
          </select>
          <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: themeVars?.muted ?? '#94a3b8' }} title={path}>
            {path}
          </span>
        </div>

        <div className="flex items-start gap-2 rounded-md px-3 py-2 text-[11px]" style={logStyle}>
          <ShieldCheck size={13} style={{ color: themeVars?.accent ?? '#3b82f6', flexShrink: 0, marginTop: 1 }} />
          <span style={{ color: themeVars?.muted ?? '#94a3b8' }}>{t('agentRequest.scopeNotice')}</span>
        </div>

        {selected && !selected.confinesToFolder && (
          <div
            className="flex flex-col gap-2 rounded-md px-3 py-2 text-[11px]"
            style={{ color: '#fca5a5', backgroundColor: 'rgba(248,113,113,0.12)' }}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{formatMessage(t('agentRequest.notConfined'), { agent: selected.label })}</span>
            </div>
            <label className="flex cursor-pointer items-center gap-2 pl-[21px]">
              <input
                type="checkbox"
                checked={acceptedRisk}
                disabled={running}
                onChange={e => setAcceptedRisk(e.target.checked)}
              />
              <span>{t('agentRequest.acceptRisk')}</span>
            </label>
          </div>
        )}

        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          disabled={running}
          rows={4}
          className="resize-none rounded-md px-2 py-1.5 text-xs outline-none"
          style={inputStyle}
          placeholder={t('agentRequest.promptPlaceholder')}
        />

        {noUsableAgent && (
          <div className="rounded-md px-3 py-2 text-xs" style={{ color: themeVars?.muted ?? '#94a3b8', ...logStyle }}>
            {t('agentRequest.setupHint')}
          </div>
        )}

        {(lines.length > 0 || running) && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: themeVars?.muted ?? '#94a3b8' }}>
                {t('agentRequest.output')}
              </span>
              {running && (
                <button
                  type="button"
                  style={{ ...btnStyle, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  onClick={handleCancel}
                >
                  <Square size={11} />
                  {t('agentRequest.stop')}
                </button>
              )}
            </div>
            <div
              ref={logRef}
              className="max-h-64 min-h-24 overflow-y-auto rounded-md px-3 py-2 text-[11px] leading-relaxed"
              style={logStyle}
            >
              {lines.map((line, index) => (
                <div
                  key={index}
                  className={line.kind === 'tool' ? 'flex items-center gap-1.5 font-mono' : 'whitespace-pre-wrap'}
                  style={{ color: lineColor(line.kind, themeVars) }}
                >
                  {line.kind === 'tool' && <Wrench size={10} style={{ flexShrink: 0 }} />}
                  {line.text}
                </div>
              ))}
              {running && lines.length === 0 && (
                <div style={{ color: themeVars?.muted ?? '#94a3b8' }}>{t('agentRequest.waiting')}</div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md px-3 py-2 text-xs" style={{ color: '#fca5a5', backgroundColor: 'rgba(248,113,113,0.1)' }}>
            {error}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
