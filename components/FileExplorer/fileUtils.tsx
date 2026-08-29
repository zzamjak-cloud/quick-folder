import React from 'react';
import { Folder, File, FileImage, FileVideo, FileText, FileCode, Archive, Cog } from 'lucide-react';
import type { ThemeVars } from './types';
import {
  BatIcon,
  BinIcon,
  CSharpIcon,
  DbIcon,
  HtmlIcon,
  JavaScriptIcon,
  JsonIcon,
  MarkdownIcon,
  PowerShellIcon,
  PythonIcon,
  TomlIcon,
  TxtIcon,
  UnityIcon,
} from './extensionIcons';

// 파일명에서 확장자 추출 (소문자)
// Blender 백업본(.blend1 ~ .blend32 — 저장 시 유지 개수 설정에 따라 늘어남)은
// 'blend'로 정규화해 원본과 같은 아이콘을 쓴다
function getExt(fileName?: string): string {
  if (!fileName) return '';
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  return /^blend\d+$/.test(ext) ? 'blend' : ext;
}

// Blender .blend 전용 로고 아이콘 (공식 로고 SVG — 브랜드 컬러 고정)
// 셸 아이콘과 달리 Blender 설치 여부·OS와 무관하게 항상 동일하게 표시된다
const BlenderIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 128 128"
    className={className}
    preserveAspectRatio="xMidYMid meet"
  >
    <g transform="translate(0 12) scale(0.5)">
      <path
        fill="#fff"
        d="M100.43 115.195c.931-16.606 9.062-31.235 21.33-41.606c12.03-10.186 28.222-16.412 45.89-16.412c17.65 0 33.843 6.226 45.882 16.412c12.258 10.37 20.39 25 21.33 41.588c.93 17.062-5.928 32.912-17.958 44.661c-12.267 11.951-29.716 19.45-49.254 19.45s-37.021-7.499-49.28-19.45c-12.039-11.75-18.88-27.6-17.94-44.643"
      />
      <path
        fill="#265787"
        d="M133.168 116.676c.477-8.52 4.65-16.027 10.944-21.348c6.173-5.226 14.481-8.421 23.547-8.421c9.056 0 17.365 3.195 23.542 8.421c6.29 5.321 10.462 12.828 10.944 21.34c.478 8.754-3.04 16.887-9.214 22.915c-6.294 6.132-15.247 9.98-25.272 9.98s-18.996-3.848-25.286-9.98c-6.177-6.028-9.687-14.161-9.205-22.907"
      />
      <path
        fill="#ea7600"
        d="M78.41 134.18c.06 3.34 1.125 9.834 2.724 14.904c3.359 10.733 9.057 20.663 16.986 29.413c8.137 8.995 18.156 16.22 29.73 21.349c12.164 5.387 25.344 8.132 39.034 8.11c13.668-.019 26.849-2.818 39.013-8.246c11.573-5.179 21.583-12.435 29.707-21.434c7.924-8.787 13.613-18.734 16.982-29.467c1.693-5.423 2.763-10.927 3.192-16.45a75 75 0 0 0-.528-16.336c-1.508-10.611-5.18-20.567-10.833-29.643c-5.17-8.34-11.834-15.641-19.759-21.787l.018-.013l-79.97-61.405c-.073-.054-.132-.112-.209-.162c-5.246-4.028-14.07-4.014-19.84.022c-5.834 4.082-6.502 10.833-1.31 15.09l-.022.023l33.355 27.124l-101.663.108h-.136c-8.403.01-16.48 5.523-18.08 12.49c-1.643 7.098 4.065 12.986 12.802 13.018l-.014.031l51.53-.1L9.167 141.4c-.117.086-.244.176-.352.262c-8.674 6.642-11.478 17.687-6.015 24.676c5.545 7.108 17.335 7.121 26.099.041l50.184-41.071s-.732 5.544-.673 8.872m128.955 18.566c-10.34 10.535-24.817 16.508-40.48 16.54c-15.687.027-30.163-5.893-40.503-16.409c-5.053-5.125-8.764-11.022-11.054-17.303a44.9 44.9 0 0 1-2.537-19.334c.546-6.462 2.47-12.625 5.54-18.202c3.016-5.481 7.17-10.435 12.3-14.625c10.05-8.19 22.847-12.625 36.23-12.643c13.398-.018 26.185 4.376 36.246 12.54c5.12 4.171 9.27 9.107 12.286 14.58a45.7 45.7 0 0 1 5.563 18.192a45 45 0 0 1-2.547 19.32c-2.294 6.3-5.992 12.197-11.044 17.344"
      />
    </g>
  </svg>
);

