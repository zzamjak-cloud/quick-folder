// FileExplorer 컴포넌트에서 공유하는 타입들

export interface ThemeVars {
  bg: string;
  surface: string;
  surface2: string;
  surfaceHover: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentHover: string;
  accent20: string;
  accent50: string;
}

// 탭 인터페이스
export interface Tab {
  id: string;
  path: string;
  history: string[];
  historyIndex: number;
  title: string;
}
