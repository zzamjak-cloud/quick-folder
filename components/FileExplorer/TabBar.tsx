import React, { useCallback, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { Tab, ThemeVars } from './types';

// 드롭 인디케이터 및 패널 하이라이트 전체 해제
function clearAllDragFeedback() {
  document.querySelectorAll('.qf-tab-drop-indicator').forEach(el => el.remove());
  document.querySelectorAll('[data-pane-drop-target]').forEach(p => {
    (p as HTMLElement).style.outline = '';
    (p as HTMLElement).style.outlineOffset = '';
  });
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabReorder: (fromIndex: number, toIndex: number) => void;
  onTabReceive?: (tab: Tab, insertIndex: number) => void;
  onTabRemove?: (tabId: string) => void;
  instanceId: string;
  themeVars: ThemeVars | null;
}

export default function TabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabReorder,
  onTabReceive,
  onTabRemove,
  instanceId,
  themeVars,
}: TabBarProps) {
  // 드래그 중 클릭 방지 플래그 (리렌더 불필요하므로 ref)
  const isDraggingRef = useRef(false);
  const ghostRef = useRef<HTMLDivElement | null>(null);

  // mouseup 클로저에서 최신 콜백/상태 참조용 ref
  const stateRef = useRef({ onTabReorder, onTabReceive, onTabRemove, tabs });
  stateRef.current = { onTabReorder, onTabReceive, onTabRemove, tabs };

  // --- 마우스 기반 탭 드래그 ---
  const handleMouseDown = useCallback((e: React.MouseEvent, tab: Tab, index: number) => {
    if (e.button !== 0) return;
    // 닫기 버튼 클릭은 무시
    if ((e.target as HTMLElement).closest('button')) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    const accentColor = themeVars?.accent ?? '#3b82f6';

    // --- 드래그 고스트 생성/이동/제거 ---
    function createGhost(x: number, y: number) {
      const ghost = document.createElement('div');
      ghost.id = 'qf-tab-drag-ghost';
      ghost.style.cssText = `
        position: fixed; pointer-events: none; z-index: 99999;
        left: ${x + 12}px; top: ${y + 12}px;
        display: flex; align-items: center; gap: 6px;
        padding: 4px 10px; border-radius: 6px;
        background: var(--qf-surface-2, #1f2937);
        border: 1px solid var(--qf-border, #334155);
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        font-size: 11px; color: var(--qf-text, #e5e7eb);
        max-width: 180px; opacity: 0.92;
      `;
      const nameEl = document.createElement('span');
      nameEl.textContent = tab.title || '새 탭';
      nameEl.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
      ghost.appendChild(nameEl);
      document.body.appendChild(ghost);
      ghostRef.current = ghost;
    }

    function moveGhost(x: number, y: number) {
      if (ghostRef.current) {
        ghostRef.current.style.left = `${x + 12}px`;
        ghostRef.current.style.top = `${y + 12}px`;
      }
    }

    function destroyGhost() {
      ghostRef.current?.remove();
      ghostRef.current = null;
    }

    function cleanup() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      clearAllDragFeedback();
      destroyGhost();
      // 드래그 중이던 탭 투명도 복원
      document.querySelectorAll(`[data-tab-id="${tab.id}"]`).forEach(el => {
        (el as HTMLElement).style.opacity = '';
      });
      setTimeout(() => { isDraggingRef.current = false; }, 0);
    }

    function onMouseMove(moveEvt: MouseEvent) {
      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;

      // 임계값(6px) 초과 시 드래그 시작
      if (!dragging && Math.sqrt(dx * dx + dy * dy) >= 6) {
        dragging = true;
        isDraggingRef.current = true;
        createGhost(moveEvt.clientX, moveEvt.clientY);
        // 드래그 중인 탭 투명하게
        document.querySelectorAll(`[data-tab-id="${tab.id}"]`).forEach(el => {
          (el as HTMLElement).style.opacity = '0.4';
        });
      }
      if (!dragging) return;

      moveGhost(moveEvt.clientX, moveEvt.clientY);
      clearAllDragFeedback();

      // 고스트 숨기고 elementFromPoint로 하위 요소 감지
      if (ghostRef.current) ghostRef.current.style.display = 'none';
      const el = document.elementFromPoint(moveEvt.clientX, moveEvt.clientY);
      if (ghostRef.current) ghostRef.current.style.display = '';
      if (!el) return;

      // 1) 다른 탭 위인지 확인
      const targetTab = el.closest('[data-tab-id]') as HTMLElement | null;
      if (targetTab && targetTab.getAttribute('data-tab-id') !== tab.id) {
        const rect = targetTab.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const side = moveEvt.clientX < midX ? 'left' : 'right';
        const indicator = document.createElement('div');
        indicator.className = 'qf-tab-drop-indicator';
        indicator.style.cssText = `
          position: absolute; ${side}: 0; top: 0; bottom: 0;
          width: 2px; background: ${accentColor}; z-index: 10; pointer-events: none;
        `;
        targetTab.appendChild(indicator);
        return;
      }

      // 2) 다른 패널 위인지 확인 (패널 전체 드롭)
      const paneEl = el.closest('[data-pane-drop-target]') as HTMLElement | null;
      if (paneEl) {
        const paneInstance = paneEl.getAttribute('data-pane-instance');
        if (paneInstance && paneInstance !== instanceId) {
          paneEl.style.outline = `2px dashed ${accentColor}`;
          paneEl.style.outlineOffset = '-2px';
        }
      }
    }

    function onMouseUp(upEvt: MouseEvent) {
      const wasDragging = dragging;
      cleanup();
      if (!wasDragging) return; // 클릭은 onClick에서 처리

      const el = document.elementFromPoint(upEvt.clientX, upEvt.clientY);
      if (!el) return;

      const { onTabReorder: reorder, onTabRemove: remove, tabs: currentTabs } = stateRef.current;

      // 1) 탭 위에 드롭
      const targetTab = el.closest('[data-tab-id]') as HTMLElement | null;
      if (targetTab) {
        const targetInstance = targetTab.getAttribute('data-tab-instance')!;
        const targetIndex = parseInt(targetTab.getAttribute('data-tab-index') ?? '0', 10);
        const rect = targetTab.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const insertBefore = upEvt.clientX < midX;
        let toIndex = insertBefore ? targetIndex : targetIndex + 1;

        if (targetInstance === instanceId) {
          // 같은 패널: 순서 변경
          if (index < toIndex) toIndex -= 1;
          if (index !== toIndex) reorder(index, toIndex);
        } else {
          // 다른 패널: 탭 이동 (커스텀 이벤트로 수신 패널에 전달)
          window.dispatchEvent(new CustomEvent('qf-tab-transfer', {
            detail: { tab, targetInstanceId: targetInstance, insertIndex: toIndex },
          }));
          if (remove) remove(tab.id);
        }
        return;
      }

      // 2) 패널 위에 드롭 (탭이 아닌 영역)
      const paneEl = el.closest('[data-pane-drop-target]') as HTMLElement | null;
      if (paneEl) {
        const paneInstance = paneEl.getAttribute('data-pane-instance');
        if (paneInstance && paneInstance !== instanceId) {
          // 다른 패널: 마지막에 추가
          window.dispatchEvent(new CustomEvent('qf-tab-transfer', {
            detail: { tab, targetInstanceId: paneInstance, insertIndex: -1 },
          }));
          if (remove) remove(tab.id);
        } else if (paneInstance === instanceId) {
          // 같은 패널 빈 영역: 마지막으로 이동
          const lastIndex = currentTabs.length - 1;
          if (index !== lastIndex) reorder(index, lastIndex);
        }
      }
    }

    // 동기적으로 리스너 등록 (useEffect 의존 문제 회피)
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [instanceId, themeVars?.accent]);

  // --- 다른 패널에서 탭 수신 (커스텀 이벤트) ---
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.targetInstanceId === instanceId && detail?.tab) {
        const { onTabReceive: receive, tabs: currentTabs } = stateRef.current;
        const insertAt = detail.insertIndex === -1 ? currentTabs.length : detail.insertIndex;
        if (receive) receive(detail.tab, insertAt);
      }
    };
    window.addEventListener('qf-tab-transfer', handler);
    return () => window.removeEventListener('qf-tab-transfer', handler);
  }, [instanceId]);

  if (tabs.length === 0) return null;

  const accentColor = themeVars?.accent ?? '#3b82f6';

  return (
    <div
      className="flex items-center overflow-x-auto flex-shrink-0 border-b relative"
      style={{
        backgroundColor: themeVars?.surface2 ?? '#1f2937',
        borderColor: themeVars?.border ?? '#334155',
        scrollbarWidth: 'none',
      }}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId;

        return (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            data-tab-index={index}
            data-tab-instance={instanceId}
            className="flex items-center gap-1 px-3 py-1.5 border-r cursor-pointer flex-shrink-0 group relative"
            style={{
              maxWidth: 160,
              borderColor: themeVars?.border ?? '#334155',
              backgroundColor: isActive ? (themeVars?.bg ?? '#0f172a') : 'transparent',
              borderBottom: isActive
                ? `2px solid ${accentColor}`
                : '2px solid transparent',
            }}
            onMouseDown={(e) => handleMouseDown(e, tab, index)}
            onClick={() => { if (!isDraggingRef.current) onTabSelect(tab.id); }}
            onAuxClick={(e) => {
              if (e.button === 1) { e.preventDefault(); onTabClose(tab.id); }
            }}
            title={tab.path}
          >
            <span
              className="text-xs truncate flex-1 min-w-0 select-none"
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
