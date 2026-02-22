// FileExplorer 컴포넌트에서 공유하는 타입들

// ThemeVars는 루트 types.ts에서 정의, 여기서 re-export
export type { ThemeVars } from '../../types';

// 탭 인터페이스
export interface Tab {
  id: string;
  path: string;
  history: string[];
  historyIndex: number;
  title: string;
}
