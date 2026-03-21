import React, { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import TurndownService from 'turndown';
import { marked } from 'marked';
import { ThemeVars } from '../../types';
import { getFileName } from '../../utils/pathUtils';

interface MarkdownEditorProps {
  path: string;
  themeVars: ThemeVars;
  onClose: () => void;
}

type SaveStatus = 'saved' | 'saving' | 'unsaved';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ path, themeVars, onClose }) => {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [loaded, setLoaded] = useState(false);
  const fileName = getFileName(path);

  // --- TipTap 에디터 초기화 ---
  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: '마크다운을 작성하세요…',
      }),
    ],
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
      },
    },
    onUpdate: () => {
      scheduleSaveRef.current();
    },
  });

  // --- 저장 함수 ---
  const saveRef = useRef<() => Promise<void>>(async () => {});
  saveRef.current = async () => {
    if (!editor) return;
    setSaveStatus('saving');
    const html = editor.getHTML();
    const md = turndown.turndown(html);
    try {
      await invoke('write_text_file', { path, content: md });
      setSaveStatus('saved');
    } catch (e) {
      console.error('저장 실패:', e);
      setSaveStatus('unsaved');
    }
  };

  // --- 디바운스 자동 저장 ---
  const scheduleSaveRef = useRef<() => void>(() => {});
  scheduleSaveRef.current = () => {
    if (!loaded) return;
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveRef.current?.();
      saveTimerRef.current = null;
    }, 1500);
  };

  // --- 파일 로드 ---
  useEffect(() => {
    if (!editor) return;
    (async () => {
      try {
        const content = await invoke<string>('read_text_file', { path, maxBytes: 1048576 });
        const html = await marked(content);
        editor.commands.setContent(html || '<p></p>');
      } catch {
        editor.commands.setContent('<p></p>');
      }
      setLoaded(true);
    })();
  }, [editor, path]);

  // --- 편집기 열려있을 때 글로벌 단축키 차단 + Ctrl+S 저장 ---
  useEffect(() => {
    const handleCapture = (e: KeyboardEvent) => {
      // 편집기 모달 내부의 이벤트만 처리
      const modal = document.querySelector('[data-markdown-editor]');
      if (!modal) return;

      // Ctrl+S: 즉시 저장
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        saveRef.current?.();
        return;
      }

      // 그 외 모든 키: 글로벌 단축키 핸들러로 전파 차단
      // (TipTap은 자체적으로 이벤트를 처리하므로 에디터 동작에는 영향 없음)
      e.stopImmediatePropagation();
    };
    // 캡처 단계에서 등록하여 App.tsx의 window 리스너보다 먼저 실행
    window.addEventListener('keydown', handleCapture, true);
    return () => window.removeEventListener('keydown', handleCapture, true);
  }, []);

  // --- 닫기 시 미저장 내용 flush ---
  const handleClose = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      saveRef.current?.().then(onClose);
    } else {
      onClose();
    }
  }, [onClose]);

  // --- 서식 버튼 정의 ---
  const toolbarButtons = [
    {
      label: 'B', title: '굵게 (Ctrl+B)',
      style: { fontWeight: 'bold' } as React.CSSProperties,
      action: () => editor?.chain().focus().toggleBold().run(),
      isActive: () => editor?.isActive('bold'),
    },
    {
      label: 'I', title: '기울임 (Ctrl+I)',
      style: { fontStyle: 'italic' } as React.CSSProperties,
      action: () => editor?.chain().focus().toggleItalic().run(),
      isActive: () => editor?.isActive('italic'),
    },
    { type: 'separator' as const },
    {
      label: 'H1', title: '제목 1',
      action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: () => editor?.isActive('heading', { level: 1 }),
    },
    {
      label: 'H2', title: '제목 2',
      action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: () => editor?.isActive('heading', { level: 2 }),
    },
    {
      label: 'H3', title: '제목 3',
      action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: () => editor?.isActive('heading', { level: 3 }),
    },
    { type: 'separator' as const },
    {
      label: '•', title: '순서 없는 목록',
      action: () => editor?.chain().focus().toggleBulletList().run(),
      isActive: () => editor?.isActive('bulletList'),
    },
    {
      label: '1.', title: '순서 있는 목록',
      action: () => editor?.chain().focus().toggleOrderedList().run(),
      isActive: () => editor?.isActive('orderedList'),
    },
    {
      label: '☑', title: '체크리스트',
      action: () => editor?.chain().focus().toggleTaskList().run(),
      isActive: () => editor?.isActive('taskList'),
    },
    { type: 'separator' as const },
    {
      label: '</>', title: '코드 블록',
      action: () => editor?.chain().focus().toggleCodeBlock().run(),
      isActive: () => editor?.isActive('codeBlock'),
    },
    {
      label: '──', title: '구분선',
      action: () => editor?.chain().focus().setHorizontalRule().run(),
    },
    {
      label: '""', title: '인용',
      action: () => editor?.chain().focus().toggleBlockquote().run(),
      isActive: () => editor?.isActive('blockquote'),
    },
  ];

  const statusText = saveStatus === 'saved' ? '저장됨' : saveStatus === 'saving' ? '저장 중...' : '미저장';
  const statusColor = saveStatus === 'saved' ? '#6b9' : saveStatus === 'saving' ? '#db8' : '#f87171';

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      data-markdown-editor="true"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
    >
      <div
        className="flex flex-col rounded-lg shadow-2xl overflow-hidden"
        style={{
          width: '60vw',
          height: '90vh',
          backgroundColor: themeVars?.surface ?? '#1e1e2e',
          border: `1px solid ${themeVars?.border ?? '#334155'}`,
        }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-4 py-2 shrink-0"
          style={{
            borderBottom: `1px solid ${themeVars?.border ?? '#334155'}`,
            backgroundColor: themeVars?.surface2 ?? '#252540',
          }}
        >
          <span style={{ color: themeVars?.muted ?? '#aaa', fontSize: 13 }}>
            📄 {fileName}
          </span>
          <div className="flex items-center gap-3">
            <span style={{ color: statusColor, fontSize: 12 }}>
              {saveStatus === 'saved' ? '✓' : saveStatus === 'saving' ? '⟳' : '●'} {statusText}
            </span>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-white transition-colors"
              style={{ fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
              title="닫기"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 서식 툴바 */}
        <div
          className="flex items-center gap-1 px-4 py-1.5 shrink-0 flex-wrap"
          style={{
            borderBottom: `1px solid ${themeVars?.border ?? '#334155'}`,
            backgroundColor: themeVars?.surface2 ?? '#1e1e36',
          }}
        >
          {toolbarButtons.map((btn, i) =>
            'type' in btn && btn.type === 'separator' ? (
              <div key={i} style={{ width: 1, height: 20, backgroundColor: themeVars?.border ?? '#444', margin: '0 4px' }} />
            ) : (
              <button
                key={i}
                onMouseDown={(e) => { e.preventDefault(); (btn as any).action(); }}
                title={(btn as any).title}
                className="px-2 py-0.5 rounded text-xs hover:brightness-125 transition-all"
                style={{
                  backgroundColor: (btn as any).isActive?.()
                    ? (themeVars?.accent ?? '#3b82f6')
                    : (themeVars?.surface ?? '#333'),
                  color: themeVars?.text ?? '#ccc',
                  border: `1px solid ${themeVars?.border ?? '#444'}`,
                  cursor: 'pointer',
                  ...((btn as any).style || {}),
                }}
              >
                {(btn as any).label}
              </button>
            )
          )}
        </div>

        {/* TipTap 편집 영역 */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ minHeight: 0 }}
        >
          <EditorContent
            editor={editor}
            style={{
              padding: '20px 24px',
              color: themeVars?.text ?? '#ddd',
              fontSize: 14,
              lineHeight: 1.8,
              minHeight: '100%',
            }}
          />
        </div>
      </div>

      {/* TipTap 기본 스타일 */}
      <style>{`
        .tiptap-editor {
          outline: none;
          min-height: 100%;
        }
        .tiptap-editor h1 { font-size: 2em; font-weight: bold; margin: 0.67em 0; }
        .tiptap-editor h2 { font-size: 1.5em; font-weight: bold; margin: 0.5em 0; }
        .tiptap-editor h3 { font-size: 1.17em; font-weight: bold; margin: 0.5em 0; }
        .tiptap-editor p { margin: 0.5em 0; }
        .tiptap-editor ul { padding-left: 1.5em; margin: 0.5em 0; list-style-type: disc; }
        .tiptap-editor ol { padding-left: 1.5em; margin: 0.5em 0; list-style-type: decimal; }
        .tiptap-editor li { margin: 0.25em 0; }
        .tiptap-editor blockquote {
          border-left: 3px solid ${themeVars?.text ?? '#e2e8f0'};
          padding-left: 1em;
          margin: 0.5em 0;
          color: ${themeVars?.text ?? '#e2e8f0'};
        }
        .tiptap-editor pre {
          background: ${themeVars?.surface2 ?? '#252540'};
          border-radius: 6px;
          padding: 12px 16px;
          margin: 0.5em 0;
          overflow-x: auto;
        }
        .tiptap-editor code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.9em;
        }
        .tiptap-editor hr {
          border: none;
          border-top: 2px solid ${themeVars?.text ?? '#e2e8f0'};
          margin: 1em 0;
        }
        .tiptap-editor strong { font-weight: 800; }
        .tiptap-editor ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0;
        }
        .tiptap-editor ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          gap: 0.5em;
        }
        .tiptap-editor ul[data-type="taskList"] li label {
          flex-shrink: 0;
          margin-top: 0.25em;
        }
        .tiptap-editor ul[data-type="taskList"] li label input[type="checkbox"] {
          cursor: pointer;
          width: 14px;
          height: 14px;
        }
        .tiptap-editor ul[data-type="taskList"] li > div {
          flex: 1;
        }
        .tiptap-editor em { font-style: italic; }
        .tiptap-editor .is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: ${themeVars?.muted ?? '#666'};
          pointer-events: none;
          height: 0;
        }
      `}</style>
    </div>
  );
};

export default React.memo(MarkdownEditor);
