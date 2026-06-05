import { convertFileSrc } from '@tauri-apps/api/core';
import { appCacheDir } from '@tauri-apps/api/path';
import { isCloudPath } from '../../../utils/pathUtils';
import { isTauri } from '../../../utils/isTauri';

/**
 * 전역 썸네일 캐시 (모듈 레벨, 모든 FileCard 인스턴스 공유)
 *
 * 목적: 폴더 재방문/뒤로가기 시 IPC 호출 없이 즉시 썸네일 표시.
 * 값은 asset 프로토콜 URL(convertFileSrc 결과) 또는 빈 문자열('' = 썸네일 없음).
 * 키는 경로+크기+수정시각 → 파일이 바뀌면 자동으로 캐시 미스가 되어 재생성.
 *
 * 단순 LRU: Map의 삽입 순서를 이용해 접근 시 재삽입, 상한 초과 시 가장 오래된 항목 제거.
 */

const MAX_ENTRIES = 4000;
const cache = new Map<string, string>();
let appCacheDirPromise: Promise<string | null> | null = null;

export function thumbKey(path: string, size: number, modified: number): string {
  return `${path}|${size}|${modified}`;
}

/** 캐시 조회. undefined=미조회(요청 필요), ''=썸네일 없음 확정, 그 외=asset URL */
export function getThumb(key: string): string | undefined {
  const v = cache.get(key);
  if (v !== undefined) {
    // LRU: 최근 사용으로 갱신
    cache.delete(key);
    cache.set(key, v);
  }
  return v;
}

export function setThumb(key: string, url: string): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, url);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function deleteThumb(key: string): void {
  cache.delete(key);
}

function getAppCacheDir(): Promise<string | null> {
  if (!isTauri()) return Promise.resolve(null);
  if (!appCacheDirPromise) {
    appCacheDirPromise = appCacheDir().catch(() => null);
  }
  return appCacheDirPromise;
}

function stableCacheKey(parts: string[]): string {
  const encoder = new TextEncoder();
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  const writeByte = (byte: number) => {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  };

  for (const part of parts) {
    const bytes = encoder.encode(part);
    let len = BigInt(bytes.length);
    for (let i = 0; i < 8; i++) {
      writeByte(Number(len & 0xffn));
      len >>= 8n;
    }
    for (const byte of bytes) writeByte(byte);
  }

  return hash.toString(16).padStart(16, '0');
}

function joinCachePath(root: string, dir: string, fileName: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[\\/]+$/, '')}${sep}${dir}${sep}${fileName}`;
}

export async function getPersistentThumbUrl(
  path: string,
  fileType: string,
  thumbnailSize: number,
  modified: number,
  fileSize: number,
): Promise<string | null> {
  if (fileType !== 'image' && fileType !== 'video') return null;
  const root = await getAppCacheDir();
  if (!root) return null;

  const cacheDir = fileType === 'image' ? 'img_thumbnails' : 'video_thumbnails';
  const stableModified = isCloudPath(path) ? 0 : Math.trunc(modified || 0);
  const cacheKey = stableCacheKey([
    'thumbnail-v2',
    path,
    String(stableModified),
    String(Math.trunc(fileSize || 0)),
    String(thumbnailSize),
  ]);
  return convertFileSrc(joinCachePath(root, cacheDir, `${cacheKey}.png`));
}
