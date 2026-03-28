import { useState } from 'react'
import { NotesProvider, useNotes } from './store/notesStore.jsx'
import Sidebar from './components/Sidebar'
import NoteList from './components/NoteList'
import Toolbar from './components/Toolbar'
import NoteCanvas from './components/NoteCanvas'
import styles from './App.module.css'

function AppInner() {
  const { state } = useNotes()
  const { sidebarOpen, noteListOpen, activeNoteId, notes } = state

  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(3)

  const hasActiveNote = !!activeNoteId && notes.some(n => n.id === activeNoteId)

  return (
    <div className={styles.app}>
      {sidebarOpen && <Sidebar />}

      {noteListOpen && <NoteList />}

      <div className={styles.noteArea}>
        {hasActiveNote ? (
          <>
            <Toolbar
              tool={tool}
              setTool={setTool}
              color={color}
              setColor={setColor}
              strokeWidth={strokeWidth}
              setStrokeWidth={setStrokeWidth}
            />
            <NoteCanvas
              tool={tool}
              color={color}
              strokeWidth={strokeWidth}
            />
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  const { dispatch } = useNotes()
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyContent}>
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className={styles.emptyIllustration}>
          <rect x="10" y="8" width="60" height="64" rx="8" fill="#f2f2f7" stroke="#d1d1d6" strokeWidth="2"/>
          <rect x="10" y="8" width="15" height="64" rx="8" fill="#e5e5ea" stroke="#d1d1d6" strokeWidth="2"/>
          <path d="M30 26h32M30 34h32M30 42h24M30 50h20" stroke="#aeaeb2" strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="58" cy="56" r="14" fill="#007aff"/>
          <path d="M52 56h12M58 50v12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
        <h2>Select or Create a Note</h2>
        <p>Choose a notebook and note from the sidebar, or create a new one to start writing.</p>
        <button
          className={styles.createNoteBtn}
          onClick={() => dispatch({ type: 'CREATE_NOTE' })}
        >
          New Note
        </button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <NotesProvider>
      <AppInner />
    </NotesProvider>
  )
}
