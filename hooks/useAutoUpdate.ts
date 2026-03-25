import { useState, useEffect, useCallback } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

// GitHub 커밋 메시지로 변경사항 생성
async function fetchCommitNotes(currentVer: string, newVer: string): Promise<string> {
  try {
    const repo = 'zzamjak-cloud/quick-folder';
    const response = await fetch(
      `https://api.github.com/repos/${repo}/compare/v${currentVer}...v${newVer}`
    );
    if (!response.ok) return '';
    const data = await response.json();
    const commits = data.commits as Array<{ commit: { message: string } }>;
    if (!commits || commits.length === 0) return '';

    // 커밋 메시지에서 변경사항 추출 (첫 줄만, merge commit 제외)
    const notes = commits
      .map((c: { commit: { message: string } }) => c.commit.message.split('\n')[0])
      .filter((msg: string) => !msg.startsWith('Merge'))
      .map((msg: string) => `- ${msg}`)
      .join('\n');

    return notes || '';
  } catch {
    return '';
  }
}

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
          let body = update.body || '';
          const currentVer = await getVersion();
          const newVer = update.version || 'Unknown';

          // release body가 비어있거나 기본 메시지면 커밋 메시지에서 변경사항 추출
          if (!body || body === '새로운 버전이 출시되었습니다.') {
            const commitNotes = await fetchCommitNotes(currentVer, newVer);
            body = commitNotes || '새로운 버전이 출시되었습니다.';
          }

          setUpdateInfo({ version: newVer, body });
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
