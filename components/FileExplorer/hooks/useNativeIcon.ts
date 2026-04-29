import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileEntry } from '../../../types';

// 확장자별 네이티브 아이콘 캐시 (모듈 레벨, 모든 인스턴스 공유)
// 항상 고정 해상도(ICON_FETCH_SIZE)로 요청하여 확대해도 선명하게 표시
const ICON_FETCH_SIZE = 128;
const nativeIconCache = new Map<string, string>();

function getCacheKey(isDir: boolean, path: string, name: string): string {
  // 폴더는 경로별 캐시 — 한 경로만 실패해도 전역 __folder__ 로 poison 되지 않게 함
  if (isDir) return `folder:${path}`;
  const ext =
    name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '__none__';
  return ext;
}

// 네이티브 아이콘이 부정확하게 표시되는 확장자 → lucide 폴백
const SKIP_NATIVE_EXTS = new Set(['md', 'json', 'sh', 'exe', 'unitypackage']);
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
  const ext = entry.name.lastIndexOf('.') > 0
    ? entry.name.slice(entry.name.lastIndexOf('.') + 1).toLowerCase()
    : '';
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
    invoke<string | null>('get_file_icon', { path: entry.path, size: ICON_FETCH_SIZE })
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
    invoke<string | null>('get_file_icon', { path, size: ICON_FETCH_SIZE })
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
