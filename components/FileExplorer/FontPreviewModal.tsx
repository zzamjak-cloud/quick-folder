import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ModalShell from './ui/ModalShell';
import { ThemeVars } from './types';
import { getFileName } from '../../utils/pathUtils';

interface FontPreviewModalProps {
  path: string;
  onClose: () => void;
  themeVars: ThemeVars | null;
}

// 폰트 정보 구조체 (Rust 커맨드 응답)
interface FontInfo {
  name: string;
  family: string;
  style: string;
  glyph_count: number;
}

// 폰트 크기 옵션
const FONT_SIZE_OPTIONS = [12, 16, 24, 32, 48, 72, 96];

// 랜덤 단어 풀
const EN_WORDS = [
  'School', 'Student', 'Design', 'Creative', 'Keyboard', 'Folder', 'Project',
  'Window', 'Button', 'Coffee', 'Galaxy', 'Thunder', 'Pixel', 'Shadow',
  'Bridge', 'Dragon', 'Forest', 'Mountain', 'Ocean', 'Rocket', 'Sunset',
  'Village', 'Wonder', 'Horizon', 'Crystal', 'Rhythm', 'Journey', 'Harbor',
];
const KO_WORDS = [
  '학교', '학생', '디자인', '창의력', '키보드', '폴더', '프로젝트',
  '다람쥐', '커피', '은하수', '천둥', '그림자', '마을', '바다',
  '숲', '산', '노을', '여행', '수정', '리듬', '지평선', '항구',
  '들여쓰기', '글꼴', '무지개', '별빛', '햇살', '꿈나무',
];

// 랜덤 단어 조합으로 미리보기 텍스트 생성
function generateRandomText(): string {
  const words: string[] = [];
  for (let i = 0; i < 8; i++) {
    if (Math.random() < 0.4) {
      words.push(KO_WORDS[Math.floor(Math.random() * KO_WORDS.length)]);
    } else {
      words.push(EN_WORDS[Math.floor(Math.random() * EN_WORDS.length)]);
    }
  }
  return words.join(' ');
}

// 파일 확장자로 MIME 타입과 @font-face format 결정
function getFontFormat(filePath: string): { mime: string; format: string } {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ttf': case 'ttc': return { mime: 'font/ttf', format: 'truetype' };
    case 'otf':   return { mime: 'font/otf', format: 'opentype' };
    case 'woff':  return { mime: 'font/woff', format: 'woff' };
    case 'woff2': return { mime: 'font/woff2', format: 'woff2' };
    default:      return { mime: 'font/ttf', format: 'truetype' };
  }
}

