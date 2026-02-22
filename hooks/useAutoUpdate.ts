import { useState, useEffect, useCallback } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

export function useAutoUpdate(addToast: (msg: string, type: 'success' | 'error' | 'info') => void) {
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; body: string } | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [currentAppVersion, setCurrentAppVersion] = useState('');

  // 앱 버전 가져오기
  useEffect(() => {
    getVersion().then(v => setCurrentAppVersion(v)).catch(() => setCurrentAppVersion('Unknown'));
  }, []);

  // 자동 업데이트 체크
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update?.available) {
          setUpdateInfo({
            version: update.version || 'Unknown',
            body: update.body || '새로운 버전이 출시되었습니다.',
          });
          setIsUpdateModalOpen(true);
        }
      } catch (error) {
        console.error('업데이트 확인 실패:', error);
      }
    };

    const timer = setTimeout(checkForUpdates, 5000);
    return () => clearTimeout(timer);
  }, []);

  // 업데이트 실행
  const handleUpdate = useCallback(async () => {
    if (!updateInfo) return;

    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      const update = await check();
      if (update?.available) {
        addToast('업데이트를 다운로드하고 있습니다...', 'info');

        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              console.log('다운로드 시작:', event.data.contentLength);
              setDownloadProgress(0);
              break;
            case 'Progress':
              console.log(`다운로드 중: ${event.data.chunkLength} bytes`);
              setDownloadProgress((prev) => Math.min(prev + 10, 90));
              break;
            case 'Finished':
              console.log('다운로드 완료');
              setDownloadProgress(100);
              break;
          }
        });

        addToast('업데이트가 완료되었습니다. 앱을 재시작합니다.', 'success');
        await relaunch();
      }
    } catch (error) {
      console.error('업데이트 실패:', error);
      addToast('업데이트에 실패했습니다.', 'error');
      setIsDownloading(false);
      setIsUpdateModalOpen(false);
    }
  }, [updateInfo, addToast]);

  return {
    isUpdateModalOpen, setIsUpdateModalOpen,
    updateInfo,
    isDownloading,
    downloadProgress,
    currentAppVersion,
    handleUpdate,
  };
}
