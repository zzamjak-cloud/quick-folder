import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { ContextMenuItem, ContextMenuSection } from './types';

const MENU_MIN_WIDTH = 180;
const MENU_MAX_WIDTH = 360;
const SUBMENU_MIN_WIDTH = 180;
const SUBMENU_MAX_WIDTH = 360;

type MenuTone = 'light' | 'dark';

const READABLE_LABEL_COLORS: Record<string, Record<MenuTone, string>> = {
  '#f87171': { light: '#991b1b', dark: '#f87171' },
  '#60a5fa': { light: '#1e40af', dark: '#60a5fa' },
  '#4ade80': { light: '#14532d', dark: '#4ade80' },
  '#fbbf24': { light: '#92400e', dark: '#fbbf24' },
};

function parseHexColor(value: string): { r: number; g: number; b: number } | null {
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1].length === 3
    ? match[1].split('').map(ch => ch + ch).join('')
    : match[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const toLinear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getMenuTone(): MenuTone {
  if (typeof document === 'undefined') return 'dark';
  const portalRoot = document.getElementById('qf-root') ?? document.documentElement;
  const textColor = window.getComputedStyle(portalRoot).getPropertyValue('--qf-text').trim();
  const textRgb = parseHexColor(textColor);
  return textRgb && relativeLuminance(textRgb) < 0.35 ? 'light' : 'dark';
}

function getReadableLabelColor(labelColor: string | undefined, tone: MenuTone): string | undefined {
  if (!labelColor) return undefined;
  return READABLE_LABEL_COLORS[labelColor.toLowerCase()]?.[tone] ?? labelColor;
}

interface ContextMenuProps {
  x: number;
  y: number;
  sections: ContextMenuSection[];
  onClose: () => void;
}

// 서브메뉴가 있는 항목 렌더러
function SubmenuItem({ item, onClose, tone }: { item: ContextMenuItem; onClose: () => void; tone: MenuTone }) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  // 부모 메뉴처럼 서브메뉴도 화면 밖으로 나가지 않게 보정:
  // 오른쪽 공간이 부족하면 부모 왼쪽으로 플립, 아래로 넘치면 위로 밀어 올린다.
  const [placement, setPlacement] = useState<{ openLeft: boolean; offsetY: number }>({ openLeft: false, offsetY: 0 });

  const handleEnter = () => { clearTimeout(timerRef.current); setOpen(true); };
  const handleLeave = () => { timerRef.current = setTimeout(() => setOpen(false), 150); };

  useLayoutEffect(() => {
    if (!open) {
      setPlacement({ openLeft: false, offsetY: 0 });
      return;
    }
    const wrapper = wrapperRef.current;
    const submenu = submenuRef.current;
    if (!wrapper || !submenu) return;
    const parentRect = wrapper.getBoundingClientRect();
    const menuRect = submenu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // 좌우: 양쪽 다 부족하면 더 넓은 쪽을 선택
    const spaceRight = vw - parentRect.right - 8;
    const spaceLeft = parentRect.left - 8;
    const openLeft = menuRect.width > spaceRight && spaceLeft > spaceRight;
    // 상하: 아래로 넘치는 만큼 위로 이동 (단 화면 상단 8px 아래까지만)
    const bottomOverflow = parentRect.top + menuRect.height - (vh - 8);
    const offsetY = bottomOverflow > 0 ? -Math.min(bottomOverflow, Math.max(0, parentRect.top - 8)) : 0;
    setPlacement({ openLeft, offsetY });
  }, [open]);

  const labelStyle: React.CSSProperties = {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      ref={wrapperRef}
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
          ref={submenuRef}
          className="absolute rounded-lg shadow-2xl overflow-hidden z-[10000]"
          style={{
            backgroundColor: 'var(--qf-surface-2)',
            border: '1px solid var(--qf-border)',
            width: 'max-content',
            minWidth: SUBMENU_MIN_WIDTH,
            maxWidth: `min(${SUBMENU_MAX_WIDTH}px, calc(100vw - 16px))`,
            ...(placement.openLeft ? { right: '100%' } : { left: '100%' }),
            top: placement.offsetY,
          }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <div className="py-1">
            {item.submenu.map(sub => sub.custom ? (
              // 커스텀 노드 항목: 클릭해도 메뉴를 닫지 않는다 (드롭다운 등 인라인 컨트롤용)
              <div key={sub.id} onClick={e => e.stopPropagation()}>
                {sub.custom}
              </div>
            ) : (
              <div
                key={sub.id}
                className="w-full flex items-center text-xs transition-colors hover:bg-[var(--qf-surface-hover)]"
              >
                <button
                  className="min-w-0 flex-1 px-3 py-1.5 text-left cursor-pointer"
                  style={{ color: getReadableLabelColor(sub.labelColor, tone) ?? 'var(--qf-text)', fontWeight: sub.labelColor ? 600 : undefined }}
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
                    style={{ color: getReadableLabelColor(action.labelColor, tone) ?? 'var(--qf-muted)' }}
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
  const tone = getMenuTone();

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
      return <SubmenuItem key={menuItem.id} item={menuItem} onClose={onClose} tone={tone} />;
    }
    const labelColor = getReadableLabelColor(menuItem.labelColor, tone);

    return (
      <button
        key={menuItem.id}
        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors text-left ${
          menuItem.disabled
            ? 'opacity-30 cursor-not-allowed'
            : 'hover:bg-[var(--qf-surface-hover)] cursor-pointer'
        }`}
        style={{ color: labelColor ?? 'var(--qf-text)' }}
        onClick={menuItem.disabled ? undefined : () => { menuItem.onClick(); onClose(); }}
        disabled={menuItem.disabled}
        title={menuItem.label}
      >
        <span className="flex-shrink-0" style={{ color: labelColor ?? 'var(--qf-muted)' }}>{menuItem.icon}</span>
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
