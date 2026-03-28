import { type Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight,
  Highlighter, PenLine, Eraser,
  Undo, Redo, Trash2,
  Type, Pen,
} from 'lucide-react';
import { useNotesStore } from '../store/notesStore';
import { PEN_COLORS, HIGHLIGHTER_COLORS } from '../types';
import type { PenThickness, DrawingTool } from '../types';

interface EditorToolbarProps {
  editor: Editor | null;
  noteId: string;
}

function ToolBtn({
  active, onPress, title, children, disabled,
}: {
  active?: boolean;
  onPress: () => void;
  title?: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onPointerDown={e => { e.preventDefault(); onPress(); }}
      className={`toolbar-btn p-2 rounded-lg transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700'
          : disabled
          ? 'text-gray-300 cursor-not-allowed'
          : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-gray-200 mx-0.5 self-center flex-shrink-0" />;
}

export default function EditorToolbar({ editor, noteId }: EditorToolbarProps) {
  const {
    editorMode,
    drawingSettings,
    setEditorMode,
    setDrawingSettings,
    undoLastStroke,
    clearStrokes,
    getSelectedNote,
  } = useNotesStore();

  const note = getSelectedNote();
  const isTextMode = editorMode === 'text';
  const isDrawMode = editorMode === 'draw';
  const { tool, color, thickness } = drawingSettings;

  const thicknesses: { value: PenThickness; label: string }[] = [
    { value: 'thin', label: 'S' },
    { value: 'medium', label: 'M' },
    { value: 'thick', label: 'L' },
  ];

  const drawTools: { value: DrawingTool; icon: React.ReactNode; label: string }[] = [
    { value: 'pen', icon: <Pen className="w-4 h-4" />, label: 'Pen' },
    { value: 'highlighter', icon: <Highlighter className="w-4 h-4" />, label: 'Highlighter' },
    { value: 'eraser', icon: <Eraser className="w-4 h-4" />, label: 'Eraser' },
  ];

  const activeColors = tool === 'highlighter' ? HIGHLIGHTER_COLORS : PEN_COLORS;

  return (
    <div className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm">
      {/* Mode switcher */}
      <div className="flex items-center px-3 py-2 gap-1 border-b border-gray-100">
        <button
          onPointerDown={() => setEditorMode('text')}
          className={`toolbar-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            isTextMode ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          <Type className="w-3.5 h-3.5" />
          Text
        </button>
        <button
          onPointerDown={() => setEditorMode('draw')}
          className={`toolbar-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            isDrawMode ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          <PenLine className="w-3.5 h-3.5" />
          Draw
        </button>
      </div>

      {/* Text formatting toolbar */}
      {isTextMode && editor && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 overflow-x-auto scrollbar-hide flex-nowrap">
          <ToolBtn
            active={editor.isActive('bold')}
            onPress={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('italic')}
            onPress={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('underline')}
            onPress={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline"
          >
            <Underline className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('strike')}
            onPress={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <Strikethrough className="w-4 h-4" />
          </ToolBtn>

          <Divider />

          <ToolBtn
            active={editor.isActive('heading', { level: 1 })}
            onPress={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >
            <Heading1 className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('heading', { level: 2 })}
            onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            <Heading2 className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('heading', { level: 3 })}
            onPress={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >
            <Heading3 className="w-4 h-4" />
          </ToolBtn>

          <Divider />

          <ToolBtn
            active={editor.isActive('bulletList')}
            onPress={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet list"
          >
            <List className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('orderedList')}
            onPress={() => editor.chain().focus().toggleOrderedList().run()}
            title="Ordered list"
          >
            <ListOrdered className="w-4 h-4" />
          </ToolBtn>

          <Divider />

          <ToolBtn
            active={editor.isActive({ textAlign: 'left' })}
            onPress={() => editor.chain().focus().setTextAlign('left').run()}
            title="Align left"
          >
            <AlignLeft className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive({ textAlign: 'center' })}
            onPress={() => editor.chain().focus().setTextAlign('center').run()}
            title="Align center"
          >
            <AlignCenter className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive({ textAlign: 'right' })}
            onPress={() => editor.chain().focus().setTextAlign('right').run()}
            title="Align right"
          >
            <AlignRight className="w-4 h-4" />
          </ToolBtn>

          <Divider />

          {/* Text color */}
          <div className="relative group flex-shrink-0">
            <button
              title="Text color"
              className="toolbar-btn p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            >
              <span className="text-xs font-bold" style={{ color: color }}>A</span>
            </button>
            <div className="absolute top-full left-0 mt-1 p-2 bg-white border border-gray-200 rounded-xl shadow-lg z-50 flex gap-1.5 flex-wrap w-36 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
              {PEN_COLORS.map(c => (
                <button
                  key={c.value}
                  className={`color-swatch ${color === c.value ? 'selected' : ''}`}
                  style={{ backgroundColor: c.value }}
                  onPointerDown={e => {
                    e.preventDefault();
                    editor.chain().focus().setColor(c.value).run();
                  }}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          {/* Highlight */}
          <div className="relative group flex-shrink-0">
            <button
              title="Highlight"
              className={`toolbar-btn p-2 rounded-lg ${editor.isActive('highlight') ? 'bg-yellow-100 text-yellow-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <Highlighter className="w-4 h-4" />
            </button>
            <div className="absolute top-full left-0 mt-1 p-2 bg-white border border-gray-200 rounded-xl shadow-lg z-50 flex gap-1.5 flex-wrap w-36 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
              {HIGHLIGHTER_COLORS.map(c => (
                <button
                  key={c.value}
                  className="color-swatch"
                  style={{ backgroundColor: c.value }}
                  onPointerDown={e => {
                    e.preventDefault();
                    editor.chain().focus().toggleHighlight({ color: c.value }).run();
                  }}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <Divider />

          <ToolBtn
            onPress={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo"
          >
            <Undo className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            onPress={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo"
          >
            <Redo className="w-4 h-4" />
          </ToolBtn>
        </div>
      )}

      {/* Drawing toolbar */}
      {isDrawMode && (
        <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto flex-nowrap">
          {/* Tools */}
          <div className="flex items-center gap-0.5">
            {drawTools.map(t => (
              <button
                key={t.value}
                title={t.label}
                onPointerDown={() => setDrawingSettings({ tool: t.value as DrawingTool })}
                className={`toolbar-btn p-2 rounded-lg transition-colors ${
                  tool === t.value
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.icon}
              </button>
            ))}
          </div>

          <Divider />

          {/* Thickness */}
          <div className="flex items-center gap-0.5">
            {thicknesses.map(t => (
              <button
                key={t.value}
                title={`${t.label} thickness`}
                onPointerDown={() => setDrawingSettings({ thickness: t.value })}
                className={`toolbar-btn w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
                  thickness === t.value
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <Divider />

          {/* Colors (only when not eraser) */}
          {tool !== 'eraser' && (
            <div className="flex items-center gap-1.5">
              {activeColors.map(c => (
                <button
                  key={c.value}
                  title={c.name}
                  onPointerDown={() => setDrawingSettings({ color: c.value })}
                  className={`color-swatch flex-shrink-0 ${color === c.value ? 'selected' : ''}`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          )}

          <Divider />

          {/* Undo / Clear */}
          <ToolBtn
            onPress={() => undoLastStroke(noteId)}
            disabled={(note?.strokes.length ?? 0) === 0}
            title="Undo stroke"
          >
            <Undo className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            onPress={() => clearStrokes(noteId)}
            disabled={(note?.strokes.length ?? 0) === 0}
            title="Clear all drawing"
          >
            <Trash2 className="w-4 h-4" />
          </ToolBtn>
        </div>
      )}
    </div>
  );
}
