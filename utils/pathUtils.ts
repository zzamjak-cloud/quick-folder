/** 경로에서 파일명 추출 (확장자 포함) */
export function getFileName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

/** 경로의 구분자 감지 ('/' 또는 '\\') */
export function getPathSeparator(path: string): string {
  return path.includes('/') ? '/' : '\\';
}

/** 파일명에서 확장자 제외한 베이스명 추출 */
export function getBaseName(path: string): string {
  const name = getFileName(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.substring(0, dot) : name;
}

/** 파일명에서 확장자 추출 (점 포함, 예: '.png') */
export function getExtension(path: string): string {
  const name = getFileName(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.substring(dot) : '';
}

/** 경로에서 부모 디렉토리 추출 */
export function getParentDir(path: string): string {
  const sep = getPathSeparator(path);
  const idx = path.lastIndexOf(sep);
  return idx > 0 ? path.substring(0, idx) : path;
}

/** OS·GUI 간 경로 문자열 비교용 (슬래시 통일, 끝 슬래시 제거) */
export function normalizeFsPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

const BROWSABLE_ARCHIVE_SUFFIXES = [
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.tgz',
  '.tar.gz',
  '.tbz2',
  '.tar.bz2',
  '.txz',
  '.tar.xz',
] as const;

export interface ArchiveVirtualInfo {
  archivePath: string;
  innerPath: string;
  separator: string;
}

export function isBrowsableArchiveFilePath(path: string): boolean {
  const lower = path.toLowerCase();
  return BROWSABLE_ARCHIVE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

export function buildArchiveBrowsePath(path: string): string {
  const sep = getPathSeparator(path);
  return path.endsWith(sep) ? path : `${path}${sep}`;
}

export function splitArchiveVirtualPath(path: string): ArchiveVirtualInfo | null {
  for (let index = 0; index < path.length; index += 1) {
    const ch = path[index];
    if (ch !== '/' && ch !== '\\') continue;
    const archivePath = path.slice(0, index);
    if (!isBrowsableArchiveFilePath(archivePath)) continue;
    const innerPath = path.slice(index + 1).replace(/^[\\/]+|[\\/]+$/g, '').replace(/\\/g, '/');
    return {
      archivePath,
      innerPath,
      separator: path.includes('\\') ? '\\' : '/',
    };
  }
  return null;
}

export function isArchiveVirtualPath(path: string): boolean {
  return splitArchiveVirtualPath(path) !== null;
}

export function isArchiveBrowseRoot(path: string): boolean {
  const info = splitArchiveVirtualPath(path);
  return !!info && info.innerPath.length === 0;
}

export function shouldOpenArchiveInCurrentPane(currentPath: string, archivePath: string): boolean {
  return isArchiveVirtualPath(currentPath) && isArchiveVirtualPath(archivePath);
}

export function getArchiveVirtualParent(path: string): string | null {
  const info = splitArchiveVirtualPath(path);
  if (!info) return null;
  if (!info.innerPath) {
    return getParentDir(info.archivePath);
  }

  const parts = info.innerPath.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return buildArchiveBrowsePath(info.archivePath);
  }

  return `${buildArchiveBrowsePath(info.archivePath)}${parts.slice(0, -1).join(info.separator)}`;
}

const GOOGLE_DRIVE_VIRTUAL_ROOTS = [
  'my drive',
  '내 드라이브',
  'shared drives',
  '공유 드라이브',
  'other computers',
  'computers',
] as const;

function normalizePathLower(path: string): string {
  return path.toLowerCase().replace(/\\/g, '/');
}

/** Windows 가상 드라이브(G:\My Drive 등) 최상위 폴더명 */
function getVirtualDriveRoot(normalizedLower: string): string | null {
  const match = normalizedLower.match(/^[a-z]:\/([^/]+)/);
  return match?.[1] ?? null;
}

function isGoogleDriveVirtualMount(normalizedLower: string): boolean {
  const root = getVirtualDriveRoot(normalizedLower);
  return root != null && (GOOGLE_DRIVE_VIRTUAL_ROOTS as readonly string[]).includes(root);
}

/** Windows 사용자 폴더 내 Google Drive - email@... 미러 경로 */
function isGoogleDriveProfilePath(path: string): boolean {
  return /(?:^|[\\/])google drive(?:\s*-\s*[^\\/]+)?(?:[\\/]|$)/i.test(path);
}

// Google Drive 경로 전용 감지
export function isGoogleDrivePath(path: string): boolean {
  const normalized = normalizePathLower(path);
  // macOS Google Drive Desktop 마운트 경로 (새버전: /Library/CloudStorage/GoogleDrive-...)
  if (normalized.includes('/cloudstorage/googledrive')) return true;
  // macOS/Windows 구버전 Google Drive 경로
  if (normalized.includes('/google drive/')) return true;
  // Windows: C:\Users\...\Google Drive - email@...\My Drive\...
  if (isGoogleDriveProfilePath(path)) return true;
  // Windows: G:\My Drive\..., G:\Shared drives\... (가상 드라이브 스트리밍)
  if (isGoogleDriveVirtualMount(normalized)) return true;
  return false;
}

// 클라우드 스토리지 경로 감지 (Google Drive, Dropbox, OneDrive, iCloud)
export function isCloudPath(path: string): boolean {
  if (isGoogleDrivePath(path)) return true;
  const lower = path.toLowerCase();
  // macOS 클라우드 스토리지 마운트 경로
  if (lower.includes('/library/cloudstorage/')) return true;
  // macOS iCloud
  if (lower.includes('/library/mobile documents/')) return true;
  // Windows OneDrive
  if (/[\\/]onedrive[\\/]/i.test(path)) return true;
  // Windows Dropbox
  if (/[\\/]dropbox[\\/]/i.test(path)) return true;
  return false;
}

/**
 * 클라우드 마운트 루트 식별자를 반환.
 * 같은 값이면 "같은 클라우드 계정/볼륨" — 그 안에서의 이동은 동일 볼륨 이동이므로 복사가 아닌 MOVE로 처리해야 한다.
 * 로컬 경로면 'local'을 반환.
 *
 * 예) /Users/a/Library/CloudStorage/GoogleDrive-foo@gmail.com/내 드라이브/x.png
 *     → 'cloud:/users/a/library/cloudstorage/googledrive-foo@gmail.com'
 */
export function getCloudRoot(path: string): string {
  const lower = path.toLowerCase().replace(/\\/g, '/');

  // macOS: /Users/<user>/Library/CloudStorage/<Provider-identifier>/...
  const cs = lower.match(/^(.*\/library\/cloudstorage\/[^/]+)/);
  if (cs) return `cloud:${cs[1]}`;

  // macOS iCloud: /Users/<user>/Library/Mobile Documents/...
  const icloud = lower.match(/^(.*\/library\/mobile documents)/);
  if (icloud) return `cloud:${icloud[1]}`;

  // 구버전 Google Drive: .../Google Drive/...
  const gd = lower.match(/^(.*\/google drive)(?:\/|$)/);
  if (gd) return `cloud:${gd[1]}`;

  // Windows: ...\Google Drive - email@...\...
  const winMirror = path.match(/^(.*?[\\/]Google Drive(?:[^\\/]*)?)(?:[\\/]|$)/i);
  if (winMirror) return `cloud:${winMirror[1].toLowerCase().replace(/\\/g, '/')}`;

  // Windows: G:\My Drive\... 가상 드라이브
  if (isGoogleDriveVirtualMount(lower)) {
    const root = getVirtualDriveRoot(lower)!;
    return `cloud:${lower.slice(0, 2)}/${root}`;
  }

  // Windows OneDrive: ...\OneDrive[ - xxx]\...
  const od = path.match(/^(.*?[\\/]OneDrive(?:[^\\/]*))(?:[\\/]|$)/i);
  if (od) return `cloud:${od[1].toLowerCase().replace(/\\/g, '/')}`;

  // Windows Dropbox
  const db = path.match(/^(.*?[\\/]Dropbox(?:[^\\/]*))(?:[\\/]|$)/i);
  if (db) return `cloud:${db[1].toLowerCase().replace(/\\/g, '/')}`;

  return 'local';
}

/**
 * 파일 이동/복사 시 소스와 대상이 "같은 볼륨"에 속하는지 판정.
 * 같은 볼륨이면 MOVE(잘라내기), 아니면 COPY(복제)가 기본 동작.
 * 로컬↔로컬은 같은 볼륨으로 간주한다(일반적인 파일시스템 이동 케이스).
 */
export function sameVolume(a: string, b: string): boolean {
  return getCloudRoot(a) === getCloudRoot(b);
}
