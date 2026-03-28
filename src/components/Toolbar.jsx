import { useState } from 'react'
import { useNotes } from '../store/notesStore.jsx'
import styles from './Toolbar.module.css'

const COLORS = [
  '#000000', '#1c1c1e', '#2c2c2e', '#636366',
  '#007aff', '#5ac8fa', '#34c759', '#30d158',
  '#ff9500', '#ff6b00', '#ff3b30', '#ff2d55',
  '#af52de', '#bf5af2', '#ffcc00', '#ffd60a',
]

const PAGE_STYLES = ['blank', 'lined', 'grid', 'dotted']
const PAGE_COLORS = ['white', 'cream', 'dark']

export default function Toolbar({ tool, setTool, color, setColor, strokeWidth, setStrokeWidth }) {
  const { state, dispatch } = useNotes()
  const { notes, activeNoteId } = state
  const activeNote = notes.find(n => n.id === activeNoteId)

  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showStrokeWidth, setShowStrokeWidth] = useState(false)
  const [showPageSettings, setShowPageSettings] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')

  function handleUndo() {
    dispatch({ type: 'UNDO_STROKE', noteId: activeNoteId })
  }

  function handleClear() {
    if (confirm('Clear all content from this note?')) {
      dispatch({ type: 'CLEAR_STROKES', noteId: activeNoteId })
    }
  }

  function startEditTitle() {
    setTitleValue(activeNote?.title || '')
    setEditingTitle(true)
  }

  function commitTitle() {
    if (titleValue.trim() && activeNoteId) {
      dispatch({ type: 'UPDATE_NOTE', id: activeNoteId, data: { title: titleValue.trim() } })
    }
    setEditingTitle(false)
  }

  function setPageStyle(style) {
    dispatch({ type: 'UPDATE_NOTE', id: activeNoteId, data: { pageStyle: style } })
  }

  function setPageColor(color) {
    dispatch({ type: 'UPDATE_NOTE', id: activeNoteId, data: { pageColor: color } })
  }

  const tools = [
    {
      id: 'pen',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M14 2L18 6L7 17H3V13L14 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
          <path d="M12 4L16 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      ),
      label: 'Pen'
    },
    {
      id: 'highlighter',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="3" y="12" width="14" height="4" rx="2" fill="currentColor" opacity="0.3"/>
          <path d="M7 12L13 3L17 6L11 15" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        </svg>
      ),
      label: 'Highlighter'
    },
    {
      id: 'eraser',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 16L9 10L14 15L10 17H3V16Z" fill="currentColor" opacity="0.15"/>
          <path d="M3 16L9 10L14 15L10 17H3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
          <path d="M7 12L12 7L17 12" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        </svg>
      ),
      label: 'Eraser'
    },
    {
      id: 'text',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M4 5h12M10 5v12M7 17h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      label: 'Text'
    },
  ]

  return (
    <div className={styles.toolbar}>
      {/* Left: Title + nav */}
      <div className={styles.left}>
        <button
          className={styles.sidebarToggle}
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          title="Toggle Sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="2" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M7 2v14" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        </button>

        {editingTitle ? (
          <input
            autoFocus
            className={styles.titleInput}
            value={titleValue}
            onChange={e => setTitleValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
          />
        ) : (
          <button className={styles.noteTitle} onClick={startEditTitle}>
            {activeNote?.title || 'Untitled Note'}
          </button>
        )}
      </div>

      {/* Center: Drawing tools */}
      <div className={styles.center}>
        <div className={styles.toolGroup}>
          {tools.map(t => (
            <button
              key={t.id}
              className={`${styles.toolBtn} ${tool === t.id ? styles.active : ''}`}
              onClick={() => setTool(t.id)}
              title={t.label}
              style={tool === t.id && t.id !== 'eraser' ? { color } : {}}
            >
              {t.icon}
              <span className={styles.toolLabel}>{t.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.divider} />

        {/* Color picker */}
        <div className={styles.popoverContainer}>
          <button
            className={`${styles.colorSwatch} ${tool === 'eraser' ? styles.disabled : ''}`}
            style={{ background: color, boxShadow: `0 0 0 2px white, 0 0 0 3px ${color}` }}
            onClick={() => { if (tool !== 'eraser') setShowColorPicker(!showColorPicker) }}
            title="Color"
          />
          {showColorPicker && (
            <>
              <div className={styles.popoverBackdrop} onClick={() => setShowColorPicker(false)} />
              <div className={styles.colorPopover}>
                <div className={styles.colorGrid}>
                  {COLORS.map(c => (
                    <button
                      key={c}
                      className={`${styles.colorOption} ${c === color ? styles.selected : ''}`}
                      style={{ background: c }}
                      onClick={() => { setColor(c); setShowColorPicker(false) }}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  className={styles.colorCustom}
                  value={color}
                  onChange={e => setColor(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {/* Stroke width */}
        <div className={styles.popoverContainer}>
          <button
            className={styles.strokeBtn}
            onClick={() => setShowStrokeWidth(!showStrokeWidth)}
            title="Stroke Width"
          >
            <div className={styles.strokePreview} style={{ height: Math.min(strokeWidth, 8), background: tool === 'eraser' ? '#636366' : color }} />
          </button>
          {showStrokeWidth && (
            <>
              <div className={styles.popoverBackdrop} onClick={() => setShowStrokeWidth(false)} />
              <div className={styles.strokePopover}>
                <span className={styles.popoverLabel}>Stroke Width</span>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={strokeWidth}
                  onChange={e => setStrokeWidth(Number(e.target.value))}
                  className={styles.slider}
                />
                <span className={styles.sliderValue}>{strokeWidth}px</span>
                <div className={styles.strokePresets}>
                  {[1, 3, 6, 10, 16].map(w => (
                    <button
                      key={w}
                      className={`${styles.presetDot} ${strokeWidth === w ? styles.selected : ''}`}
                      onClick={() => { setStrokeWidth(w); setShowStrokeWidth(false) }}
                      style={{ width: w + 8, height: w + 8 }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: Actions */}
      <div className={styles.right}>
        <button className={styles.actionBtn} onClick={handleUndo} title="Undo">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 7L7 3M3 7l4 4M3 7h9a4 4 0 010 8H9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Page settings */}
        <div className={styles.popoverContainer}>
          <button
            className={styles.actionBtn}
            onClick={() => setShowPageSettings(!showPageSettings)}
            title="Page Settings"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M5 6h8M5 9h8M5 12h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
          {showPageSettings && (
            <>
              <div className={styles.popoverBackdrop} onClick={() => setShowPageSettings(false)} />
              <div className={`${styles.pagePopover} ${styles.pagePopoverRight}`}>
                <span className={styles.popoverLabel}>Page Style</span>
                <div className={styles.pageStyleGrid}>
                  {PAGE_STYLES.map(s => (
                    <button
                      key={s}
                      className={`${styles.pageStyleBtn} ${activeNote?.pageStyle === s ? styles.selected : ''}`}
                      onClick={() => setPageStyle(s)}
                    >
                      <PageStyleIcon style={s} />
                      <span>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                    </button>
                  ))}
                </div>
                <span className={styles.popoverLabel} style={{ marginTop: 12 }}>Paper Color</span>
                <div className={styles.pageColorRow}>
                  {PAGE_COLORS.map(c => (
                    <button
                      key={c}
                      className={`${styles.pageColorBtn} ${activeNote?.pageColor === c ? styles.selected : ''}`}
                      style={{
                        background: c === 'cream' ? '#fdf6e3' : c === 'dark' ? '#1c1c1e' : '#ffffff',
                        color: c === 'dark' ? 'white' : 'black'
                      }}
                      onClick={() => setPageColor(c)}
                    >
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <button className={`${styles.actionBtn} ${styles.dangerBtn}`} onClick={handleClear} title="Clear Note">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 4.5h12M7 4.5V3a.5.5 0 01.5-.5h3A.5.5 0 0111 3v1.5M6.5 7.5v5M11.5 7.5v5M4 4.5l.8 9a.5.5 0 00.5.5h7.4a.5.5 0 00.5-.5l.8-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

function PageStyleIcon({ style }) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="1" y="1" width="30" height="30" rx="4" fill="white" stroke="#d1d1d6" strokeWidth="1"/>
      {style === 'lined' && <>
        <path d="M5 10h22M5 14h22M5 18h22M5 22h22" stroke="#c7c7cc" strokeWidth="1.2"/>
        <path d="M9 1v30" stroke="#ffaaaa" strokeWidth="0.8" opacity="0.6"/>
      </>}
      {style === 'grid' && <>
        <path d="M5 10h22M5 14h22M5 18h22M5 22h22M10 5v22M16 5v22M22 5v22" stroke="#c7c7cc" strokeWidth="1"/>
      </>}
      {style === 'dotted' && <>
        {[10, 16, 22].map(y => [10, 16, 22].map(x => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" fill="#c7c7cc"/>
        )))}
      </>}
    </svg>
  )
}
