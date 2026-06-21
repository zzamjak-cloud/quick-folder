import React, { lazy, Suspense, useRef, useState } from 'react';
import { ThemeVars } from '../../types';
import { getFileName } from '../../utils/pathUtils';
import { useEscapeKey } from './hooks/useEscapeKey';
import type { FbxPreviewSceneHandle } from './FbxPreviewScene';

const FbxPreviewScene = lazy(() => import('./FbxPreviewScene'));

interface FbxPreviewModalProps {
  path: string;
  themeVars: ThemeVars | null;
  onClose: () => void;
}

export default function FbxPreviewModal({ path, themeVars, onClose }: FbxPreviewModalProps) {
  const fileName = getFileName(path);
  const sceneRef = useRef<FbxPreviewSceneHandle | null>(null);
  const [wireframe, setWireframe] = useState(false);

  const surface2 = themeVars?.surface2 ?? '#1e293b';
  const border = themeVars?.border ?? '#334155';
  const textColor = themeVars?.text ?? '#e5e7eb';
  const mutedColor = themeVars?.muted ?? '#94a3b8';
  const accentColor = themeVars?.accent ?? '#3b82f6';

  const toolbarBtn: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: mutedColor,
    padding: '3px 8px',
    borderRadius: 4,
    fontSize: 12,
  };

  useEscapeKey(onClose);

  return (
    <div
      className="fixed inset-0 z-[9998] flex flex-col"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ backgroundColor: surface2, borderBottom: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}
      >
        <span className="text-sm font-medium truncate" style={{ color: textColor }}>
          {fileName}
        </span>
        <button style={{ ...toolbarBtn, fontSize: 18 }} onClick={onClose}>
          ✕
        </button>
      </div>

      <div
        className="flex items-center gap-2 px-4 py-1 shrink-0"
        style={{ backgroundColor: surface2, borderBottom: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}
      >
        <button
          style={toolbarBtn}
          onClick={() => sceneRef.current?.resetCamera()}
          title="카메라를 초기 위치로 복귀"
        >
          ↺ 카메라 리셋
        </button>

        <div style={{ width: 1, height: 16, backgroundColor: border }} />

        <button
          style={{
            ...toolbarBtn,
            color: wireframe ? accentColor : mutedColor,
            fontWeight: wireframe ? 600 : 400,
          }}
          onClick={() => setWireframe(prev => !prev)}
          title="와이어프레임 모드 토글"
        >
          ⬡ 와이어프레임
        </button>
      </div>

      <Suspense
        fallback={
          <div
            className="flex-1 min-h-0 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(26, 26, 46, 0.85)', color: mutedColor }}
            onClick={e => e.stopPropagation()}
          >
            FBX 뷰어 로딩 중...
          </div>
        }
      >
        <FbxPreviewScene
          ref={sceneRef}
          path={path}
          accentColor={accentColor}
          mutedColor={mutedColor}
          wireframe={wireframe}
        />
      </Suspense>

      <div
        className="flex items-center justify-center px-4 py-1 shrink-0"
        style={{ backgroundColor: surface2, borderTop: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}
      >
        <span style={{ color: mutedColor, fontSize: 11 }}>
          드래그: 회전 &nbsp;|&nbsp; 스크롤: 확대/축소 &nbsp;|&nbsp; 우클릭 드래그: 이동
        </span>
      </div>
    </div>
  );
}
