import React from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Download, X, AlertTriangle, Shield, ExternalLink } from 'lucide-react';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  version: string;
  currentVersion: string;
  releaseNotes: string;
  isDownloading: boolean;
  downloadProgress?: number;
  isWindows?: boolean;
  onOpenSacSettings?: () => void;
  onOpenSacGuide?: () => void;
}

export function UpdateModal({
  isOpen,
  onClose,
  onUpdate,
  version,
  currentVersion,
  releaseNotes,
  isDownloading,
  downloadProgress,
  isWindows = false,
  onOpenSacSettings,
  onOpenSacGuide,
}: UpdateModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={isDownloading ? () => {} : onClose}>
      <div className="p-6">
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">
              새로운 업데이트 사용 가능
            </h2>
            <p className="text-sm text-gray-400">
              {currentVersion} → {version}
            </p>
          </div>
          {!isDownloading && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Windows 스마트 앱 제어(SAC) 경고 배너 */}
        {isWindows && !isDownloading && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <div className="flex gap-3">
              <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-amber-400" />
              <div className="flex-1 text-xs leading-relaxed text-amber-100">
                <p className="mb-1 font-semibold">Windows 스마트 앱 제어(SAC) 필수 확인</p>
                <p className="mb-2 text-amber-100/90">
                  SAC가 켜져 있으면 설치 파일이 <b>아무 알림 없이 차단</b>됩니다.
                  업데이트 전에 <b>반드시 SAC를 꺼주세요</b>.
                  <br />
                  <span className="text-amber-200/80">
                    (한 번 끄면 Windows 재설치 없이 다시 켤 수 없으니 주의)
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {onOpenSacSettings && (
                    <button
                      type="button"
                      onClick={onOpenSacSettings}
                      className="inline-flex items-center gap-1 rounded-md bg-amber-500/30 px-2.5 py-1 text-[11px] font-semibold text-amber-50 hover:bg-amber-500/50 transition-colors"
                    >
                      <Shield size={12} />
                      SAC 설정 열기
                    </button>
                  )}
                  {onOpenSacGuide && (
                    <button
                      type="button"
                      onClick={onOpenSacGuide}
                      className="inline-flex items-center gap-1 rounded-md bg-transparent border border-amber-500/40 px-2.5 py-1 text-[11px] text-amber-200 hover:bg-amber-500/10 transition-colors"
                    >
                      <ExternalLink size={12} />
                      상세 가이드
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 변경사항 */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">
            변경사항
          </h3>
          <div className="bg-slate-800/50 rounded-lg p-4 max-h-64 overflow-y-auto">
            {releaseNotes ? (
              <div className="prose prose-invert prose-sm max-w-none">
                {releaseNotes.split('\n').map((line, index) => {
                  // 헤딩 처리
                  if (line.startsWith('### ')) {
                    return (
                      <h4
                        key={index}
                        className="text-sm font-semibold text-blue-400 mt-3 mb-1"
                      >
                        {line.replace('### ', '')}
                      </h4>
                    );
                  }
                  // 리스트 아이템 처리
                  if (line.startsWith('- ')) {
                    return (
                      <li key={index} className="text-gray-300 text-sm ml-4">
                        {line.replace('- ', '')}
                      </li>
                    );
                  }
                  // 빈 줄
                  if (line.trim() === '') {
                    return <br key={index} />;
                  }
                  // 일반 텍스트
                  return (
                    <p key={index} className="text-gray-300 text-sm">
                      {line}
                    </p>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">
                새로운 버전이 출시되었습니다. 업데이트하여 최신 기능을
                사용하세요.
              </p>
            )}
          </div>
        </div>

        {/* 다운로드 진행률 */}
        {isDownloading && downloadProgress !== undefined && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300">다운로드 중...</span>
              <span className="text-sm text-gray-400">
                {downloadProgress.toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-500 h-2 transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex gap-3">
          <Button
            onClick={onUpdate}
            disabled={isDownloading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={16} className="mr-2" />
            {isDownloading ? '다운로드 중...' : '업데이트'}
          </Button>
          {!isDownloading && (
            <Button
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white"
            >
              나중에
            </Button>
          )}
        </div>

        {isDownloading && (
          <p className="text-xs text-gray-500 text-center mt-3">
            업데이트 완료 후 앱이 자동으로 재시작됩니다.
          </p>
        )}
      </div>
    </Modal>
  );
}
