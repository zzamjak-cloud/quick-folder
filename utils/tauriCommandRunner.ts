import { invokeTauriCommand } from './tauriInvoke.ts';

export function runCommand<T>(cmd: string, args: Record<string, unknown> = {}) {
  return invokeTauriCommand<T>(cmd, args, { priority: 'normal' });
}

export function runDirectCommand<T>(cmd: string, args: Record<string, unknown> = {}) {
  return invokeTauriCommand<T>(cmd, args, { priority: 'direct' });
}

export function runLowPriorityCommand<T>(cmd: string, args: Record<string, unknown> = {}) {
  return invokeTauriCommand<T>(cmd, args, { priority: 'low' });
}
