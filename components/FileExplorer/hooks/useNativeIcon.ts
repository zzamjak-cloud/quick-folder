import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry } from '../../../types';

// 확장자별 네이티브 아이콘 캐시 (모듈 레벨, 모든 인스턴스 공유)
const nativeIconCache = new Map<string, string | null>();

function getCacheKey(isDir: boolean, name: string, size: number): string {
  const ext = isDir
    ? '__folder__'
    : (name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '__none__');
  return `${ext}_${size}`;
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
    return nativeIconCache.get(getCacheKey(entry.is_dir, entry.name, size)) ?? null;
  });

  useEffect(() => {
    if (!isVisible || skip) return;
    const cacheKey = getCacheKey(entry.is_dir, entry.name, size);

    if (nativeIconCache.has(cacheKey)) {
      const cached = nativeIconCache.get(cacheKey)!;
      if (cached) setNativeIcon(cached);
      return;
    }

    invoke<string | null>('get_file_icon', { path: entry.path, size })
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
  }, [isVisible, entry.file_type, entry.path, entry.name, entry.is_dir, size, skip]);

  return nativeIcon;
}

/**
 * OS 네이티브 폴더 아이콘 훅 (즐겨찾기 사이드바용)
 */
export function useFolderIcon(path: string, size: number): string | null {
  const [icon, setIcon] = useState<string | null>(() => {
    return nativeIconCache.get(`__folder___${size}`) ?? null;
  });

  useEffect(() => {
    const cacheKey = `__folder___${size}`;
    if (nativeIconCache.has(cacheKey)) {
      const cached = nativeIconCache.get(cacheKey)!;
      if (cached) setIcon(cached);
      return;
    }

    invoke<string | null>('get_file_icon', { path, size })
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
  }, [path, size]);

  return icon;
}
