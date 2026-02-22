import React from 'react';
import { X } from 'lucide-react';
import { Tab, ThemeVars } from './types';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  themeVars: ThemeVars | null;
}

export default function TabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  themeVars,
}: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div
      className="flex items-center overflow-x-auto flex-shrink-0 border-b"
      style={{
        backgroundColor: themeVars?.surface2 ?? '#1f2937',
        borderColor: themeVars?.border ?? '#334155',
        scrollbarWidth: 'none',
      }}
    >
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className="flex items-center gap-1 px-3 py-1.5 border-r cursor-pointer flex-shrink-0 group"
            style={{
              maxWidth: 160,
              borderColor: themeVars?.border ?? '#334155',
              backgroundColor: isActive ? (themeVars?.bg ?? '#0f172a') : 'transparent',
              borderBottom: isActive
                ? `2px solid ${themeVars?.accent ?? '#3b82f6'}`
                : '2px solid transparent',
            }}
            onClick={() => onTabSelect(tab.id)}
            onAuxClick={(e) => {
              if (e.button === 1) { e.preventDefault(); onTabClose(tab.id); }
            }}
            title={tab.path}
          >
            <span
              className="text-xs truncate flex-1 min-w-0"
              style={{ color: isActive ? (themeVars?.text ?? '#e5e7eb') : (themeVars?.muted ?? '#94a3b8') }}
            >
              {tab.title || '새 탭'}
            </span>
            {tabs.length > 1 && (
              <button
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 rounded p-0.5 transition-opacity hover:bg-[var(--qf-surface-hover)]"
                style={{ color: themeVars?.muted ?? '#94a3b8' }}
                onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
                title="탭 닫기"
              >
                <X size={10} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
