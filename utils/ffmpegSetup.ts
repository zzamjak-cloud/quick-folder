import { ask } from '@tauri-apps/plugin-dialog';
import { invokeTauriCommand as invoke } from './tauriInvoke';
import type { TranslationKey } from './i18n';

// FFmpeg 준비 보장 헬퍼.
// 라이선스 정책상 FFmpeg(GPL)은 앱에 번들하지 않으므로, 미설치 시
// 사용자 동의를 받은 뒤 원 배포처(gyan.dev / evermeet.cx)에서 다운로드한다.
// 반환값: true = 사용 가능, false = 사용자가 설치를 거부함.
// 다운로드 실패 시에는 예외를 던진다 (호출부에서 에러 표시).
export async function ensureFfmpeg(
  t: (key: TranslationKey) => string,
  onStatus?: (text: string) => void,
): Promise<boolean> {
  const installed = await invoke<boolean>('check_ffmpeg');
  if (installed) return true;

  const agreed = await ask(t('ffmpeg.consent.message'), {
    title: t('ffmpeg.consent.title'),
    kind: 'info',
  });
  if (!agreed) return false;

  onStatus?.(t('ffmpeg.installing'));
  await invoke('download_ffmpeg');
  return true;
}
