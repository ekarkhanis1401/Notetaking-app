import { useRef, useEffect, useCallback, useState } from 'react'
import { useNotes } from '../store/notesStore.jsx'
import { drawStroke, redrawCanvas, drawPageBackground, getCanvasPoint, generateThumbnail } from '../utils/canvasUtils'
import { v4 as uuidv4 } from 'uuid'
import styles from './NoteCanvas.module.css'

export default function NoteCanvas({ tool, color, strokeWidth, onCanvasReady }) {
  const { state, dispatch } = useNotes()
  const { notes, activeNoteId } = state
  const activeNote = notes.find(n => n.id === activeNoteId)

  const canvasRef = useRef(null)
  const overlayRef = useRef(null)   // for live drawing
  const containerRef = useRef(null)
  const isDrawingRef = useRef(false)
  const currentStrokeRef = useRef(null)
  const thumbnailTimerRef = useRef(null)
  const [editingTextBlock, setEditingTextBlock] = useState(null)
  const [textInput, setTextInput] = useState('')
  const [textPos, setTextPos] = useState({ x: 0, y: 0 })
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  // Set up canvas dimensions
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setCanvasSize({ width: Math.floor(width), height: Math.floor(height) })
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // Redraw when size or note changes
  useEffect(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay || canvasSize.width === 0) return
    canvas.width = canvasSize.width
    canvas.height = canvasSize.height
    overlay.width = canvasSize.width
    overlay.height = canvasSize.height
    redrawAll()
  }, [canvasSize, activeNoteId])

  // Redraw when strokes change
  useEffect(() => {
    if (canvasSize.width === 0) return
    redrawAll()
  }, [activeNote?.strokes, activeNote?.pageStyle, activeNote?.pageColor])

  function redrawAll() {
    const canvas = canvasRef.current
    if (!canvas || !activeNote) return
    const ctx = canvas.getContext('2d')
    drawPageBackground(ctx, canvas.width, canvas.height, activeNote.pageStyle, activeNote.pageColor)
    redrawCanvas(ctx, activeNote.strokes, canvas.width, canvas.height)
  }

  function scheduleThumbnail() {
    clearTimeout(thumbnailTimerRef.current)
    thumbnailTimerRef.current = setTimeout(() => {
      const canvas = canvasRef.current
      if (!canvas || !activeNoteId) return
      const thumb = generateThumbnail(canvas)
      dispatch({ type: 'UPDATE_NOTE', id: activeNoteId, data: { thumbnail: thumb } })
    }, 1500)
  }

  // Pointer events for drawing
  const handlePointerDown = useCallback((e) => {
    if (tool === 'text') return
    e.preventDefault()

    const overlay = overlayRef.current
    overlay.setPointerCapture(e.pointerId)

    const point = getCanvasPoint(overlay, e)
    isDrawingRef.current = true
    currentStrokeRef.current = {
      id: uuidv4(),
      tool,
      color,
      width: strokeWidth,
      points: [point],
    }
  }, [tool, color, strokeWidth])

  const handlePointerMove = useCallback((e) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return
    e.preventDefault()

    const overlay = overlayRef.current
    const point = getCanvasPoint(overlay, e)
    currentStrokeRef.current.points.push(point)

    // Draw live preview on overlay canvas
    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    drawStroke(ctx, currentStrokeRef.current)
  }, [])

  const handlePointerUp = useCallback((e) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return
    e.preventDefault()

    isDrawingRef.current = false
    const stroke = currentStrokeRef.current
    currentStrokeRef.current = null

    // Clear overlay
    const overlay = overlayRef.current
    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, overlay.width, overlay.height)

    // Commit stroke to main canvas + store
    if (stroke.points.length > 0) {
      dispatch({ type: 'ADD_STROKE', noteId: activeNoteId, stroke })
      scheduleThumbnail()
    }
  }, [activeNoteId, dispatch])

  // Text tool click
  const handleCanvasClick = useCallback((e) => {
    if (tool !== 'text') return
    const overlay = overlayRef.current
    const point = getCanvasPoint(overlay, e)
    setTextPos(point)
    setTextInput('')
    setEditingTextBlock({ id: uuidv4(), x: point.x, y: point.y })
  }, [tool])

  function commitText() {
    if (!editingTextBlock || !textInput.trim()) {
      setEditingTextBlock(null)
      return
    }
    dispatch({
      type: 'ADD_TEXT_BLOCK',
      noteId: activeNoteId,
      block: {
        id: editingTextBlock.id,
        x: editingTextBlock.x,
        y: editingTextBlock.y,
        text: textInput.trim(),
        color,
        fontSize: strokeWidth > 4 ? 24 : strokeWidth > 2 ? 18 : 14,
      }
    })
    setEditingTextBlock(null)
    setTextInput('')
    scheduleThumbnail()
  }

  const pageStyle = activeNote?.pageStyle || 'lined'
  const pageColor = activeNote?.pageColor || 'white'

  const bgColor = pageColor === 'cream' ? '#fdf6e3' :
                  pageColor === 'dark' ? '#1c1c1e' : '#ffffff'

  return (
    <div ref={containerRef} className={styles.canvasContainer} style={{ background: bgColor }}>
      <canvas
        ref={canvasRef}
        className={styles.mainCanvas}
      />
      <canvas
        ref={overlayRef}
        className={styles.overlayCanvas}
        style={{ cursor: tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleCanvasClick}
      />

      {/* Render text blocks */}
      {activeNote?.textBlocks.map(block => (
        <div
          key={block.id}
          className={styles.textBlock}
          style={{
            left: block.x,
            top: block.y,
            color: block.color,
            fontSize: block.fontSize,
          }}
          onDoubleClick={() => {
            dispatch({ type: 'DELETE_TEXT_BLOCK', noteId: activeNoteId, blockId: block.id })
          }}
        >
          {block.text}
        </div>
      ))}

      {/* Text input overlay */}
      {editingTextBlock && (
        <textarea
          autoFocus
          className={styles.textInputOverlay}
          style={{
            left: editingTextBlock.x,
            top: editingTextBlock.y,
            color,
            fontSize: strokeWidth > 4 ? 24 : strokeWidth > 2 ? 18 : 14,
          }}
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          onBlur={commitText}
          onKeyDown={e => {
            if (e.key === 'Escape') { setEditingTextBlock(null); setTextInput('') }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText() }
          }}
          placeholder="Type here..."
        />
      )}
    </div>
  )
}
