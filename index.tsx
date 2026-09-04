import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { isTauri } from './utils/isTauri';
import { systemCommands } from './utils/tauriCommandDomains/systemCommands';

const RENDERER_CRASH_LOG_KEY = 'qf_renderer_crash_log_v1';

/**
 * 백엔드 흰 화면 워치독에 "렌더러가 살아 있다"고 알린다.
 * 신호가 없으면 백엔드가 WebView2 캐시를 정리하고 앱을 1회 재시작한다.
 * 정상 UI든 오류 화면이든 사용자에게 무언가 보이는 상태면 흰 화면이 아니므로 둘 다 신호를 보낸다.
 */
function signalFrontendReady() {
  if (!isTauri()) return;
  void systemCommands.markFrontendReady().catch(() => {
    // 신호 실패가 화면 렌더링을 막아서는 안 된다. 실패하면 워치독이 복구를 시도한다.
  });
}

function ReadySignal() {
  React.useEffect(() => {
    signalFrontendReady();
  }, []);

  return null;
}

function serializeCrashReason(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) {
    return { message: reason.message, stack: reason.stack };
  }

  if (reason && typeof reason === 'object') {
    const record = reason as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message : JSON.stringify(record);
    const stack = typeof record.stack === 'string' ? record.stack : undefined;
    return { message, stack };
  }

  return { message: String(reason) };
}

function recordRendererCrash(kind: string, reason: unknown, componentStack?: string) {
  try {
    const previous = JSON.parse(localStorage.getItem(RENDERER_CRASH_LOG_KEY) || '[]');
    const logs = Array.isArray(previous) ? previous : [];
    const serialized = serializeCrashReason(reason);
    logs.unshift({
      kind,
      message: serialized.message,
      stack: serialized.stack,
      componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
    localStorage.setItem(RENDERER_CRASH_LOG_KEY, JSON.stringify(logs.slice(0, 20)));
  } catch {
    // 오류 로깅 자체가 앱 렌더링을 방해하지 않도록 무시한다.
  }
}

window.addEventListener('error', event => {
  recordRendererCrash('window-error', event.error ?? event.message);
});

window.addEventListener('unhandledrejection', event => {
  recordRendererCrash('unhandled-rejection', event.reason);
});

class RootErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    recordRendererCrash('react-render', error, info.componentStack ?? undefined);
    // 오류 화면도 사용자에게 보이는 UI다. 캐시 손상이 아니므로 재시작으로 해결되지 않는다.
    signalFrontendReady();
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: '#0f172a',
            color: '#f8fafc',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700 }}>화면 오류가 발생했습니다</div>
          <div style={{ maxWidth: 520, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
            마지막 오류는 localStorage.{RENDERER_CRASH_LOG_KEY}에 저장되었습니다.
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: '1px solid #334155',
              borderRadius: 8,
              background: '#1e293b',
              color: '#f8fafc',
              padding: '8px 12px',
              cursor: 'pointer',
            }}
          >
            새로고침
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <RootErrorBoundary>
      <ReadySignal />
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
