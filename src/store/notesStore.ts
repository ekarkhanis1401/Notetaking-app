import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Subject, Note, Stroke, DrawingSettings, EditorMode } from '../types';
import { SUBJECT_COLORS } from '../types';

interface NotesState {
  subjects: Subject[];
  notes: Note[];
  selectedSubjectId: string | null;
  selectedNoteId: string | null;
  editorMode: EditorMode;
  drawingSettings: DrawingSettings;
  searchQuery: string;
  sidebarOpen: boolean;

  // Subject actions
  addSubject: (name: string) => Subject;
  updateSubject: (id: string, updates: Partial<Omit<Subject, 'id'>>) => void;
  deleteSubject: (id: string) => void;
  selectSubject: (id: string | null) => void;

  // Note actions
  addNote: (subjectId: string) => Note;
  updateNote: (id: string, updates: Partial<Omit<Note, 'id' | 'subjectId' | 'createdAt'>>) => void;
  deleteNote: (id: string) => void;
  selectNote: (id: string | null) => void;
  addStroke: (noteId: string, stroke: Stroke) => void;
  clearStrokes: (noteId: string) => void;
  undoLastStroke: (noteId: string) => void;

  // UI actions
  setEditorMode: (mode: EditorMode) => void;
  setDrawingSettings: (settings: Partial<DrawingSettings>) => void;
  setSearchQuery: (query: string) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Computed
  getNotesForSubject: (subjectId: string) => Note[];
  getFilteredNotes: () => Note[];
  getSelectedNote: () => Note | null;
  getSelectedSubject: () => Subject | null;
}

const DEFAULT_DRAWING_SETTINGS: DrawingSettings = {
  tool: 'pen',
  color: '#000000',
  thickness: 'medium',
};

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      subjects: [],
      notes: [],
      selectedSubjectId: null,
      selectedNoteId: null,
      editorMode: 'text',
      drawingSettings: DEFAULT_DRAWING_SETTINGS,
      searchQuery: '',
      sidebarOpen: true,

      // Subject actions
      addSubject: (name: string) => {
        const usedColors = get().subjects.map(s => s.color);
        const availableColors = SUBJECT_COLORS.filter(c => !usedColors.includes(c));
        const color = availableColors.length > 0
          ? availableColors[0]
          : SUBJECT_COLORS[get().subjects.length % SUBJECT_COLORS.length];

        const subject: Subject = {
          id: uuidv4(),
          name,
          color,
          createdAt: new Date().toISOString(),
        };
        set(state => ({ subjects: [...state.subjects, subject] }));
        return subject;
      },

      updateSubject: (id, updates) => {
        set(state => ({
          subjects: state.subjects.map(s =>
            s.id === id ? { ...s, ...updates } : s
          ),
        }));
      },

      deleteSubject: (id) => {
        const noteIds = get().notes
          .filter(n => n.subjectId === id)
          .map(n => n.id);

        set(state => ({
          subjects: state.subjects.filter(s => s.id !== id),
          notes: state.notes.filter(n => n.subjectId !== id),
          selectedSubjectId: state.selectedSubjectId === id ? null : state.selectedSubjectId,
          selectedNoteId: noteIds.includes(state.selectedNoteId ?? '')
            ? null
            : state.selectedNoteId,
        }));
      },

      selectSubject: (id) => {
        set({ selectedSubjectId: id, selectedNoteId: null });
      },

      // Note actions
      addNote: (subjectId: string) => {
        const note: Note = {
          id: uuidv4(),
          subjectId,
          title: 'Untitled Note',
          content: '',
          strokes: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set(state => ({
          notes: [note, ...state.notes],
          selectedNoteId: note.id,
        }));
        return note;
      },

      updateNote: (id, updates) => {
        set(state => ({
          notes: state.notes.map(n =>
            n.id === id
              ? { ...n, ...updates, updatedAt: new Date().toISOString() }
              : n
          ),
        }));
      },

      deleteNote: (id) => {
        set(state => ({
          notes: state.notes.filter(n => n.id !== id),
          selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId,
        }));
      },

      selectNote: (id) => {
        set({ selectedNoteId: id });
      },

      addStroke: (noteId, stroke) => {
        set(state => ({
          notes: state.notes.map(n =>
            n.id === noteId
              ? {
                  ...n,
                  strokes: [...n.strokes, stroke],
                  updatedAt: new Date().toISOString(),
                }
              : n
          ),
        }));
      },

      clearStrokes: (noteId) => {
        set(state => ({
          notes: state.notes.map(n =>
            n.id === noteId
              ? { ...n, strokes: [], updatedAt: new Date().toISOString() }
              : n
          ),
        }));
      },

      undoLastStroke: (noteId) => {
        set(state => ({
          notes: state.notes.map(n =>
            n.id === noteId
              ? {
                  ...n,
                  strokes: n.strokes.slice(0, -1),
                  updatedAt: new Date().toISOString(),
                }
              : n
          ),
        }));
      },

      // UI actions
      setEditorMode: (mode) => {
        set({ editorMode: mode });
      },

      setDrawingSettings: (settings) => {
        set(state => ({
          drawingSettings: { ...state.drawingSettings, ...settings },
        }));
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },

      toggleSidebar: () => {
        set(state => ({ sidebarOpen: !state.sidebarOpen }));
      },

      setSidebarOpen: (open) => {
        set({ sidebarOpen: open });
      },

      // Computed
      getNotesForSubject: (subjectId) => {
        return get().notes
          .filter(n => n.subjectId === subjectId)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      },

      getFilteredNotes: () => {
        const { notes, selectedSubjectId, searchQuery } = get();
        let filtered = selectedSubjectId
          ? notes.filter(n => n.subjectId === selectedSubjectId)
          : notes;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          filtered = filtered.filter(n =>
            n.title.toLowerCase().includes(q) ||
            n.content.toLowerCase().replace(/<[^>]*>/g, '').includes(q)
          );
        }

        return filtered.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      },

      getSelectedNote: () => {
        const { notes, selectedNoteId } = get();
        return notes.find(n => n.id === selectedNoteId) ?? null;
      },

      getSelectedSubject: () => {
        const { subjects, selectedSubjectId } = get();
        return subjects.find(s => s.id === selectedSubjectId) ?? null;
      },
    }),
    {
      name: 'notetaking-app-storage',
      partialize: (state) => ({
        subjects: state.subjects,
        notes: state.notes,
        selectedSubjectId: state.selectedSubjectId,
        selectedNoteId: state.selectedNoteId,
        drawingSettings: state.drawingSettings,
      }),
    }
  )
);
