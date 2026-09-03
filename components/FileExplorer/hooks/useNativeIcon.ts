import { useState, useEffect } from 'react';
import { FileEntry } from '../../../types';
import { tauriCommands } from '../../../utils/tauriCommands';

// 확장자별 네이티브 아이콘 캐시 (모듈 레벨, 모든 인스턴스 공유)
// 항상 고정 해상도(ICON_FETCH_SIZE)로 요청하여 확대해도 선명하게 표시
const ICON_FETCH_SIZE = 128;
const nativeIconCache = new Map<string, string>();

// 파일명에서 확장자 추출 (소문자, 확장자 없으면 빈 문자열)
// Blender 백업본(.blend1 ~ .blend32)은 'blend'로 정규화 — fileUtils.getExt와 동일 규칙
function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  return /^blend\d+$/.test(ext) ? 'blend' : ext;
}

function getCacheKey(isDir: boolean, path: string, name: string): string {
  // 폴더는 경로별 캐시 — 한 경로만 실패해도 전역 __folder__ 로 poison 되지 않게 함
  if (isDir) return `folder:${path}`;
  return extOf(name) || '__none__';
}

// 전용 SVG 아이콘(fileUtils EXT_ICON)이 있는 확장자는 OS 셸 아이콘을 건너뛴다.
// EXT_ICON에 항목을 추가하면 여기에도 반드시 등록해야 셸 아이콘이 덮어쓰지 않는다(회귀 주의).
export const SKIP_NATIVE_EXTS = new Set([
  'exe', 'unitypackage', 'unity', 'blend', 'fbx', 'obj',
  'md', 'markdown', 'mdx', 'txt', 'text', 'json', 'toml',
  'py', 'pyw', 'pyi',
  'js', 'mjs', 'cjs', 'jsx',
  'cs', 'html', 'htm',
  'bat', 'cmd', 'ps1', 'psm1', 'psd1', 'sh',
  'bin', 'db', 'sqlite', 'sqlite3', 'sql',
]);
// 썸네일이 생성되므로 네이티브 아이콘 불필요한 이미지 확장자
const THUMBNAIL_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'ico', 'icns']);

/**
 * OS 네이티브 파일 아이콘 훅 (확장자별 캐시)
 * 이미지(jpg/png 등)는 썸네일을 사용하므로 건너뜀
 * PSD는 썸네일 기능 제거로 네이티브 아이콘 표시 대상에 포함
 */
export function useNativeIcon(
  entry: FileEntry,
  size: number,
  isVisible: boolean = true,
): string | null {
  const ext = extOf(entry.name);
  // PSD 등은 image 타입이지만 시스템 아이콘 사용 (썸네일 미생성)
  const skip = THUMBNAIL_IMAGE_EXTS.has(ext) || (!entry.is_dir && SKIP_NATIVE_EXTS.has(ext));

  const [nativeIcon, setNativeIcon] = useState<string | null>(() => {
    if (skip) return null;
    return nativeIconCache.get(getCacheKey(entry.is_dir, entry.path, entry.name)) ?? null;
  });

  useEffect(() => {
    if (!isVisible || skip) return;
    const cacheKey = getCacheKey(entry.is_dir, entry.path, entry.name);

    if (nativeIconCache.has(cacheKey)) {
      const cached = nativeIconCache.get(cacheKey)!;
      if (cached) setNativeIcon(cached);
      return;
    }

    // 아이콘은 확장자별 캐시가 있어 실질적으로 한 번만 Rust 호출 → 큐 불필요
    // 항상 고정 해상도로 요청 → 확대해도 선명
    let cancelled = false;
    tauriCommands.getFileIcon(entry.path, ICON_FETCH_SIZE, entry.is_dir)
      .then(b64 => {
        if (cancelled) return;
        if (b64) {
          const dataUrl = `data:image/png;base64,${b64}`;
          nativeIconCache.set(cacheKey, dataUrl);
          setNativeIcon(dataUrl);
        }
        // 실패 시 캐시하지 않음 — 다른 폴더/재시도 시 Shell 재호출 가능
      })
      .catch(() => { /* 실패도 캐시 안 함 */ });

    return () => { cancelled = true; };
  }, [isVisible, entry.file_type, entry.path, entry.name, entry.is_dir, skip]);

  return nativeIcon;
}

/**
 * OS 네이티브 폴더 아이콘 훅 (즐겨찾기 사이드바용)
 */
export function useFolderIcon(path: string, _size?: number): string | null {
  const [icon, setIcon] = useState<string | null>(null);

  useEffect(() => {
    const key = `folder:${path}`;
    const cached = nativeIconCache.get(key);
    if (cached) {
      setIcon(cached);
      return;
    }
    setIcon(null);
    let cancelled = false;
    tauriCommands.getFileIcon(path, ICON_FETCH_SIZE, true)
      .then(b64 => {
        if (cancelled) return;
        if (b64) {
          const dataUrl = `data:image/png;base64,${b64}`;
          nativeIconCache.set(key, dataUrl);
          setIcon(dataUrl);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [path]);

  return icon;
}
