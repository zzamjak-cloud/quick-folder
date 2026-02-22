import { useEffect } from 'react';
import { getCurrentWindow, LogicalSize, LogicalPosition, availableMonitors } from '@tauri-apps/api/window';

const WINDOW_STATE_KEY = 'quickfolder_window_state';

export function useWindowState() {
  useEffect(() => {
    let unlistenResize: (() => void) | undefined;
    let unlistenMove: (() => void) | undefined;
    let saveTimeout: ReturnType<typeof setTimeout> | undefined;
    let isMounted = true;

    const saveWindowState = async () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        if (!isMounted) return;
        try {
          const appWindow = getCurrentWindow();
          const size = await appWindow.innerSize();
          const position = await appWindow.outerPosition();
          const scaleFactor = await appWindow.scaleFactor();

          const state = {
            width: Math.round(size.width / scaleFactor),
            height: Math.round(size.height / scaleFactor),
            x: Math.round(position.x / scaleFactor),
            y: Math.round(position.y / scaleFactor),
          };
          localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify(state));
        } catch (e) {
          console.error('Failed to save window state', e);
        }
      }, 500);
    };

    const isPositionOnScreen = async (x: number, y: number, width: number, height: number): Promise<boolean> => {
      try {
        const monitors = await availableMonitors();
        if (monitors.length === 0) return true;

        const windowRight = x + width;
        const windowBottom = y + height;

        for (const monitor of monitors) {
          const monitorX = monitor.position.x;
          const monitorY = monitor.position.y;
          const monitorRight = monitorX + monitor.size.width;
          const monitorBottom = monitorY + monitor.size.height;

          const overlapX = Math.min(windowRight, monitorRight) - Math.max(x, monitorX);
          const overlapY = Math.min(windowBottom, monitorBottom) - Math.max(y, monitorY);

          if (overlapX >= 100 && overlapY >= 50) {
            return true;
          }
        }
        return false;
      } catch (e) {
        console.error('Failed to check monitor bounds', e);
        return true;
      }
    };

    const setupWindowState = async () => {
      const appWindow = getCurrentWindow();

      await new Promise(resolve => setTimeout(resolve, 100));
      if (!isMounted) return;

      const savedState = localStorage.getItem(WINDOW_STATE_KEY);
      if (savedState) {
        try {
          const { width, height, x, y } = JSON.parse(savedState);

          const validWidth = width && width >= 400 ? width : 800;
          const validHeight = height && height >= 300 ? height : 600;

          await appWindow.setSize(new LogicalSize(validWidth, validHeight));

          if (typeof x === 'number' && typeof y === 'number') {
            const isOnScreen = await isPositionOnScreen(x, y, validWidth, validHeight);
            if (isOnScreen) {
              await appWindow.setPosition(new LogicalPosition(x, y));
            } else {
              await appWindow.center();
            }
          }
        } catch (e) {
          console.error('Failed to restore window state', e);
        }
      }

      unlistenResize = await appWindow.onResized(saveWindowState);
      unlistenMove = await appWindow.onMoved(saveWindowState);
    };

    setupWindowState();

    return () => {
      isMounted = false;
      if (unlistenResize) unlistenResize();
      if (unlistenMove) unlistenMove();
      if (saveTimeout) clearTimeout(saveTimeout);
    };
  }, []);
}
