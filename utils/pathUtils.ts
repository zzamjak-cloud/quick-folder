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
