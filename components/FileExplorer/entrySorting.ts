import type { FileEntry } from '../../types';
import { naturalCompare } from '../../utils/naturalCompare';

export type EntrySortBy = 'name' | 'size' | 'modified' | 'type';
export type EntrySortDir = 'asc' | 'desc';

export function sortEntries(list: FileEntry[], by: EntrySortBy | string, dir: EntrySortDir | string): FileEntry[] {
  return [...list].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    let cmp = 0;
    switch (by) {
      case 'name':
        cmp = naturalCompare(a.name, b.name);
        break;
      case 'size':
        cmp = a.size - b.size;
        break;
      case 'modified':
        cmp = a.modified - b.modified;
        break;
      case 'type': {
        // 확장자별 1차 그룹화 (psd, png, jpg 등 별도 그룹)
        const extA = a.name.includes('.') ? a.name.slice(a.name.lastIndexOf('.') + 1).toLowerCase() : '';
        const extB = b.name.includes('.') ? b.name.slice(b.name.lastIndexOf('.') + 1).toLowerCase() : '';
        cmp = extA.localeCompare(extB);
        if (cmp === 0) cmp = naturalCompare(a.name, b.name);
        break;
      }
      default:
        cmp = naturalCompare(a.name, b.name);
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}
