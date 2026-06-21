import React from 'react';
import type { ThemeVars } from './types';
import InlineFuzzyFilterInput from './InlineFuzzyFilterInput';

interface ExplorerLayoutProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  currentPath: string | null;
  instanceId: string;
  themeVars: ThemeVars | null;
  fuzzyFilterInputRef: React.RefObject<HTMLInputElement | null>;
  fuzzyFilterValue: string;
  fuzzyFilterEnabled: boolean;
  isMac: boolean;
  onFuzzyFilterChange: (value: string) => void;
  onFuzzyFilterClear: () => void;
  onContainerClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}

export default function ExplorerLayout({
  containerRef,
  currentPath,
  instanceId,
  themeVars,
  fuzzyFilterInputRef,
  fuzzyFilterValue,
  fuzzyFilterEnabled,
  isMac,
  onFuzzyFilterChange,
  onFuzzyFilterClear,
  onContainerClick,
  children,
}: ExplorerLayoutProps) {
  return (
    <div
      ref={containerRef}
      data-pane-drop-target={currentPath || undefined}
      data-pane-instance={instanceId}
      className="h-full flex flex-col outline-none relative"
      tabIndex={0}
      onClick={onContainerClick}
      style={{
        backgroundColor: themeVars?.bg ?? '#0f172a',
      }}
    >
      <InlineFuzzyFilterInput
        ref={fuzzyFilterInputRef}
        value={fuzzyFilterValue}
        enabled={fuzzyFilterEnabled}
        isMac={isMac}
        onChange={onFuzzyFilterChange}
        onClear={onFuzzyFilterClear}
      />
      {children}
    </div>
  );
}
