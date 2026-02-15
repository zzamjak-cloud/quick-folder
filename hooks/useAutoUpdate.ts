import { useState, useEffect, useCallback } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { UpdateStatus, UpdateInfo } from '../types';

interface UseAutoUpdateReturn {
  updateStatus: UpdateStatus;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  checkForUpdate: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
}

export function useAutoUpdate(
  autoCheckOnMount: boolean = true,
  onError?: (error: string) => void
): UseAutoUpdateReturn {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    available: false,
  });
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);

  // 업데이트 체크 함수
  const checkForUpdate = useCallback(async () => {
    try {
      setIsChecking(true);
      setUpdateStatus({ available: false });

      const update = await check();

      if (update) {
        setPendingUpdate(update);
        setUpdateStatus({
          available: true,
          info: {
            version: update.version,
            currentVersion: update.currentVersion,
            date: update.date,
            body: update.body,
          },
        });
      } else {
        setUpdateStatus({ available: false });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '업데이트 확인 실패';
      setUpdateStatus({ available: false, error: errorMsg });
      onError?.(errorMsg);
    } finally {
      setIsChecking(false);
    }
  }, [onError]);

  // 다운로드 및 설치 함수
  const downloadAndInstall = useCallback(async () => {
    if (!pendingUpdate) {
      onError?.('설치할 업데이트가 없습니다');
      return;
    }

    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      // 다운로드 진행률 콜백
      await pendingUpdate.downloadAndInstall((progress) => {
        if (progress.event === 'Started') {
          setDownloadProgress(0);
        } else if (progress.event === 'Progress') {
          const percent = Math.round(
            (progress.data.downloaded / progress.data.contentLength!) * 100
          );
          setDownloadProgress(percent);
        } else if (progress.event === 'Finished') {
          setDownloadProgress(100);
        }
      });

      // 앱 재시작
      await relaunch();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '업데이트 설치 실패';
      onError?.(errorMsg);
      setIsDownloading(false);
    }
  }, [pendingUpdate, onError]);

  // 마운트 시 자동 체크
  useEffect(() => {
    if (autoCheckOnMount) {
      // 개발 모드에서는 체크하지 않음
      if (import.meta.env.DEV) {
        console.log('[AutoUpdate] 개발 모드에서는 업데이트 체크를 건너뜁니다');
        return;
      }

      // 앱 시작 후 3초 대기 (UI 로딩 완료 후)
      const timer = setTimeout(() => {
        checkForUpdate();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [autoCheckOnMount, checkForUpdate]);

  return {
    updateStatus,
    isChecking,
    isDownloading,
    downloadProgress,
    checkForUpdate,
    downloadAndInstall,
  };
}
