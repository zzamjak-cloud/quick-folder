import { invoke } from '@tauri-apps/api/core';

/** base64 이미지 데이터를 HTMLImageElement로 로딩 */
export function loadImageFromBase64(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = base64;
  });
}

/** 파일 경로에서 base64 이미지 데이터 가져오기 */
export async function loadImageFromPath(path: string): Promise<string> {
  const base64: string = await invoke('read_image_base64', { path });
  return base64;
}

/** 저장 경로 생성: {원본경로}/{파일명}_Desc.{확장자} */
export function getSavePath(originalPath: string): string {
  const sep = originalPath.includes('\\') ? '\\' : '/';
  const parts = originalPath.split(sep);
  const fileName = parts.pop()!;
  const dotIdx = fileName.lastIndexOf('.');
  const name = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName;
  const ext = dotIdx > 0 ? fileName.slice(dotIdx) : '.png';
  parts.push(`${name}_Desc${ext}`);
  return parts.join(sep);
}
