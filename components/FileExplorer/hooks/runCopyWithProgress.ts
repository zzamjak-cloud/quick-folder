/** @deprecated runTransferWithProgress 사용 권장 */
export { runCopyWithProgress, runTransferWithProgress } from './runTransferWithProgress';
export type { TransferQueueProgress } from '../../../stores/taskQueueStore';

export type CopyProgressInfo = {
  percent: number;
  doneFiles: number;
  totalFiles: number;
  currentName: string;
};