export default function FontPreviewModal({ path, onClose, themeVars }: FontPreviewModalProps) {
  // 폰트 정보 상태
  const [fontInfo, setFontInfo] = useState<FontInfo | null>(null);
  const [fontInfoError, setFontInfoError] = useState<string | null>(null);

  // 폰트 로딩 상태
  const [fontFamilyName, setFontFamilyName] = useState<string>('');
  const [fontLoaded, setFontLoaded] = useState(false);

  // 선택 폰트 크기 (기본 32)
  const [selectedSize, setSelectedSize] = useState<number>(32);

  // 미리보기 텍스트 (기본값: 랜덤)
  const [previewText, setPreviewText] = useState<string>(() => generateRandomText());

  // 동적으로 삽입한 <style> 태그 참조 (언마운트 시 제거용)
  const styleTagRef = useRef<HTMLStyleElement | null>(null);

  // 파일명 (타이틀 표시용)
  const fileName = getFileName(path);

  // 폰트 정보 로드
  useEffect(() => {
    invoke<FontInfo>('get_font_info', { path })
      .then(info => setFontInfo(info))
      .catch(err => setFontInfoError(String(err)));
  }, [path]);

  // 폰트 바이트 로드 후 @font-face 동적 삽입
  useEffect(() => {
    const familyName = `qf-preview-${Date.now()}`;

    invoke<string>('read_font_bytes', { path })
      .then(base64 => {
        const { mime, format } = getFontFormat(path);
        const styleEl = document.createElement('style');
        styleEl.textContent = `
          @font-face {
            font-family: '${familyName}';
            src: url('data:${mime};base64,${base64}') format('${format}');
            font-display: block;
          }
        `;
        document.head.appendChild(styleEl);
        styleTagRef.current = styleEl;
        setFontFamilyName(familyName);
        setFontLoaded(true);
      })
      .catch(() => {
        // 폰트 로드 실패 시에도 모달은 유지
        setFontLoaded(false);
      });

    // 언마운트 시 <style> 태그 제거
    return () => {
      if (styleTagRef.current) {
        document.head.removeChild(styleTagRef.current);
        styleTagRef.current = null;
      }
    };
  }, [path]);

  // 프리셋 버튼 클릭 핸들러
  const handlePreset = (text: string) => {
    setPreviewText(text);
  };

  // 프리셋 버튼 목록
  const presets: { label: string; text: string }[] = [
    { label: 'A-Z',    text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
    { label: 'a-z',    text: 'abcdefghijklmnopqrstuvwxyz' },
    { label: '0-9',    text: '0123456789' },
    { label: 'Random', text: generateRandomText() },
    { label: '가-힣',  text: '가나다라마바사아자차카타파하' },
  ];

  // 공통 버튼 기본 스타일
  const presetBtnStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    padding: '2px 8px',
    border: `1px solid ${themeVars?.border ?? '#334155'}`,
    borderRadius: '4px',
    backgroundColor: themeVars?.surface ?? '#1e293b',
    color: themeVars?.text ?? '#e5e7eb',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  return (
    <ModalShell
      title={`폰트 미리보기 — ${fileName}`}
      maxWidth="52rem"
      maxHeight="90vh"
      saveLabel="닫기"
      onSave={onClose}
      onClose={onClose}
      themeVars={themeVars}
      overlayClose
    >
      <div
        className="flex flex-col gap-3 p-4 overflow-y-auto"
        style={{ flex: 1, minHeight: 0 }}
      >
        {/* 1. 폰트 정보 영역 */}
        <div
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs"
          style={{ color: themeVars?.muted ?? '#94a3b8' }}
        >
          {fontInfoError ? (
            <span style={{ color: '#f87171' }}>폰트 정보를 불러올 수 없음: {fontInfoError}</span>
          ) : fontInfo ? (
            <>
              <span><b style={{ color: themeVars?.text }}>이름:</b> {fontInfo.name}</span>
              <span><b style={{ color: themeVars?.text }}>패밀리:</b> {fontInfo.family}</span>
              <span><b style={{ color: themeVars?.text }}>스타일:</b> {fontInfo.style}</span>
              <span><b style={{ color: themeVars?.text }}>글리프:</b> {fontInfo.glyph_count.toLocaleString()}개</span>
            </>
          ) : (
            <span>폰트 정보 로딩 중...</span>
          )}
        </div>

        {/* 2. 크기 드롭다운 + 프리셋 버튼 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 크기 선택 */}
          <select
            value={selectedSize}
            onChange={e => setSelectedSize(Number(e.target.value))}
            style={{
              fontSize: '0.75rem',
              padding: '2px 6px',
              border: `1px solid ${themeVars?.border ?? '#334155'}`,
              borderRadius: '4px',
              backgroundColor: themeVars?.surface ?? '#1e293b',
              color: themeVars?.text ?? '#e5e7eb',
              cursor: 'pointer',
            }}
          >
            {FONT_SIZE_OPTIONS.map(size => (
              <option key={size} value={size}>{size}px</option>
            ))}
          </select>

          {/* 구분선 */}
          <span style={{ color: themeVars?.border ?? '#334155' }}>|</span>

          {/* 프리셋 버튼 목록 */}
          {presets.map(preset => (
            <button
              key={preset.label}
              style={presetBtnStyle}
              onClick={() => handlePreset(
                // Random 버튼은 클릭할 때마다 새 랜덤 문자열 생성
                preset.label === 'Random' ? generateRandomText() : preset.text
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* 3. 텍스트 입력 필드 */}
        <textarea
          rows={3}
          value={previewText}
          onChange={e => setPreviewText(e.target.value)}
          placeholder="미리볼 텍스트를 입력하세요..."
          style={{
            width: '100%',
            resize: 'vertical',
            maxHeight: '7.5rem', // 5줄 초과 시 스크롤
            padding: '8px',
            fontSize: '0.875rem',
            border: `1px solid ${themeVars?.border ?? '#334155'}`,
            borderRadius: '6px',
            backgroundColor: themeVars?.surface ?? '#1e293b',
            color: themeVars?.text ?? '#e5e7eb',
            outline: 'none',
            boxSizing: 'border-box',
            overflowY: 'auto',
          }}
        />

        {/* 4. 폰트 프리뷰 영역 */}
        <div
          style={{
            minHeight: '200px',
            padding: '16px',
            border: `1px solid ${themeVars?.border ?? '#334155'}`,
            borderRadius: '6px',
            backgroundColor: themeVars?.surface ?? '#1e293b',
            overflowY: 'auto',
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
            fontFamily: fontLoaded ? `'${fontFamilyName}', sans-serif` : 'sans-serif',
            fontSize: `${selectedSize}px`,
            color: themeVars?.text ?? '#e5e7eb',
            lineHeight: 1.4,
          }}
        >
          {/* 폰트 로딩 중 안내 */}
          {!fontLoaded && (
            <span style={{ fontSize: '0.75rem', color: themeVars?.muted ?? '#94a3b8' }}>
              폰트 로딩 중...
            </span>
          )}
          {/* 실제 미리보기 텍스트 */}
          {fontLoaded && (previewText || (
            <span style={{ fontSize: '0.75rem', color: themeVars?.muted ?? '#94a3b8' }}>
              텍스트를 입력하면 이 폰트로 표시됩니다.
            </span>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}
