import React from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { AlertTriangle, Shield, X } from 'lucide-react';

interface UpdateFailedModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromVersion: string;
  toVersion: string;
  isWindows: boolean;
  onOpenSacSettings: () => void;
}

export function UpdateFailedModal({
  isOpen,
  onClose,
  fromVersion,
  toVersion,
  isWindows,
  onOpenSacSettings,
}: UpdateFailedModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-1">
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-amber-500/15 p-2">
              <AlertTriangle size={20} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white mb-1">
                업데이트가 완료되지 않았습니다
              </h2>
              <p className="text-xs text-gray-400">
                v{toVersion} 설치를 시도했지만 현재 v{fromVersion} 상태입니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* 원인 설명 */}
        <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
          {isWindows ? (
            <>
              <p className="mb-2 font-semibold">원인: Windows 스마트 앱 제어(SAC) 가능성</p>
              <p className="mb-2 text-amber-100/90">
                SAC가 켜져 있으면 설치 파일이 사용자에게 알리지 않고 차단될 수 있습니다.
              </p>
              <p className="mb-2 text-amber-100/90">
                아래 <b>SAC 설정 열기</b>를 누른 뒤, 설정 검색창에 <b className="text-amber-50">[스마트 앱 제어]</b>를 입력해 비활성화해 주세요.
                (버튼이 정확한 화면으로 연결되지 않을 수 있습니다.)
              </p>
              <p className="text-[11px] text-amber-200/70">
                SAC를 끈 뒤 앱을 재시작하고 다시 업데이트를 시도해 보세요.
              </p>
            </>
          ) : (
            <p className="text-amber-100/90">
              설치 파일 실행이 시스템에 의해 차단되었을 수 있습니다.
              릴리스 페이지에서 직접 설치 파일을 내려받아 실행해 보세요.
            </p>
          )}
        </div>

        {/* 액션 버튼 */}
        <div className="flex flex-col gap-2">
          {isWindows && (
            <Button
              onClick={onOpenSacSettings}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Shield size={16} className="mr-2" />
              SAC 설정 열기
            </Button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-1 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
