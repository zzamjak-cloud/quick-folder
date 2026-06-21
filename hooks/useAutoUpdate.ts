import { useState, useEffect, useCallback } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from '../utils/isTauri';
import { readJsonStorage, removeStorage, writeJsonStorage } from '../utils/storage';
import { tauriCommands } from '../utils/tauriCommands';

const PENDING_UPDATE_KEY = 'qf_pending_update';
const PENDING_UPDATE_TTL_MS = 24 * 60 * 60 * 1000;

type PendingUpdateMarker = {
  fromVersion: string;
  toVersion: string;
  timestamp: number;
};

type PreviousUpdateFailure = {
  fromVersion: string;
  toVersion: string;
};

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

function readPendingMarker(): PendingUpdateMarker | null {
  const parsed = readJsonStorage<PendingUpdateMarker | null>(PENDING_UPDATE_KEY, null);
  if (!parsed?.fromVersion || !parsed.toVersion || !parsed.timestamp) return null;
  return parsed;
}

function clearPendingMarker() {
  removeStorage(PENDING_UPDATE_KEY);
}

function writePendingMarker(marker: PendingUpdateMarker) {
  writeJsonStorage(PENDING_UPDATE_KEY, marker);
}

export function useAutoUpdate(addToast: (msg: string, type: 'success' | 'error' | 'info') => void) {
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; body: string } | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [currentAppVersion, setCurrentAppVersion] = useState('');
  const [previousUpdateFailed, setPreviousUpdateFailed] = useState<PreviousUpdateFailure | null>(null);

  // SAC는 Windows 전용. navigator.userAgent로 충분히 판별
  const isWindows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

  // 앱 버전 로드 + 이전 업데이트 시도 결과 판정
  useEffect(() => {
    let cancelled = false;
    if (!isTauri()) {
      setCurrentAppVersion('dev');
      return;
    }
    getVersion()
      .then(v => {
        if (cancelled) return;
        setCurrentAppVersion(v);

        const marker = readPendingMarker();
        if (!marker) return;

        const expired = Date.now() - marker.timestamp > PENDING_UPDATE_TTL_MS;
        if (expired) {
          clearPendingMarker();
          return;
        }

        if (v === marker.toVersion) {
          // 업데이트 성공
          clearPendingMarker();
        } else if (v === marker.fromVersion) {
          // 버전이 그대로 — SAC 차단 가능성 안내
          setPreviousUpdateFailed({
            fromVersion: marker.fromVersion,
            toVersion: marker.toVersion,
          });
          clearPendingMarker();
        } else {
          clearPendingMarker();
        }
      })
      .catch(() => { if (!cancelled) setCurrentAppVersion('Unknown'); });
    return () => { cancelled = true; };
  }, []);

  // 자동 업데이트 체크
  useEffect(() => {
    if (!isTauri()) return;

    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update?.available) {
          const newVer = update.version || 'Unknown';

          // CHANGELOG.md에서 변경사항 우선 추출, 실패 시 release body 폴백
          const changelogNotes = await fetchChangelogNotes(newVer);
          const body = changelogNotes || update.body || '새로운 버전이 출시되었습니다.';

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
    if (!updateInfo || !isTauri()) return;

    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      const update = await check();
      if (update?.available) {
        addToast('업데이트를 다운로드하고 있습니다...', 'info');

        // SAC 등으로 인한 조용한 실패를 다음 실행 시 감지하기 위한 마커
        writePendingMarker({
          fromVersion: currentAppVersion,
          toVersion: updateInfo.version,
          timestamp: Date.now(),
        });

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
      clearPendingMarker();
      setIsDownloading(false);
      setIsUpdateModalOpen(false);
    }
  }, [updateInfo, addToast, currentAppVersion]);

  // Windows 스마트 앱 제어(SAC) 설정 페이지 바로 열기
  // — Rust ShellExecuteW로 직접 호출 (cmd /c start 가 SAC 환경에서 차단되던 이슈 대응)
  const openSacSettings = useCallback(async () => {
    if (!isTauri()) {
      addToast('Tauri 앱에서만 설정을 열 수 있습니다.', 'info');
      return;
    }
    try {
      await tauriCommands.openSacSettings();
      addToast('설정에서 검색창에 [스마트 앱 제어]를 입력한 뒤 끄기로 변경해 주세요.', 'info');
    } catch (error) {
      console.error('SAC 설정 열기 실패:', error);
      addToast('설정을 열 수 없습니다. Windows 설정에서 [스마트 앱 제어]를 검색해 비활성화해 주세요.', 'error');
    }
  }, [addToast]);

  const dismissPreviousUpdateFailed = useCallback(() => {
    setPreviousUpdateFailed(null);
  }, []);

  return {
    isUpdateModalOpen, setIsUpdateModalOpen,
    updateInfo,
    isDownloading,
    downloadProgress,
    currentAppVersion,
    handleUpdate,
    // SAC 대응
    isWindows,
    previousUpdateFailed,
    dismissPreviousUpdateFailed,
    openSacSettings,
  };
}
