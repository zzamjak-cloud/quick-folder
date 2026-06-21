import { ThemeVars } from '../types';
import { isDarkHexColor } from '../../../hooks/useThemeManagement';

export interface CodePreviewColors {
  isLightTheme: boolean;
  codeSurface: string;
  codeText: string;
  codeMuted: string;
  codeBorder: string;
  codeCommentColor: string;
  codeKeywordColor: string;
  codeStringColor: string;
  codeNumberColor: string;
  codeTypeColor: string;
  codeFunctionColor: string;
  codeMetaColor: string;
  codeSelectorColor: string;
  codeAdditionColor: string;
  codeDeletionColor: string;
}

export function getCodePreviewColors(themeVars: ThemeVars): CodePreviewColors {
  const isLightTheme = !isDarkHexColor(themeVars.bg ?? themeVars.surface ?? '#0f172a');
  return {
    isLightTheme,
    codeSurface: isLightTheme ? '#f8fafc' : '#1e1e1e',
    codeText: isLightTheme ? '#1f2937' : '#d4d4d4',
    codeMuted: isLightTheme ? '#64748b' : themeVars.muted,
    codeBorder: isLightTheme ? 'rgba(100, 116, 139, 0.24)' : `${themeVars.border}22`,
    codeCommentColor: isLightTheme ? '#4d7c0f' : '#6a9955',
    codeKeywordColor: isLightTheme ? '#1d4ed8' : '#569cd6',
    codeStringColor: isLightTheme ? '#b45309' : '#ce9178',
    codeNumberColor: isLightTheme ? '#0f766e' : '#b5cea8',
    codeTypeColor: isLightTheme ? '#0f766e' : '#4ec9b0',
    codeFunctionColor: isLightTheme ? '#7c3aed' : '#dcdcaa',
    codeMetaColor: isLightTheme ? '#9333ea' : '#c586c0',
    codeSelectorColor: isLightTheme ? '#be123c' : '#d7ba7d',
    codeAdditionColor: isLightTheme ? '#166534' : '#4ade80',
    codeDeletionColor: isLightTheme ? '#b91c1c' : '#f87171',
  };
}

interface CodePreviewStylesProps {
  colors: CodePreviewColors;
}

export function CodePreviewStyles({ colors }: CodePreviewStylesProps) {
  return (
    <style>{`
      .qf-code-preview .hljs {
        background: transparent;
        color: ${colors.codeText};
      }
      .qf-code-preview .hljs-subst,
      .qf-code-preview .hljs-punctuation,
      .qf-code-preview .hljs-operator {
        color: ${colors.codeText};
      }
      .qf-code-preview .hljs-comment,
      .qf-code-preview .hljs-quote {
        color: ${colors.codeCommentColor};
        font-style: italic;
      }
      .qf-code-preview .hljs-keyword,
      .qf-code-preview .hljs-selector-tag,
      .qf-code-preview .hljs-literal,
      .qf-code-preview .hljs-section,
      .qf-code-preview .hljs-link {
        color: ${colors.codeKeywordColor};
      }
      .qf-code-preview .hljs-string,
      .qf-code-preview .hljs-regexp,
      .qf-code-preview .hljs-bullet,
      .qf-code-preview .hljs-template-variable {
        color: ${colors.codeStringColor};
      }
      .qf-code-preview .hljs-number,
      .qf-code-preview .hljs-symbol,
      .qf-code-preview .hljs-variable,
      .qf-code-preview .hljs-params {
        color: ${colors.codeNumberColor};
      }
      .qf-code-preview .hljs-type,
      .qf-code-preview .hljs-class .hljs-title,
      .qf-code-preview .hljs-built_in,
      .qf-code-preview .hljs-attr {
        color: ${colors.codeTypeColor};
      }
      .qf-code-preview .hljs-title,
      .qf-code-preview .hljs-title.function_,
      .qf-code-preview .hljs-title.class_,
      .qf-code-preview .hljs-function .hljs-title {
        color: ${colors.codeFunctionColor};
      }
      .qf-code-preview .hljs-meta,
      .qf-code-preview .hljs-meta .hljs-keyword {
        color: ${colors.codeMetaColor};
      }
      .qf-code-preview .hljs-selector-id,
      .qf-code-preview .hljs-selector-class,
      .qf-code-preview .hljs-selector-attr,
      .qf-code-preview .hljs-selector-pseudo {
        color: ${colors.codeSelectorColor};
      }
      .qf-code-preview .hljs-addition {
        color: ${colors.codeAdditionColor};
      }
      .qf-code-preview .hljs-deletion {
        color: ${colors.codeDeletionColor};
      }
    `}</style>
  );
}
