export function drawStroke(ctx, stroke) {
  if (!stroke.points || stroke.points.length === 0) return

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
  } else if (stroke.tool === 'highlighter') {
    ctx.globalCompositeOperation = 'multiply'
    ctx.strokeStyle = stroke.color + '60'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = stroke.color
  }

  if (stroke.points.length === 1) {
    const p = stroke.points[0]
    ctx.beginPath()
    ctx.arc(p.x, p.y, (stroke.width * (p.pressure || 0.5)) / 2, 0, Math.PI * 2)
    ctx.fillStyle = stroke.tool === 'eraser' ? 'rgba(0,0,0,1)' : stroke.color
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y)

    for (let i = 1; i < stroke.points.length - 1; i++) {
      const curr = stroke.points[i]
      const next = stroke.points[i + 1]
      const midX = (curr.x + next.x) / 2
      const midY = (curr.y + next.y) / 2
      const pressure = curr.pressure || 0.5
      const lineWidth = stroke.tool === 'highlighter'
        ? stroke.width
        : stroke.width * (0.5 + pressure * 0.8)

      ctx.lineWidth = lineWidth
      ctx.quadraticCurveTo(curr.x, curr.y, midX, midY)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(midX, midY)
    }

    const last = stroke.points[stroke.points.length - 1]
    const secondLast = stroke.points[stroke.points.length - 2]
    ctx.lineWidth = stroke.tool === 'highlighter'
      ? stroke.width
      : stroke.width * (last.pressure || 0.5)
    ctx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y)
    ctx.stroke()
  }

  ctx.restore()
}

export function redrawCanvas(ctx, strokes, width, height) {
  ctx.clearRect(0, 0, width, height)
  strokes.forEach(stroke => drawStroke(ctx, stroke))
}

export function drawPageBackground(ctx, width, height, style, color) {
  ctx.save()
  const bg = color === 'cream' ? '#fdf6e3' :
             color === 'dark' ? '#1c1c1e' : '#ffffff'
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  const lineColor = color === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'
  ctx.strokeStyle = lineColor
  ctx.lineWidth = 1

  if (style === 'lined') {
    const lineSpacing = 32
    for (let y = lineSpacing; y < height; y += lineSpacing) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    // Margin line
    ctx.strokeStyle = color === 'dark' ? 'rgba(255,100,100,0.15)' : 'rgba(255,0,0,0.1)'
    ctx.beginPath()
    ctx.moveTo(72, 0)
    ctx.lineTo(72, height)
    ctx.stroke()
  } else if (style === 'grid') {
    const spacing = 32
    for (let x = spacing; x < width; x += spacing) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = spacing; y < height; y += spacing) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
  } else if (style === 'dotted') {
    const spacing = 32
    ctx.fillStyle = lineColor
    for (let x = spacing; x < width; x += spacing) {
      for (let y = spacing; y < height; y += spacing) {
        ctx.beginPath()
        ctx.arc(x, y, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  ctx.restore()
}

export function getCanvasPoint(canvas, e) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height

  if (e.touches) {
    const touch = e.touches[0]
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY,
      pressure: touch.force || 0.5,
    }
  }

  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
    pressure: e.pressure || 0.5,
  }
}

export function generateThumbnail(canvas) {
  try {
    const thumb = document.createElement('canvas')
    thumb.width = 200
    thumb.height = 150
    const tctx = thumb.getContext('2d')
    tctx.drawImage(canvas, 0, 0, 200, 150)
    return thumb.toDataURL('image/jpeg', 0.5)
  } catch {
    return null
  }
}
