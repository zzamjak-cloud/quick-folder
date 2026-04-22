import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { ContextMenuItem, ContextMenuSection } from './types';

interface ContextMenuProps {
  x: number;
  y: number;
  sections: ContextMenuSection[];
  onClose: () => void;
}

// 서브메뉴가 있는 항목 렌더러
function SubmenuItem({ item, onClose }: { item: ContextMenuItem; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleEnter = () => { clearTimeout(timerRef.current); setOpen(true); };
  const handleLeave = () => { timerRef.current = setTimeout(() => setOpen(false), 150); };

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors text-left hover:bg-[var(--qf-surface-hover)] cursor-pointer"
        style={{ color: 'var(--qf-text)' }}
      >
        <span style={{ color: 'var(--qf-muted)' }}>{item.icon}</span>
        <span className="flex-1">{item.label}</span>
        <ChevronRight size={11} style={{ color: 'var(--qf-muted)' }} />
      </button>
      {open && item.submenu && (
        <div
          className="absolute left-full top-0 rounded-lg shadow-2xl overflow-hidden min-w-[120px] z-[10000]"
          style={{
            backgroundColor: 'var(--qf-surface-2)',
            border: '1px solid var(--qf-border)',
          }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <div className="py-1">
            {item.submenu.map(sub => (
              <button
                key={sub.id}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left hover:bg-[var(--qf-surface-hover)] cursor-pointer"
                style={{ color: sub.labelColor ?? 'var(--qf-text)', fontWeight: sub.labelColor ? 600 : undefined }}
                onClick={() => { sub.onClick(); onClose(); }}
              >
                {sub.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ContextMenu({ x, y, sections, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 화면 밖으로 나가지 않도록 위치 조정
  const [adjustedPos, setAdjustedPos] = React.useState({ x, y });

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setAdjustedPos({
      x: x + rect.width > vw ? Math.max(0, vw - rect.width - 8) : x,
      y: y + rect.height > vh ? Math.max(0, vh - rect.height - 8) : y,
    });
  }, [x, y]);

  // 외부 클릭 또는 ESC로 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // 단일 항목 렌더러
  const renderItem = (menuItem: ContextMenuItem) => {
    // 서브메뉴가 있는 경우 SubmenuItem 사용
    if (menuItem.submenu) {
      return <SubmenuItem key={menuItem.id} item={menuItem} onClose={onClose} />;
    }

    return (
      <button
        key={menuItem.id}
        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors text-left ${
          menuItem.disabled
            ? 'opacity-30 cursor-not-allowed'
            : 'hover:bg-[var(--qf-surface-hover)] cursor-pointer'
        }`}
        style={{ color: 'var(--qf-text)' }}
        onClick={menuItem.disabled ? undefined : () => { menuItem.onClick(); onClose(); }}
        disabled={menuItem.disabled}
      >
        <span style={{ color: 'var(--qf-muted)' }}>{menuItem.icon}</span>
        <span className="flex-1">{menuItem.label}</span>
        {menuItem.shortcut && (
          <span className="text-[10px] text-[var(--qf-muted)]">{menuItem.shortcut}</span>
        )}
      </button>
    );
  };

  // 섹션 간 구분선
  const divider = (key: string) => (
    <div key={key} className="my-1 border-t border-[var(--qf-border)]" />
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] rounded-lg shadow-2xl min-w-[180px]"
      style={{
        left: adjustedPos.x,
        top: adjustedPos.y,
        backgroundColor: 'var(--qf-surface-2)',
        border: '1px solid var(--qf-border)',
      }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="py-1">
        {sections.map((section, idx) => {
          // 빈 섹션은 건너뜀
          if (section.items.length === 0) return null;
          return (
            <React.Fragment key={section.id}>
              {idx > 0 && divider(`d-${section.id}`)}
              {section.items.map(renderItem)}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
