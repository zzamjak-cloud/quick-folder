import type { ThemeVars } from '../types';

interface CodePreviewStatusBarProps {
  themeVars: ThemeVars;
  editMode: boolean;
  isDirty: boolean;
  lineCount: number;
  foldedCount: number;
}

export function CodePreviewStatusBar({
  themeVars,
  editMode,
  isDirty,
  lineCount,
  foldedCount,
}: CodePreviewStatusBarProps) {
  return (
    <div
      className="flex items-center justify-between px-4 py-1.5 flex-shrink-0 text-xs"
      style={{
        borderTop: `1px solid ${themeVars.border}`,
        color: themeVars.muted,
        backgroundColor: themeVars.surface,
      }}
    >
      <span>
        {lineCount}줄
        {editMode && isDirty && (
          <span className="ml-2" style={{ color: '#f87171' }}>● 미저장</span>
        )}
      </span>
      <span>
        {editMode
          ? '편집 모드 (Ctrl+S 저장 · ESC 종료)'
          : (foldedCount > 0 ? `${foldedCount}개 블록 접힘` : '읽기 모드 (E 키로 편집)')}
      </span>
    </div>
  );
}
