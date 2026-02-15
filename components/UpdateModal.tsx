import React from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Download, RefreshCw, X } from 'lucide-react';
import { UpdateInfo } from '../types';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateInfo: UpdateInfo;
  isDownloading: boolean;
  downloadProgress: number;
  onInstall: () => void;
  onSkip: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  updateInfo,
  isDownloading,
  downloadProgress,
  onInstall,
  onSkip,
}) => {
  // 릴리스 노트 파싱 (마크다운 간단 처리)
  const parseReleaseNotes = (body?: string) => {
    if (!body) return '새로운 버전이 출시되었습니다.';

    // 마크다운 헤더 제거
    return body
      .split('\n')
      .filter(line => !line.startsWith('##'))
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="업데이트 사용 가능">
      <div className="space-y-4">
        {/* 버전 정보 */}
        <div className="flex items-center justify-between p-3 bg-[var(--qf-surface-2)] rounded-lg">
          <div>
            <p className="text-sm text-[var(--qf-muted)]">현재 버전</p>
            <p className="font-semibold text-[var(--qf-text)]">
              v{updateInfo.currentVersion}
            </p>
          </div>
          <div className="text-[var(--qf-muted)]">→</div>
          <div>
            <p className="text-sm text-[var(--qf-muted)]">새 버전</p>
            <p className="font-semibold text-[var(--qf-accent)]">
              v{updateInfo.version}
            </p>
          </div>
        </div>

        {/* 릴리스 날짜 */}
        {updateInfo.date && (
          <p className="text-xs text-[var(--qf-muted)]">
            출시일: {new Date(updateInfo.date).toLocaleDateString('ko-KR')}
          </p>
        )}

        {/* 릴리스 노트 */}
        <div className="max-h-[200px] overflow-y-auto p-3 bg-[var(--qf-surface)] rounded-lg border border-[var(--qf-border)]">
          <h4 className="text-sm font-semibold text-[var(--qf-text)] mb-2">
            변경 사항
          </h4>
          <p className="text-sm text-[var(--qf-muted)] whitespace-pre-wrap">
            {parseReleaseNotes(updateInfo.body)}
          </p>
        </div>

        {/* 진행률 바 */}
        {isDownloading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--qf-text)]">다운로드 중...</span>
              <span className="text-[var(--qf-accent)]">{downloadProgress}%</span>
            </div>
            <div className="w-full h-2 bg-[var(--qf-surface-2)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--qf-accent)] transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex gap-3 pt-4">
          <Button
            variant="secondary"
            onClick={onSkip}
            disabled={isDownloading}
            className="flex-1"
          >
            <X size={16} className="mr-1.5" />
            나중에
          </Button>
          <Button
            variant="primary"
            onClick={onInstall}
            disabled={isDownloading}
            className="flex-1"
          >
            {isDownloading ? (
              <>
                <RefreshCw size={16} className="mr-1.5 animate-spin" />
                설치 중...
              </>
            ) : (
              <>
                <Download size={16} className="mr-1.5" />
                지금 업데이트
              </>
            )}
          </Button>
        </div>

        {/* 안내 문구 */}
        <p className="text-xs text-[var(--qf-muted)] text-center">
          업데이트 후 앱이 자동으로 재시작됩니다
        </p>
      </div>
    </Modal>
  );
};
