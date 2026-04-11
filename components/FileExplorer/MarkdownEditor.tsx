import React, { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Extension } from '@tiptap/core';
import { InputRule } from '@tiptap/core';
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
  blankReplacement: (_content: string, _node: Node) => '\n\n',
});

// 빈 줄 정규화: 연속 3줄 이상 빈 줄을 2줄로 축소
function normalizeBlankLines(md: string): string {
  return md.replace(/\n{3,}/g, '\n\n');
}

// --- 화살표 자동 변환 확장 ---
const ArrowReplace = Extension.create({
  name: 'arrowReplace',
  addInputRules() {
    return [
      // <-> + 스페이스 → ↔
      new InputRule({
        find: /<->\s$/,
        handler: ({ state, range }) => {
          const { tr } = state;
          tr.insertText('↔ ', range.from, range.to);
        },
      }),
      // -> + 스페이스 → → (앞에 <가 없을 때만)
      new InputRule({
        find: /(?<!<)->\s$/,
        handler: ({ state, range }) => {
          const { tr } = state;
          tr.insertText('→ ', range.from, range.to);
        },
      }),
      // <- + 스페이스 → ← (<->는 위에서 이미 처리됨)
      new InputRule({
        find: /<-\s$/,
        handler: ({ state, range }) => {
          const { tr } = state;
          tr.insertText('← ', range.from, range.to);
        },
      }),
    ];
  },
});

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ path, themeVars, onClose }) => {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [loaded, setLoaded] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const fileName = getFileName(path);
  const isMarkdown = /\.md$/i.test(fileName);

  // --- TipTap 에디터 초기화 ---
  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: '마크다운을 작성하세요…',
      }),
      ArrowReplace,
      // Tab 들여쓰기 확장
      Extension.create({
        name: 'listIndent',
        addKeyboardShortcuts() {
          return {
            'Tab': () => {
              if (this.editor.isActive('listItem')) {
                return this.editor.chain().sinkListItem('listItem').run();
              }
              if (this.editor.isActive('taskItem')) {
                return this.editor.chain().sinkListItem('taskItem').run();
              }
              return false;
            },
            'Shift-Tab': () => {
              if (this.editor.isActive('listItem')) {
                return this.editor.chain().liftListItem('listItem').run();
              }
              if (this.editor.isActive('taskItem')) {
                return this.editor.chain().liftListItem('taskItem').run();
              }
              return false;
            },
          };
        },
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
    let content: string;
    if (isMarkdown) {
      const html = editor.getHTML();
      content = turndown.turndown(html);
      // 제어 문자 제거 (탭, 개행 제외) — 터미널 먹통 방지
      content = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      // zero-width 유니코드 제거
      content = content.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
      // 과도한 빈 줄 정규화
      content = normalizeBlankLines(content);
    } else {
      // plain text: 에디터 텍스트를 그대로 저장
      content = editor.getText();
    }
    try {
      await invoke('write_text_file', { path, content });
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
        const raw = await invoke<string>('read_text_file', { path, maxBytes: 1048576 });
        if (isMarkdown) {
          // 사용자가 넣은 연속 빈 줄을 보존하기 위해 마커로 변환
          const preserved = raw.replace(/\n{3,}/g, (match) => {
            // 빈 줄 개수만큼 마커 삽입 (2줄은 정상 단락 구분이므로 3줄 이상만)
            const extraBlanks = match.length - 2; // 표준 단락 구분 2줄 제외
            return '\n\n' + '&blank;\n\n'.repeat(extraBlanks);
          });
          let html = await marked(preserved);
          // 마커를 빈 단락으로 변환
          html = html.replace(/<p>&amp;blank;<\/p>/g, '<p><br></p>');
          editor.commands.setContent(html || '<p></p>');
        } else {
          // plain text: 줄바꿈을 <p> 태그로 변환하여 표시
          const paragraphs = raw.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
          editor.commands.setContent(paragraphs || '<p></p>');
        }
      } catch {
        editor.commands.setContent('<p></p>');
      }
      setLoaded(true);
    })();
  }, [editor, path]);

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

  // --- handleClose를 ref로 감싸서 useEffect 안에서 최신 값 참조 ---
  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;

  // --- 편집기 열려있을 때 글로벌 단축키 차단 + ESC 닫기 + Ctrl+S 저장 ---
  useEffect(() => {
    const handleCapture = (e: KeyboardEvent) => {
      // 편집기 모달 내부의 이벤트만 처리
      const modal = document.querySelector('[data-markdown-editor]');
      if (!modal) return;

      // ESC: 편집기 닫기
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleCloseRef.current();
        return;
      }

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

      // Tab 키: TipTap 리스트 들여쓰기에 필요하므로 전파 허용
      if (e.key === 'Tab') return;

      // 그 외 모든 키: 글로벌 단축키 핸들러로 전파 차단
      // (TipTap은 자체적으로 이벤트를 처리하므로 에디터 동작에는 영향 없음)
      e.stopImmediatePropagation();
    };
    // 캡처 단계에서 등록하여 App.tsx의 window 리스너보다 먼저 실행
    window.addEventListener('keydown', handleCapture, true);
    return () => window.removeEventListener('keydown', handleCapture, true);
  }, []);

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
    { type: 'separator' as const },
    {
      label: '→', title: '오른쪽 화살표 (-> + 스페이스)',
      action: () => editor?.chain().focus().insertContent('→').run(),
    },
    {
      label: '←', title: '왼쪽 화살표 (<- + 스페이스)',
      action: () => editor?.chain().focus().insertContent('←').run(),
    },
    {
      label: '↔', title: '양방향 화살표 (<-> + 스페이스)',
      action: () => editor?.chain().focus().insertContent('↔').run(),
    },
  ];

  const statusText = saveStatus === 'saved' ? '저장됨' : saveStatus === 'saving' ? '저장 중...' : '미저장';
  const statusColor = saveStatus === 'saved' ? '#6b9' : saveStatus === 'saving' ? '#db8' : '#f87171';

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      data-markdown-editor="true"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={handleClose}
    >
      <div
        className="flex flex-col rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
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
              onClick={async () => {
                if (!editor) return;
                let text: string;
                if (isMarkdown) {
                  const html = editor.getHTML();
                  text = turndown.turndown(html);
                  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
                  text = text.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
                  // 과도한 빈 줄 정규화
                  text = normalizeBlankLines(text);
                } else {
                  text = editor.getText();
                }
                try {
                  await navigator.clipboard.writeText(text);
                  setCopyFeedback(true);
                  setTimeout(() => setCopyFeedback(false), 1500);
                } catch (e) {
                  console.error('복사 실패:', e);
                }
              }}
              className="text-gray-400 hover:text-white transition-colors px-2 py-0.5 rounded text-xs"
              style={{
                background: themeVars?.surface ?? '#333',
                border: `1px solid ${themeVars?.border ?? '#444'}`,
                cursor: 'pointer',
              }}
              title={isMarkdown ? '마크다운 원본 복사' : '텍스트 복사'}
            >
              {copyFeedback ? '✓ 복사됨' : '복사'}
            </button>
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

        {/* 이모티콘 툴바 */}
        <div
          className="flex items-center gap-0.5 px-4 py-1 shrink-0 flex-wrap"
          style={{
            borderBottom: `1px solid ${themeVars?.border ?? '#334155'}`,
            backgroundColor: themeVars?.surface2 ?? '#1e1e36',
          }}
        >
          {[
            { emoji: '✅', title: '체크' },
            { emoji: '❌', title: '취소' },
            { emoji: '⭐', title: '별' },
            { emoji: '📌', title: '핀' },
            { emoji: '🔍', title: '검색' },
            { emoji: '📅', title: '달력' },
            { emoji: '📝', title: '노트' },
            { emoji: '💾', title: '저장' },
            { emoji: '📁', title: '폴더' },
            { emoji: '✏️', title: '펜' },
            { emoji: '💡', title: '아이디어' },
            { emoji: '⚠️', title: '주의' },
            { emoji: '🔗', title: '링크' },
            { emoji: '🔒', title: '잠금' },
            { emoji: '🎯', title: '목표' },
            { emoji: '🚀', title: '시작' },
            { emoji: '👍', title: '좋아요' },
            { emoji: '❤️', title: '하트' },
            { emoji: '🔥', title: '인기' },
            { emoji: '⏰', title: '시간' },
          ].map(({ emoji, title }) => (
            <button
              key={emoji}
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().insertContent(emoji).run(); }}
              title={title}
              className="px-1 py-0.5 rounded hover:bg-white/10 transition-all"
              style={{ cursor: 'pointer', fontSize: 14, lineHeight: 1, border: 'none', background: 'none' }}
            >
              {emoji}
            </button>
          ))}
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
