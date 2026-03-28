import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { ChevronLeft, Check } from 'lucide-react';
import { useNotesStore } from '../store/notesStore';
import { useAutoSave } from '../hooks/useAutoSave';
import DrawingCanvas from './DrawingCanvas';
import EditorToolbar from './EditorToolbar';

export default function NoteEditor() {
  const {
    selectedNoteId,
    editorMode,
    getSelectedNote,
    updateNote,
    selectNote,
  } = useNotesStore();

  const note = getSelectedNote();
  const [titleValue, setTitleValue] = useState(note?.title ?? '');
  const [isSaved, setIsSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Sync title when note changes
  useEffect(() => {
    setTitleValue(note?.title ?? '');
  }, [note?.id, note?.title]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Start writing your note…' }),
    ],
    content: note?.content ?? '',
    editorProps: {
      attributes: {
        class: 'tiptap-editor ProseMirror outline-none',
        spellcheck: 'true',
      },
    },
  });

  // When note changes, update editor content
  useEffect(() => {
    if (!editor || !note) return;
    const current = editor.getHTML();
    if (current !== note.content) {
      editor.commands.setContent(note.content || '', false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  // Auto-save content
  const editorContent = editor?.getHTML() ?? '';
  useAutoSave(selectedNoteId, editorContent);

  // Title save with debounce
  const handleTitleChange = (val: string) => {
    setTitleValue(val);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (selectedNoteId) {
        updateNote(selectedNoteId, { title: val });
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 1500);
      }
    }, 600);
  };

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!note) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#FFFEF7]">
      {/* Toolbar */}
      <EditorToolbar editor={editor} noteId={note.id} />

      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        {/* Back button on mobile (hidden on md+) */}
        <button
          className="md:hidden p-2 -ml-1 rounded-xl hover:bg-gray-100 toolbar-btn flex-shrink-0"
          onPointerDown={() => selectNote(null)}
        >
          <ChevronLeft className="w-5 h-5 text-gray-500" />
        </button>

        <input
          ref={titleRef}
          type="text"
          value={titleValue}
          onChange={e => handleTitleChange(e.target.value)}
          placeholder="Note title…"
          className="flex-1 text-xl font-bold text-gray-900 bg-transparent outline-none placeholder-gray-300"
          maxLength={120}
        />

        {isSaved && (
          <span className="flex items-center gap-1 text-xs text-green-600 flex-shrink-0">
            <Check className="w-3.5 h-3.5" />
            Saved
          </span>
        )}
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-hidden relative">
        {/* Text layer */}
        <div
          className={`absolute inset-0 overflow-y-auto paper-lines ${
            editorMode === 'draw' ? 'pointer-events-none select-none' : ''
          }`}
        >
          <div className="tiptap-editor min-h-full">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Drawing layer — only mounted in draw mode */}
        {editorMode === 'draw' && (
          <DrawingCanvas
            key={note.id}
            noteId={note.id}
            strokes={note.strokes}
          />
        )}
      </div>
    </div>
  );
}
