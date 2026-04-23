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

// Google Drive 경로 전용 감지
export function isGoogleDrivePath(path: string): boolean {
  const lower = path.toLowerCase();
  // macOS Google Drive Desktop 마운트 경로 (새버전: /Library/CloudStorage/GoogleDrive-...)
  if (lower.includes('/cloudstorage/googledrive')) return true;
  // 구버전 Google Drive 경로
  if (lower.includes('/google drive/')) return true;
  // Windows Google Drive 마운트 (드라이브 레터 기반이므로 경로명으로는 감지 어려움)
  // 사용자가 Google Drive를 G:\My Drive 등으로 마운트할 수 있으나 경로명 감지 불가
  return false;
}

// 클라우드 스토리지 경로 감지 (Google Drive, Dropbox, OneDrive, iCloud)
export function isCloudPath(path: string): boolean {
  const lower = path.toLowerCase();
  // macOS 클라우드 스토리지 마운트 경로
  if (lower.includes('/library/cloudstorage/')) return true;
  // macOS iCloud
  if (lower.includes('/library/mobile documents/')) return true;
  // Google Drive 공유 드라이브 (구버전)
  if (lower.includes('/google drive/')) return true;
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
