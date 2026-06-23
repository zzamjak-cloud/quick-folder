import { convertFileSrc } from '@tauri-apps/api/core';
import { appCacheDir } from '@tauri-apps/api/path';
import { isCloudPath } from '../../../utils/pathUtils';
import { isTauri } from '../../../utils/isTauri';

/**
 * 전역 썸네일 캐시 (모듈 레벨, 모든 FileCard 인스턴스 공유)
 *
 * 목적: 폴더 재방문/뒤로가기 시 IPC 호출 없이 즉시 썸네일 표시.
 * 값은 asset 프로토콜 URL(convertFileSrc 결과) 또는 빈 문자열('' = 썸네일 없음).
 * 키는 세대+경로+크기+수정시각 → 파일/표시 정책이 바뀌면 자동으로 캐시 미스가 되어 재생성.
 *
 * 단순 LRU: Map의 삽입 순서를 이용해 접근 시 재삽입, 상한 초과 시 가장 오래된 항목 제거.
 */

const MAX_ENTRIES = 4000;
const THUMBNAIL_MEMORY_CACHE_VERSION = 'v4';

// 생성 비용이 목표 크기와 무관한 항목(PSD composite, 클라우드 이미지=전체 다운로드+디코드)은
// 표시 크기와 무관하게 항상 이 크기로 1번만 생성·캐시하고 화면에는 CSS로 축소 표시한다.
// → 줌/크기변경 시 재생성·재다운로드를 없앤다. 그리드 최대값(320)과 일치해야 함.
// (로컬 이미지/비디오는 생성이 싸고 작은 표시엔 작은 썸네일이 유리해 제외 — 표시 크기 그대로)
export const FIXED_GRID_THUMB_SIZE = 320;
const cache = new Map<string, string>();
let appCacheDirPromise: Promise<string | null> | null = null;

// 세션 간 영속화: 캐시(키→asset URL)를 localStorage에 저장해 앱 재시작 시 IPC 없이 즉시 표시.
// 디스크 캐시 PNG는 이미 영속(app_cache_dir)이라 URL만 보존하면 됨. 프루닝 등으로 파일이 사라진
// 항목은 <img> onError → deleteThumb로 자가 치유된다. 버전 접미사로 포맷 변경 시 자동 무효화.
const PERSIST_KEY = `qf.thumbcache.${THUMBNAIL_MEMORY_CACHE_VERSION}`;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function hydratePersistedCache(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    const raw = ls.getItem(PERSIST_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw) as [string, string][];
    // 저장 순서(오래된→최근)대로 삽입해 LRU 순서 보존
    for (const [k, v] of arr) {
      if (typeof k === 'string' && typeof v === 'string') cache.set(k, v);
    }
  } catch {
    // 손상된 데이터 무시
  }
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const ls = safeLocalStorage();
    if (!ls) return;
    try {
      ls.setItem(PERSIST_KEY, JSON.stringify(Array.from(cache.entries())));
    } catch {
      // quota 초과 등 → 한 번 비우고 재시도(실패 시 포기)
      try {
        ls.removeItem(PERSIST_KEY);
        ls.setItem(PERSIST_KEY, JSON.stringify(Array.from(cache.entries())));
      } catch {
        /* 포기 — 다음 변경 때 다시 시도 */
      }
    }
  }, 2000);
}

hydratePersistedCache();

export function thumbKey(path: string, size: number, modified: number): string {
  return `${THUMBNAIL_MEMORY_CACHE_VERSION}|${path}|${size}|${modified}`;
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
  schedulePersist();
}

export function deleteThumb(key: string): void {
  if (cache.delete(key)) schedulePersist();
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
  // Google Drive 등 cloud path는 Rust에서 file ID 기반 drive_thumbnails 경로를 결정한다.
  // 프론트가 path 기반 img/video_thumbnails URL을 먼저 꽂으면 새로고침 직후 404가 난다.
  if (isCloudPath(path)) return null;
  const root = await getAppCacheDir();
  if (!root) return null;

  const isPsd = /\.(psd|psb)$/i.test(path);
  const cacheDir = isPsd ? 'psd_thumbnails' : fileType === 'image' ? 'img_thumbnails' : 'video_thumbnails';
  const stableModified = Math.trunc(modified || 0);
  const cacheKey = stableCacheKey([
    'thumbnail-v4',
    path,
    String(stableModified),
    String(Math.trunc(fileSize || 0)),
    String(thumbnailSize),
  ]);
  return convertFileSrc(joinCachePath(root, cacheDir, `${cacheKey}.png`));
}
