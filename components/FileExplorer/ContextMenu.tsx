import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { ContextMenuItem, ContextMenuSection } from './types';

const MENU_MIN_WIDTH = 180;
const MENU_MAX_WIDTH = 360;
const SUBMENU_MIN_WIDTH = 180;
const SUBMENU_MAX_WIDTH = 360;

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

  const labelStyle: React.CSSProperties = {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

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
        <span className="flex-shrink-0" style={{ color: 'var(--qf-muted)' }}>{item.icon}</span>
        <span className="flex-1" style={labelStyle} title={item.label}>{item.label}</span>
        <ChevronRight size={11} style={{ color: 'var(--qf-muted)' }} />
      </button>
      {open && item.submenu && (
        <div
          className="absolute left-full top-0 rounded-lg shadow-2xl overflow-hidden z-[10000]"
          style={{
            backgroundColor: 'var(--qf-surface-2)',
            border: '1px solid var(--qf-border)',
            width: 'max-content',
            minWidth: SUBMENU_MIN_WIDTH,
            maxWidth: `min(${SUBMENU_MAX_WIDTH}px, calc(100vw - 16px))`,
          }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <div className="py-1">
            {item.submenu.map(sub => (
              <div
                key={sub.id}
                className="w-full flex items-center text-xs transition-colors hover:bg-[var(--qf-surface-hover)]"
              >
                <button
                  className="min-w-0 flex-1 px-3 py-1.5 text-left cursor-pointer"
                  style={{ color: sub.labelColor ?? 'var(--qf-text)', fontWeight: sub.labelColor ? 600 : undefined }}
                  onClick={() => { sub.onClick(); onClose(); }}
                  title={sub.label}
                >
                  <span
                    className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                    style={{ textAlign: sub.align ?? 'left' }}
                  >
                    {sub.label}
                  </span>
                </button>
                {sub.trailingActions?.map(action => (
                  <button
                    key={action.id}
                    type="button"
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center transition-colors ${
                      action.disabled ? 'cursor-not-allowed opacity-30' : 'cursor-pointer hover:bg-[var(--qf-surface-hover)]'
                    }`}
                    style={{ color: action.labelColor ?? 'var(--qf-muted)' }}
                    title={action.title}
                    disabled={action.disabled}
                    onClick={action.disabled ? undefined : (event) => {
                      event.stopPropagation();
                      action.onClick();
                      onClose();
                    }}
                  >
                    {action.icon}
                  </button>
                ))}
              </div>
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
    document.addEventListener('mousedown', handleClick, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick, true);
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
        style={{ color: menuItem.labelColor ?? 'var(--qf-text)' }}
        onClick={menuItem.disabled ? undefined : () => { menuItem.onClick(); onClose(); }}
        disabled={menuItem.disabled}
        title={menuItem.label}
      >
        <span className="flex-shrink-0" style={{ color: menuItem.labelColor ?? 'var(--qf-muted)' }}>{menuItem.icon}</span>
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{menuItem.label}</span>
        {menuItem.shortcut && (
          <span className="flex-shrink-0 text-[10px] text-[var(--qf-muted)]">{menuItem.shortcut}</span>
        )}
      </button>
    );
  };

  // 섹션 간 구분선
  const divider = (key: string) => (
    <div key={key} className="my-1 border-t border-[var(--qf-border)]" />
  );

  // transform 조상(사이드바 줌 래퍼)을 벗어나되 테마 CSS 변수는 상속받도록 #qf-root로 포털 렌더
  const portalRoot = document.getElementById('qf-root') ?? document.body;
  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] rounded-lg shadow-2xl"
      style={{
        left: adjustedPos.x,
        top: adjustedPos.y,
        backgroundColor: 'var(--qf-surface-2)',
        border: '1px solid var(--qf-border)',
        width: 'max-content',
        minWidth: MENU_MIN_WIDTH,
        maxWidth: `min(${MENU_MAX_WIDTH}px, calc(100vw - 16px))`,
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
    </div>,
    portalRoot,
  );
}
