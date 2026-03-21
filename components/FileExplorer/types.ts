// FileExplorer 컴포넌트에서 공유하는 타입들

// ThemeVars는 루트 types.ts에서 정의, 여기서 re-export
export type { ThemeVars } from '../../types';

// 컨텍스트 메뉴 항목
export interface ContextMenuItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  shortcut?: string;
  submenu?: ContextMenuItem[];  // 중첩 메뉴 지원 (동영상 압축용)
}

// 컨텍스트 메뉴 섹션 (구분선으로 나뉘는 항목 그룹)
export interface ContextMenuSection {
  id: string;
  items: ContextMenuItem[];
}

// 탭 인터페이스
export interface Tab {
  id: string;
  path: string;
  history: string[];
  historyIndex: number;
  title: string;
  pinned?: boolean;
}
