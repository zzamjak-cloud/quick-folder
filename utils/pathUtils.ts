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
