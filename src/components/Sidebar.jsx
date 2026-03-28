import { useState } from 'react'
import { useNotes } from '../store/notesStore.jsx'
import { v4 as uuidv4 } from 'uuid'
import styles from './Sidebar.module.css'

const NOTEBOOK_COLORS = [
  '#007aff', '#34c759', '#ff9500', '#ff3b30',
  '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00'
]

export default function Sidebar() {
  const { state, dispatch } = useNotes()
  const { notebooks, activeNotebookId, notes } = state
  const [showAddNotebook, setShowAddNotebook] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#007aff')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  function handleAddNotebook() {
    if (newName.trim()) {
      dispatch({ type: 'CREATE_NOTEBOOK', name: newName.trim(), color: newColor })
      setNewName('')
      setNewColor('#007aff')
      setShowAddNotebook(false)
    }
  }

  function handleDelete(id, e) {
    e.stopPropagation()
    if (confirm('Delete this notebook and all its notes?')) {
      dispatch({ type: 'DELETE_NOTEBOOK', id })
    }
  }

  function startRename(notebook, e) {
    e.stopPropagation()
    setEditingId(notebook.id)
    setEditName(notebook.name)
  }

  function handleRename(id) {
    if (editName.trim()) {
      dispatch({ type: 'RENAME_NOTEBOOK', id, name: editName.trim() })
    }
    setEditingId(null)
  }

  function getNoteCount(notebookId) {
    return notes.filter(n => n.notebookId === notebookId).length
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="8" fill="#007aff"/>
            <path d="M7 8h14M7 12h14M7 16h10M7 20h8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span>Notely</span>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span>Notebooks</span>
          <button className={styles.addBtn} onClick={() => setShowAddNotebook(true)} title="New Notebook">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {showAddNotebook && (
          <div className={styles.addNotebookForm}>
            <input
              autoFocus
              className={styles.nameInput}
              placeholder="Notebook name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddNotebook(); if (e.key === 'Escape') setShowAddNotebook(false) }}
            />
            <div className={styles.colorPicker}>
              {NOTEBOOK_COLORS.map(c => (
                <button
                  key={c}
                  className={`${styles.colorDot} ${newColor === c ? styles.selected : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
            <div className={styles.formActions}>
              <button className={styles.cancelBtn} onClick={() => setShowAddNotebook(false)}>Cancel</button>
              <button className={styles.createBtn} onClick={handleAddNotebook}>Create</button>
            </div>
          </div>
        )}

        <div className={styles.notebookList}>
          {notebooks.map(notebook => (
            <div
              key={notebook.id}
              className={`${styles.notebookItem} ${notebook.id === activeNotebookId ? styles.active : ''}`}
              onClick={() => dispatch({ type: 'SET_ACTIVE_NOTEBOOK', id: notebook.id })}
            >
              <div className={styles.notebookIcon} style={{ background: notebook.color + '20', borderColor: notebook.color + '40' }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="2" y="1" width="14" height="16" rx="2" fill={notebook.color} opacity="0.9"/>
                  <path d="M5 5h8M5 8h8M5 11h5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              {editingId === notebook.id ? (
                <input
                  className={styles.renameInput}
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={() => handleRename(notebook.id)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(notebook.id); if (e.key === 'Escape') setEditingId(null) }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <div className={styles.notebookInfo}>
                  <span className={styles.notebookName}>{notebook.name}</span>
                  <span className={styles.noteCount}>{getNoteCount(notebook.id)} notes</span>
                </div>
              )}
              <div className={styles.notebookActions}>
                <button className={styles.actionBtn} onClick={e => startRename(notebook, e)} title="Rename">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M9.5 1.5L12.5 4.5L5 12H2V9L9.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button className={styles.actionBtn} onClick={e => handleDelete(notebook.id, e)} title="Delete">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M5.5 6v4M8.5 6v4M3 3.5l.7 7a.5.5 0 00.5.5h5.6a.5.5 0 00.5-.5l.7-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.footerStat}>
          <span>{notes.length} total notes</span>
        </div>
      </div>
    </div>
  )
}
