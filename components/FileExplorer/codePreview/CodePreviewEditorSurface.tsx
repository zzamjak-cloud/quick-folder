import React from 'react';
import type { ThemeVars } from '../types';

interface CodePreviewEditorSurfaceProps {
  themeVars: ThemeVars;
  lineNumWidth: number;
  editedContent: string;
  editedHighlighted: string;
  codeMuted: string;
  codeBorder: string;
  codeText: string;
  isLightTheme: boolean;
  editGutterRef: React.RefObject<HTMLDivElement | null>;
  editPreRef: React.RefObject<HTMLPreElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onEditedChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onEditScroll: (event: React.UIEvent<HTMLTextAreaElement>) => void;
}

export function CodePreviewEditorSurface({
  themeVars,
  lineNumWidth,
  editedContent,
  editedHighlighted,
  codeMuted,
  codeBorder,
  codeText,
  isLightTheme,
  editGutterRef,
  editPreRef,
  textareaRef,
  onEditedChange,
  onEditScroll,
}: CodePreviewEditorSurfaceProps) {
  return (
    <>
      <div
        ref={editGutterRef}
        className="flex-shrink-0 overflow-hidden select-none"
        style={{
          width: lineNumWidth,
          paddingTop: 8,
          paddingBottom: 40,
          paddingRight: 12,
          paddingLeft: 8,
          color: codeMuted,
          opacity: isLightTheme ? 0.8 : 0.5,
          borderRight: `1px solid ${codeBorder}`,
          textAlign: 'right',
          userSelect: 'none',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'pre',
        }}
      >
        {editedContent.split('\n').map((_, i) => (
          <div key={i} style={{ height: 'calc(13px * 1.6)' }}>{i + 1}</div>
        ))}
      </div>
      <div className="relative flex-1" style={{ minWidth: 0 }}>
        <pre
          ref={editPreRef}
          className="absolute inset-0 m-0"
          style={{
            pointerEvents: 'none',
            whiteSpace: 'pre',
            wordBreak: 'normal',
            overflowWrap: 'normal',
            padding: '8px 12px 40px 12px',
            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
            fontSize: 13,
            lineHeight: '1.6',
            margin: 0,
            overflow: 'auto',
            color: codeText,
            tabSize: 2,
          }}
          dangerouslySetInnerHTML={{ __html: editedHighlighted }}
        />
        <textarea
          ref={textareaRef}
          value={editedContent}
          onChange={onEditedChange}
          onScroll={onEditScroll}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className="absolute inset-0 w-full h-full outline-none resize-none"
          style={{
            color: 'transparent',
            caretColor: themeVars.text ?? '#fff',
            background: 'transparent',
            whiteSpace: 'pre',
            wordBreak: 'normal',
            overflowWrap: 'normal',
            padding: '8px 12px 40px 12px',
            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
            fontSize: 13,
            lineHeight: '1.6',
            border: 'none',
            tabSize: 2,
          }}
        />
      </div>
    </>
  );
}
