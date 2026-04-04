import { useState, useEffect, useCallback } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

// GitHub CHANGELOG.md에서 해당 버전 변경사항 추출
async function fetchChangelogNotes(newVer: string): Promise<string> {
  try {
    const repo = 'zzamjak-cloud/quick-folder';
    const response = await fetch(
      `https://raw.githubusercontent.com/${repo}/main/CHANGELOG.md`
    );
    if (!response.ok) return '';
    const text = await response.text();

    // ## [x.y.z] 헤더 사이의 내용을 추출
    const versionHeader = `## [${newVer}]`;
    const startIdx = text.indexOf(versionHeader);
    if (startIdx < 0) return '';

    // 다음 ## 헤더까지의 내용
    const afterHeader = text.slice(startIdx + versionHeader.length);
    const nextHeaderIdx = afterHeader.indexOf('\n## ');
    const section = nextHeaderIdx >= 0
      ? afterHeader.slice(0, nextHeaderIdx)
      : afterHeader;

    // 날짜 줄 제거 후 정리
    return section
      .replace(/^\s*-\s*\d{4}-\d{2}-\d{2}\s*\n?/, '\n')
      .trim();
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

          // release body가 비어있거나 기본 메시지면 CHANGELOG.md에서 변경사항 추출
          if (!body || body === '새로운 버전이 출시되었습니다.') {
            const changelogNotes = await fetchChangelogNotes(newVer);
            body = changelogNotes || '새로운 버전이 출시되었습니다.';
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