// 네이티브 아이콘이 안 나오는 확장자만 lucide 아이콘 폴백 매핑
// (이 확장자들은 useNativeIcon의 SKIP_NATIVE_EXTS에도 등록됨)
export const EXT_ICON: Record<string, React.FC<{ size: number; className?: string }>> = {
  // 문서·텍스트
  md: MarkdownIcon,          // 마크다운
  markdown: MarkdownIcon,
  mdx: MarkdownIcon,
  txt: TxtIcon,              // 일반 텍스트
  text: TxtIcon,
  json: JsonIcon,            // JSON
  toml: TomlIcon,            // TOML

  // 스크립트·코드
  py: PythonIcon,            // 파이썬
  pyw: PythonIcon,
  pyi: PythonIcon,
  js: JavaScriptIcon,        // 자바스크립트
  mjs: JavaScriptIcon,
  cjs: JavaScriptIcon,
  jsx: JavaScriptIcon,
  cs: CSharpIcon,            // C#
  html: HtmlIcon,            // HTML
  htm: HtmlIcon,
  bat: BatIcon,              // 윈도우 배치
  cmd: BatIcon,
  ps1: PowerShellIcon,       // 파워셸
  psm1: PowerShellIcon,
  psd1: PowerShellIcon,
  sh: TxtIcon,               // 셸 스크립트 → 텍스트 문서 아이콘

  // 바이너리·데이터
  bin: BinIcon,              // 바이너리
  db: DbIcon,                // 데이터베이스
  sqlite: DbIcon,
  sqlite3: DbIcon,
  sql: DbIcon,
  exe: Cog,                  // 실행파일 → 톱니바퀴 아이콘

  // 3D 툴
  unitypackage: UnityIcon,   // Unity3D 패키지 → 유니티 로고
  unity: UnityIcon,          // Unity 씬
  blend: BlenderIcon,        // Blender 파일(.blend + .blend1/2… 백업본) → 블렌더 로고
};

// 확장자별 전용 색상 (네이티브 아이콘 skip 대상만)
const EXT_COLOR: Record<string, string> = {
  md: '#64748b',         // 마크다운 외곽선 → 슬레이트
  markdown: '#64748b',
  mdx: '#64748b',
  txt: '#94a3b8',        // 텍스트 라벨 밴드 → 그레이
  text: '#94a3b8',
  sh: '#94a3b8',         // 셸 스크립트 → 텍스트와 동일
  bat: '#7f8c9a',        // 배치 라벨 밴드 → 다크 그레이
  cmd: '#7f8c9a',
  bin: '#a8a29e',        // 바이너리 라벨 밴드 → 스톤
  db: '#38bdf8',         // DB 라벨 밴드 → 스카이 블루
  sqlite: '#38bdf8',
  sqlite3: '#38bdf8',
  sql: '#38bdf8',
  exe: '#60a5fa',        // 실행파일 블루
};

// 파일 타입별 아이콘 컴포넌트
export function FileTypeIcon({ fileType, size, fileName }: { fileType: string; size: number; fileName?: string }) {
  const iconProps = { size, className: 'flex-shrink-0' };
  // 확장자별 전용 아이콘 우선 적용
  const ext = getExt(fileName);
  const ExtIcon = EXT_ICON[ext];
  if (ExtIcon) return <ExtIcon {...iconProps} />;

  switch (fileType) {
    case 'directory': return <Folder {...iconProps} />;
    case 'image':     return <FileImage {...iconProps} />;
    case 'video':     return <FileVideo {...iconProps} />;
    case 'document':  return <FileText {...iconProps} />;
    case 'code':      return <FileCode {...iconProps} />;
    case 'archive':   return <Archive {...iconProps} />;
    default:          return <File {...iconProps} />;
  }
}

// 파일 타입별 아이콘 색상
export function iconColor(fileType: string, fileName?: string): string {
  // 확장자별 전용 색상 우선 적용
  const ext = getExt(fileName);
  const extColor = EXT_COLOR[ext];
  if (extColor) return extColor;

  switch (fileType) {
    case 'directory': return '#60a5fa';
    case 'image':     return '#34d399';
    case 'video':     return '#a78bfa';
    case 'document':  return '#fbbf24';
    case 'code':      return '#22d3ee';
    case 'archive':   return '#fb923c';
    default:          return '#94a3b8';
  }
}

