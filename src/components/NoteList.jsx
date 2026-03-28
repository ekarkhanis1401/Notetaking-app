import { useState } from 'react'
import { useNotes } from '../store/notesStore.jsx'
import styles from './NoteList.module.css'

function formatDate(timestamp) {
  const d = new Date(timestamp)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function NoteList() {
  const { state, dispatch } = useNotes()
  const { notes, activeNotebookId, activeNoteId, notebooks } = state
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const activeNotebook = notebooks.find(n => n.id === activeNotebookId)
  const filteredNotes = notes
    .filter(n => n.notebookId === activeNotebookId)
    .filter(n => !search || n.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt)

  function handleDelete(id, e) {
    e.stopPropagation()
    setConfirmDelete(id)
  }

  function confirmDeleteNote() {
    dispatch({ type: 'DELETE_NOTE', id: confirmDelete })
    setConfirmDelete(null)
  }

  return (
    <div className={styles.noteList}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2 className={styles.title} style={{ color: activeNotebook?.color }}>
            {activeNotebook?.name || 'Notes'}
          </h2>
          <button
            className={styles.newNoteBtn}
            onClick={() => dispatch({ type: 'CREATE_NOTE' })}
            title="New Note"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2v14M2 9h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className={styles.searchBox}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={styles.searchIcon}>
            <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            className={styles.searchInput}
            placeholder="Search notes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.clearSearch} onClick={() => setSearch('')}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className={styles.list}>
        {filteredNotes.length === 0 ? (
          <div className={styles.empty}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className={styles.emptyIcon}>
              <rect x="8" y="4" width="32" height="40" rx="4" fill="#f2f2f7" stroke="#d1d1d6" strokeWidth="2"/>
              <path d="M16 16h16M16 22h16M16 28h10" stroke="#aeaeb2" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <p>{search ? 'No notes match your search' : 'No notes yet'}</p>
            {!search && (
              <button
                className={styles.createFirstBtn}
                onClick={() => dispatch({ type: 'CREATE_NOTE' })}
              >
                Create a note
              </button>
            )}
          </div>
        ) : (
          filteredNotes.map(note => (
            <div
              key={note.id}
              className={`${styles.noteItem} ${note.id === activeNoteId ? styles.active : ''}`}
              onClick={() => dispatch({ type: 'SET_ACTIVE_NOTE', id: note.id })}
            >
              <div className={styles.notePreview}>
                {note.thumbnail ? (
                  <img src={note.thumbnail} alt="" className={styles.thumbnail} />
                ) : (
                  <div className={styles.thumbnailPlaceholder}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M4 7h16M4 11h16M4 15h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                )}
              </div>
              <div className={styles.noteInfo}>
                <span className={styles.noteTitle}>{note.title || 'Untitled Note'}</span>
                <span className={styles.noteDate}>{formatDate(note.updatedAt)}</span>
                <span className={styles.noteStats}>
                  {note.strokes.length > 0 && `${note.strokes.length} strokes`}
                  {note.strokes.length > 0 && note.textBlocks.length > 0 && ' · '}
                  {note.textBlocks.length > 0 && `${note.textBlocks.length} text blocks`}
                </span>
              </div>
              <button
                className={styles.deleteBtn}
                onClick={e => handleDelete(note.id, e)}
                title="Delete note"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M5.5 6v4M8.5 6v4M3 3.5l.7 7a.5.5 0 00.5.5h5.6a.5.5 0 00.5-.5l.7-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {confirmDelete && (
        <div className={styles.deleteModal}>
          <div className={styles.deleteModalContent}>
            <p>Delete this note?</p>
            <div className={styles.deleteModalActions}>
              <button onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className={styles.deleteConfirmBtn} onClick={confirmDeleteNote}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
