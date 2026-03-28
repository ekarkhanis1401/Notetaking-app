import { createContext, useContext, useReducer, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'

const STORAGE_KEY = 'notely_data_v1'

function createNotebook(name, color = '#007aff') {
  return { id: uuidv4(), name, color, createdAt: Date.now() }
}

function createNote(notebookId, title = 'Untitled Note') {
  return {
    id: uuidv4(),
    notebookId,
    title,
    strokes: [],          // drawing strokes
    textBlocks: [],       // text annotations
    thumbnail: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pageColor: 'white',
    pageStyle: 'lined',   // lined | grid | blank | dotted
  }
}

const defaultNotebook = createNotebook('My Notes', '#007aff')
const defaultNote = createNote(defaultNotebook.id, 'Welcome to Notely')

const initialState = {
  notebooks: [
    defaultNotebook,
    createNotebook('Work', '#34c759'),
    createNotebook('Personal', '#ff9500'),
  ],
  notes: [
    defaultNote,
  ],
  activeNotebookId: defaultNotebook.id,
  activeNoteId: defaultNote.id,
  sidebarOpen: true,
  noteListOpen: true,
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      return { ...initialState, ...data }
    }
  } catch {}
  return initialState
}

function reducer(state, action) {
  switch (action.type) {
    case 'CREATE_NOTEBOOK': {
      const notebook = createNotebook(action.name, action.color)
      return { ...state, notebooks: [...state.notebooks, notebook], activeNotebookId: notebook.id }
    }
    case 'DELETE_NOTEBOOK': {
      const notebooks = state.notebooks.filter(n => n.id !== action.id)
      const notes = state.notes.filter(n => n.notebookId !== action.id)
      const activeNotebookId = notebooks.length > 0 ? notebooks[0].id : null
      const notesInActive = notes.filter(n => n.notebookId === activeNotebookId)
      const activeNoteId = notesInActive.length > 0 ? notesInActive[0].id : null
      return { ...state, notebooks, notes, activeNotebookId, activeNoteId }
    }
    case 'RENAME_NOTEBOOK': {
      return {
        ...state,
        notebooks: state.notebooks.map(n =>
          n.id === action.id ? { ...n, name: action.name } : n
        )
      }
    }
    case 'SET_ACTIVE_NOTEBOOK': {
      const notesInNotebook = state.notes.filter(n => n.notebookId === action.id)
      const activeNoteId = notesInNotebook.length > 0 ? notesInNotebook[0].id : null
      return { ...state, activeNotebookId: action.id, activeNoteId }
    }
    case 'CREATE_NOTE': {
      const note = createNote(state.activeNotebookId)
      return { ...state, notes: [note, ...state.notes], activeNoteId: note.id }
    }
    case 'DELETE_NOTE': {
      const notes = state.notes.filter(n => n.id !== action.id)
      const notesInNotebook = notes.filter(n => n.notebookId === state.activeNotebookId)
      const activeNoteId = notesInNotebook.length > 0 ? notesInNotebook[0].id : null
      return { ...state, notes, activeNoteId }
    }
    case 'SET_ACTIVE_NOTE':
      return { ...state, activeNoteId: action.id }
    case 'UPDATE_NOTE': {
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.id ? { ...n, ...action.data, updatedAt: Date.now() } : n
        )
      }
    }
    case 'ADD_STROKE': {
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.noteId
            ? { ...n, strokes: [...n.strokes, action.stroke], updatedAt: Date.now() }
            : n
        )
      }
    }
    case 'UNDO_STROKE': {
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.noteId
            ? { ...n, strokes: n.strokes.slice(0, -1), updatedAt: Date.now() }
            : n
        )
      }
    }
    case 'CLEAR_STROKES': {
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.noteId
            ? { ...n, strokes: [], textBlocks: [], updatedAt: Date.now() }
            : n
        )
      }
    }
    case 'ADD_TEXT_BLOCK': {
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.noteId
            ? { ...n, textBlocks: [...n.textBlocks, action.block], updatedAt: Date.now() }
            : n
        )
      }
    }
    case 'UPDATE_TEXT_BLOCK': {
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.noteId
            ? {
                ...n,
                textBlocks: n.textBlocks.map(b =>
                  b.id === action.blockId ? { ...b, ...action.data } : b
                ),
                updatedAt: Date.now()
              }
            : n
        )
      }
    }
    case 'DELETE_TEXT_BLOCK': {
      return {
        ...state,
        notes: state.notes.map(n =>
          n.id === action.noteId
            ? { ...n, textBlocks: n.textBlocks.filter(b => b.id !== action.blockId), updatedAt: Date.now() }
            : n
        )
      }
    }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen }
    case 'TOGGLE_NOTELIST':
      return { ...state, noteListOpen: !state.noteListOpen }
    default:
      return state
  }
}

export const NotesContext = createContext(null)

export function NotesProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, loadState)

  useEffect(() => {
    const toSave = {
      notebooks: state.notebooks,
      notes: state.notes.map(n => ({ ...n, thumbnail: null })),
      activeNotebookId: state.activeNotebookId,
      activeNoteId: state.activeNoteId,
      sidebarOpen: state.sidebarOpen,
      noteListOpen: state.noteListOpen,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch (e) {
      console.warn('Storage quota exceeded', e)
    }
  }, [state])

  return (
    <NotesContext.Provider value={{ state, dispatch }}>
      {children}
    </NotesContext.Provider>
  )
}

export function useNotes() {
  return useContext(NotesContext)
}