function colorWithAlpha(color: string | undefined, alpha: number, fallback: string): string {
  const hex = color?.trim();
  if (!hex) return fallback;

  const shortHex = /^#([0-9a-f]{3})$/i.exec(hex);
  const fullHex = /^#([0-9a-f]{6})$/i.exec(hex);
  const value = fullHex?.[1] ?? shortHex?.[1]?.split('').map(ch => ch + ch).join('');
  if (!value) return fallback;

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgb(color: string | undefined): { r: number; g: number; b: number } | null {
  const hex = color?.trim();
  if (!hex) return null;

  const shortHex = /^#([0-9a-f]{3})$/i.exec(hex);
  const fullHex = /^#([0-9a-f]{6})$/i.exec(hex);
  const value = fullHex?.[1] ?? shortHex?.[1]?.split('').map(ch => ch + ch).join('');
  if (!value) return null;

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const srgb = [r, g, b].map(value => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function getFileIconShadowStyle(
  themeVars: ThemeVars | null | undefined,
  compact = false
): React.CSSProperties {
  const bg = hexToRgb(themeVars?.bg);
  if (!bg || relativeLuminance(bg) < 0.35) {
    return {};
  }

  const core = colorWithAlpha(themeVars?.text, compact ? 0.34 : 0.36, 'rgba(15, 23, 42, 0.34)');
  const soft = colorWithAlpha(themeVars?.text, 0.16, 'rgba(15, 23, 42, 0.16)');

  return {
    filter: compact
      ? `drop-shadow(0 1px 1px ${core})`
      : `drop-shadow(0 1px 1px ${core}) drop-shadow(0 4px 8px ${soft})`,
  };
}

// OS 드래그 이미지 (24x24 반투명 파란색 아이콘, PNG data URI)
// tauri-plugin-drag의 Base64Image 변형으로 역직렬화됨
// 1x1 투명 PNG 폴백 (canvas 2D context 미지원 환경)
const FALLBACK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==';
export const DRAG_IMAGE = (() => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext('2d');
    if (!ctx) return FALLBACK_PNG;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.7)';
    ctx.fillRect(0, 0, 24, 24);
    return canvas.toDataURL('image/png');
  } catch {
    return FALLBACK_PNG;
  }
})();

function getBaseName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

export function createFileDragImage(paths: string[], sourceElement?: HTMLElement | null) {
  try {
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return DRAG_IMAGE;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 16);
    ctx.fill();

    const img = sourceElement?.querySelector('img') as HTMLImageElement | null;
    if (img?.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(8, 8, 80, 80, 12);
      ctx.clip();
      ctx.drawImage(img, 8, 8, 80, 80);
      ctx.restore();
    } else {
      const label = getBaseName(paths[0] ?? '').slice(0, 1).toUpperCase() || 'F';
      ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
      ctx.beginPath();
      ctx.roundRect(12, 12, 72, 72, 14);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 48, 50);
    }

    if (paths.length > 1) {
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.roundRect(58, 62, 30, 24, 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(paths.length), 73, 74);
    }

    return canvas.toDataURL('image/png');
  } catch {
    return DRAG_IMAGE;
  }
}

// 파일 크기 포맷
export function formatSize(bytes: number, isDir: boolean): string {
  if (isDir) return '폴더';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// 파일 호버 툴팁 포맷
export function formatTooltip(entry: { name: string; path: string; is_dir: boolean; size: number; modified: number; file_type: string }, imageDims?: [number, number] | null): string {
  const parts: string[] = [entry.name];
  if (!entry.is_dir) parts.push(`크기: ${formatSize(entry.size, false)}`);
  if (entry.modified) parts.push(`수정일: ${new Date(entry.modified).toLocaleString('ko-KR')}`);
  if (imageDims) parts.push(`해상도: ${imageDims[0]} × ${imageDims[1]}`);
  const labels: Record<string, string> = {
    directory: '폴더', image: '이미지', video: '비디오',
    document: '문서', code: '코드', archive: '압축', other: '기타',
  };
  parts.push(`유형: ${labels[entry.file_type] ?? '기타'}`);
  return parts.join('\n');
}
