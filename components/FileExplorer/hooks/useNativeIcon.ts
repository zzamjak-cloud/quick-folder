import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry } from '../../../types';

// 확장자별 네이티브 아이콘 캐시 (모듈 레벨, 모든 인스턴스 공유)
// 항상 고정 해상도(ICON_FETCH_SIZE)로 요청하여 확대해도 선명하게 표시
const ICON_FETCH_SIZE = 128;
const nativeIconCache = new Map<string, string | null>();

function getCacheKey(isDir: boolean, name: string): string {
  const ext = isDir
    ? '__folder__'
    : (name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '__none__');
  return ext;
}

/**
 * OS 네이티브 파일 아이콘 훅 (확장자별 캐시)
 * 이미지/PSD는 썸네일을 사용하므로 건너뜀
 */
export function useNativeIcon(
  entry: FileEntry,
  size: number,
  isVisible: boolean = true,
): string | null {
  const isPsd = entry.name.toLowerCase().endsWith('.psd');
  const skip = entry.file_type === 'image' || isPsd;

  const [nativeIcon, setNativeIcon] = useState<string | null>(() => {
    if (skip) return null;
    return nativeIconCache.get(getCacheKey(entry.is_dir, entry.name)) ?? null;
  });

  useEffect(() => {
    if (!isVisible || skip) return;
    const cacheKey = getCacheKey(entry.is_dir, entry.name);

    if (nativeIconCache.has(cacheKey)) {
      const cached = nativeIconCache.get(cacheKey)!;
      if (cached) setNativeIcon(cached);
      return;
    }

    // 항상 고정 해상도로 요청 → 확대해도 선명
    invoke<string | null>('get_file_icon', { path: entry.path, size: ICON_FETCH_SIZE })
      .then(b64 => {
        if (b64) {
          const dataUrl = `data:image/png;base64,${b64}`;
          nativeIconCache.set(cacheKey, dataUrl);
          setNativeIcon(dataUrl);
        } else {
          nativeIconCache.set(cacheKey, null);
        }
      })
      .catch(() => { nativeIconCache.set(cacheKey, null); });
  }, [isVisible, entry.file_type, entry.path, entry.name, entry.is_dir, skip]);

  return nativeIcon;
}

/**
 * OS 네이티브 폴더 아이콘 훅 (즐겨찾기 사이드바용)
 */
export function useFolderIcon(path: string, _size?: number): string | null {
  const [icon, setIcon] = useState<string | null>(() => {
    return nativeIconCache.get('__folder__') ?? null;
  });

  useEffect(() => {
    const cacheKey = '__folder__';
    if (nativeIconCache.has(cacheKey)) {
      const cached = nativeIconCache.get(cacheKey)!;
      if (cached) setIcon(cached);
      return;
    }

    invoke<string | null>('get_file_icon', { path, size: ICON_FETCH_SIZE })
      .then(b64 => {
        if (b64) {
          const dataUrl = `data:image/png;base64,${b64}`;
          nativeIconCache.set(cacheKey, dataUrl);
          setIcon(dataUrl);
        } else {
          nativeIconCache.set(cacheKey, null);
        }
      })
      .catch(() => { nativeIconCache.set(cacheKey, null); });
  }, [path]);

  return icon;
}
