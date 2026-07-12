import React, { useState, useCallback } from 'react';
import { ThemeVars } from './types';
import ModalShell from './ui/ModalShell';
import { getModalButtonStyle, getModalInputBaseStyle, getModalSectionBorderStyle } from './ui/modalStyles';
import { getPathSeparator, getBaseName, getExtension } from '../../utils/pathUtils';
import type { TranslationKey } from '../../utils/i18n';

interface BulkRenameModalProps {
  paths: string[];
  onClose: () => void;
  onApply: (renames: { oldPath: string; newPath: string }[]) => Promise<void>;
  themeVars: ThemeVars | null;
  t: (key: TranslationKey) => string;
}

// 다수 파일명에서 공통으로 시작하는 연속 prefix를 추출한다.
// 예) ["ScreenShot_260427_115201_172", "ScreenShot_260427_115358_953"]
//   → "ScreenShot_260427_115"
// 단일 파일이거나 공통 부분이 없으면 빈 문자열을 반환.
function findCommonPrefix(names: string[]): string {
  if (names.length < 2) return '';
  let prefix = names[0];
  for (let i = 1; i < names.length; i++) {
    const current = names[i];
    let j = 0;
    while (j < prefix.length && j < current.length && prefix[j] === current[j]) j++;
    prefix = prefix.slice(0, j);
    if (!prefix) return '';
  }
  return prefix;
}

export default function BulkRenameModal({ paths, onClose, onApply, themeVars, t }: BulkRenameModalProps) {
  // 원본 파일 정보 파싱
  const originalFiles = paths.map(p => {
    const sep = getPathSeparator(p);
    const parts = p.split(sep);
    const fullName = parts.pop()!;
    const dir = parts.join(sep);
    return { path: p, dir, fullName, baseName: getBaseName(p), ext: getExtension(p), sep };
  });

  // 다수 선택 시 공통 prefix를 "변경할 이름" 디폴트로 채워준다.
  const [inputName, setInputName] = useState(() => findCommonPrefix(originalFiles.map(f => f.baseName)));
  const [replaceName, setReplaceName] = useState('');
  const [numberDigits, setNumberDigits] = useState(1);
  const [warning, setWarning] = useState('');
  const [applying, setApplying] = useState(false);

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
    if (!inputName) { setWarning(t('bulkRename.warning.inputNameRequired')); return; }
    updatePreview(previewNames.map(() => inputName));
  };

  // Replace: 현재 미리보기 이름에서 문자열 치환
  const handleReplace = () => {
    if (!inputName || !replaceName) {
      setWarning(t('bulkRename.warning.inputAndReplaceRequired'));
      return;
    }
    updatePreview(previewNames.map(n => n.replaceAll(inputName, replaceName)));
  };

  // Delete: 현재 미리보기 이름에서 일치하는 문자열 제거
  const handleDelete = () => {
    if (!inputName) { setWarning(t('bulkRename.warning.inputNameRequired')); return; }
    updatePreview(previewNames.map(n => n.replaceAll(inputName, '')));
  };

  // Prefix: 접두사 추가
  const handlePrefix = () => {
    if (!inputName) { setWarning(t('bulkRename.warning.inputNameRequired')); return; }
    updatePreview(previewNames.map(n => inputName + n));
  };

  // Suffix: 접미사 추가 (확장자 앞)
  const handleSuffix = () => {
    if (!inputName) { setWarning(t('bulkRename.warning.inputNameRequired')); return; }
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
      setWarning(t('bulkRename.warning.applyFailed').replace('{message}', String(e)));
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

  const btnStyle = getModalButtonStyle(themeVars, { padding: '4px 10px' });
  const inputStyle = getModalInputBaseStyle(themeVars);
  const sectionBorderStyle = getModalSectionBorderStyle(themeVars);

  return (
    <ModalShell
      title={t('bulkRename.title').replace('{count}', String(paths.length))}
      width={560}
      maxHeight="85vh"
      saving={applying}
      saveLabel={t('bulkRename.apply')}
      overlayClose
      zIndex={9998}
      footerBtnStyle={btnStyle}
      onClose={onClose}
      onSave={handleApply}
      themeVars={themeVars}
    >
      {/* 입력 영역 */}
      <div className="px-4 py-3 flex flex-col gap-2" style={sectionBorderStyle}>
        <div className="flex items-center gap-2">
          <label className="text-xs w-20 flex-shrink-0" style={{ color: themeVars?.muted }}>{t('bulkRename.nameLabel')}</label>
          <input
            value={inputName}
            onChange={e => setInputName(e.target.value)}
            className="flex-1 px-2 py-1 text-xs rounded-md outline-none"
            style={inputStyle}
            placeholder={t('bulkRename.namePlaceholder')}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs w-20 flex-shrink-0" style={{ color: themeVars?.muted }}>{t('bulkRename.replaceLabel')}</label>
          <input
            value={replaceName}
            onChange={e => setReplaceName(e.target.value)}
            className="flex-1 px-2 py-1 text-xs rounded-md outline-none"
            style={inputStyle}
            placeholder={t('bulkRename.replacePlaceholder')}
          />
        </div>

        {/* 액션 버튼 */}
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          <button style={btnStyle} onClick={handleRename}>Rename</button>
          <button style={btnStyle} onClick={handleReplace}>Replace</button>
          <button style={btnStyle} onClick={handleDelete}>Delete</button>
          <button style={btnStyle} onClick={handlePrefix}>Prefix</button>
          <button style={btnStyle} onClick={handleSuffix}>Suffix</button>
          <button style={btnStyle} onClick={handleNumber}>Number</button>
          <div className="flex items-center gap-1 ml-1">
            <label className="text-[10px]" style={{ color: themeVars?.muted }}>{t('bulkRename.digitsLabel')}</label>
            <input
              type="number"
              min={1}
              max={6}
              value={numberDigits}
              onChange={e => setNumberDigits(Math.max(1, Math.min(6, Number(e.target.value))))}
              className="w-10 px-1 py-0.5 text-xs rounded-md outline-none text-center"
              style={inputStyle}
            />
          </div>
          <button
            style={{ ...btnStyle, marginLeft: 'auto', opacity: 0.7 }}
            onClick={handleReset}
          >
            {t('bulkRename.reset')}
          </button>
        </div>

        {warning && (
          <div className="text-xs mt-1" style={{ color: '#f87171' }}>{warning}</div>
        )}
      </div>

      {/* 미리보기 */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ maxHeight: 300 }}>
        <div className="text-[10px] mb-2" style={{ color: themeVars?.muted }}>{t('bulkRename.preview')}</div>
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
    </ModalShell>
  );
}
