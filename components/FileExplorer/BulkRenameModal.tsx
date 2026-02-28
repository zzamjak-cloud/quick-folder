import React, { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { ThemeVars } from './types';

interface BulkRenameModalProps {
  paths: string[];
  onClose: () => void;
  onApply: (renames: { oldPath: string; newPath: string }[]) => Promise<void>;
  themeVars: ThemeVars | null;
}

export default function BulkRenameModal({ paths, onClose, onApply, themeVars }: BulkRenameModalProps) {
  const [inputName, setInputName] = useState('');
  const [replaceName, setReplaceName] = useState('');
  const [numberDigits, setNumberDigits] = useState(1);
  const [warning, setWarning] = useState('');
  const [applying, setApplying] = useState(false);

  // 원본 파일 정보 파싱
  const originalFiles = paths.map(p => {
    const sep = p.includes('/') ? '/' : '\\';
    const parts = p.split(sep);
    const fullName = parts.pop()!;
    const dir = parts.join(sep);
    const dotIdx = fullName.lastIndexOf('.');
    const baseName = dotIdx > 0 ? fullName.substring(0, dotIdx) : fullName;
    const ext = dotIdx > 0 ? fullName.substring(dotIdx) : '';
    return { path: p, dir, fullName, baseName, ext, sep };
  });

  // 미리보기 이름 (확장자 제외한 베이스네임만 변환)
  const [previewNames, setPreviewNames] = useState<string[]>(
    originalFiles.map(f => f.baseName)
  );

  const updatePreview = useCallback((newNames: string[]) => {
    setPreviewNames(newNames);
    setWarning('');
  }, []);

  // Rename: 변경할 이름으로 전체 교체
  const handleRename = () => {
    if (!inputName) { setWarning('변경할 이름을 입력하세요'); return; }
    updatePreview(previewNames.map(() => inputName));
  };

  // Replace: 현재 미리보기 이름에서 문자열 치환
  const handleReplace = () => {
    if (!inputName || !replaceName) {
      setWarning('변경할 이름과 대체할 이름을 모두 입력하세요');
      return;
    }
    updatePreview(previewNames.map(n => n.replaceAll(inputName, replaceName)));
  };

  // Prefix: 접두사 추가
  const handlePrefix = () => {
    if (!inputName) { setWarning('변경할 이름을 입력하세요'); return; }
    updatePreview(previewNames.map(n => inputName + n));
  };

  // Suffix: 접미사 추가 (확장자 앞)
  const handleSuffix = () => {
    if (!inputName) { setWarning('변경할 이름을 입력하세요'); return; }
    updatePreview(previewNames.map(n => n + inputName));
  };

  // Number: 순번 추가
  const handleNumber = () => {
    updatePreview(previewNames.map((n, i) => {
      const num = String(i + 1).padStart(numberDigits, '0');
      return n + num;
    }));
  };

  // 적용
  const handleApply = async () => {
    setApplying(true);
    try {
      const renames = originalFiles.map((f, i) => ({
        oldPath: f.path,
        newPath: f.dir + f.sep + previewNames[i] + f.ext,
      }));
      await onApply(renames);
      onClose();
    } catch (e) {
      setWarning(`적용 실패: ${e}`);
    } finally {
      setApplying(false);
    }
  };

  // 리셋
  const handleReset = () => {
    updatePreview(originalFiles.map(f => f.baseName));
    setInputName('');
    setReplaceName('');
  };

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 6,
    border: `1px solid ${themeVars?.border ?? '#334155'}`,
    backgroundColor: themeVars?.surface ?? '#111827',
    color: themeVars?.text ?? '#e5e7eb',
    cursor: 'pointer',
  };

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-2xl flex flex-col"
        style={{
          backgroundColor: themeVars?.surface2 ?? '#1e293b',
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
          width: 560, maxHeight: '85vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}>
          <span className="text-sm font-medium" style={{ color: themeVars?.text ?? '#e5e7eb' }}>
            이름 모두 바꾸기 ({paths.length}개 파일)
          </span>
          <button className="p-1 hover:opacity-70" style={{ color: themeVars?.muted }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* 입력 영역 */}
        <div className="px-4 py-3 flex flex-col gap-2" style={{ borderBottom: `1px solid ${themeVars?.border ?? '#334155'}` }}>
          <div className="flex items-center gap-2">
            <label className="text-xs w-20 flex-shrink-0" style={{ color: themeVars?.muted }}>변경할 이름</label>
            <input
              value={inputName}
              onChange={e => setInputName(e.target.value)}
              className="flex-1 px-2 py-1 text-xs rounded-md outline-none"
              style={{
                backgroundColor: themeVars?.surface ?? '#111827',
                color: themeVars?.text ?? '#e5e7eb',
                border: `1px solid ${themeVars?.border ?? '#334155'}`,
              }}
              placeholder="입력..."
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs w-20 flex-shrink-0" style={{ color: themeVars?.muted }}>대체할 이름</label>
            <input
              value={replaceName}
              onChange={e => setReplaceName(e.target.value)}
              className="flex-1 px-2 py-1 text-xs rounded-md outline-none"
              style={{
                backgroundColor: themeVars?.surface ?? '#111827',
                color: themeVars?.text ?? '#e5e7eb',
                border: `1px solid ${themeVars?.border ?? '#334155'}`,
              }}
              placeholder="Replace 시 사용..."
            />
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <button style={btnStyle} onClick={handleRename}>Rename</button>
            <button style={btnStyle} onClick={handleReplace}>Replace</button>
            <button style={btnStyle} onClick={handlePrefix}>Prefix</button>
            <button style={btnStyle} onClick={handleSuffix}>Suffix</button>
            <button style={btnStyle} onClick={handleNumber}>Number</button>
            <div className="flex items-center gap-1 ml-1">
              <label className="text-[10px]" style={{ color: themeVars?.muted }}>자리수</label>
              <input
                type="number"
                min={1}
                max={6}
                value={numberDigits}
                onChange={e => setNumberDigits(Math.max(1, Math.min(6, Number(e.target.value))))}
                className="w-10 px-1 py-0.5 text-xs rounded-md outline-none text-center"
                style={{
                  backgroundColor: themeVars?.surface ?? '#111827',
                  color: themeVars?.text ?? '#e5e7eb',
                  border: `1px solid ${themeVars?.border ?? '#334155'}`,
                }}
              />
            </div>
            <button
              style={{ ...btnStyle, marginLeft: 'auto', opacity: 0.7 }}
              onClick={handleReset}
            >
              리셋
            </button>
          </div>

          {warning && (
            <div className="text-xs mt-1" style={{ color: '#f87171' }}>{warning}</div>
          )}
        </div>

        {/* 미리보기 */}
        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ maxHeight: 300 }}>
          <div className="text-[10px] mb-2" style={{ color: themeVars?.muted }}>미리보기</div>
          <div className="flex flex-col gap-1">
            {originalFiles.map((f, i) => (
              <div key={f.path} className="flex items-center gap-2 text-xs py-0.5">
                <span className="flex-1 truncate" style={{ color: themeVars?.muted }}>{f.baseName}{f.ext}</span>
                <span style={{ color: themeVars?.muted }}>&rarr;</span>
                <span
                  className="flex-1 truncate font-medium"
                  style={{ color: previewNames[i] !== f.baseName ? (themeVars?.accent ?? '#3b82f6') : themeVars?.text }}
                >
                  {previewNames[i]}{f.ext}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: `1px solid ${themeVars?.border ?? '#334155'}` }}>
          <button style={btnStyle} onClick={onClose}>취소</button>
          <button
            style={{
              ...btnStyle,
              backgroundColor: themeVars?.accent ?? '#3b82f6',
              color: '#fff',
              border: 'none',
              opacity: applying ? 0.5 : 1,
            }}
            onClick={handleApply}
            disabled={applying}
          >
            {applying ? '적용 중...' : '적용'}
          </button>
        </div>
      </div>
    </div>
  );
}
