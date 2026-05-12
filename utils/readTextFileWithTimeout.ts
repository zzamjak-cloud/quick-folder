import { invoke } from '@tauri-apps/api/core';

/** 구글 드라이브 등 동기화 지연 시 무한 대기 방지 */
export const DEFAULT_READ_TEXT_TIMEOUT_MS = 4000;

/**
 * read_text_file을 타임아웃과 함께 호출합니다.
 * 타임아웃 시 메인 스레드가 아닌 IPC 대기만 중단됩니다.
 */
export async function readTextFileWithTimeout(
  path: string,
  maxBytes: number,
  timeoutMs: number = DEFAULT_READ_TEXT_TIMEOUT_MS,
): Promise<string> {
  return await Promise.race([
    invoke<string>('read_text_file', { path, maxBytes }),
    new Promise<string>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              'TIMEOUT: 파일을 불러오지 못했습니다. 클라우드 동기화가 완료되지 않은 파일일 수 있습니다.',
            ),
          ),
        timeoutMs,
      ),
    ),
  ]);
}
