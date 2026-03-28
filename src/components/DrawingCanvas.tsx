import { useRef, useEffect, useCallback, useState } from 'react';
import { useNotesStore } from '../store/notesStore';
import { v4 as uuidv4 } from 'uuid';
import type { Point, Stroke } from '../types';
import { THICKNESS_VALUES, HIGHLIGHTER_THICKNESS_VALUES } from '../types';

interface DrawingCanvasProps {
  noteId: string;
  strokes: Stroke[];
}

export default function DrawingCanvas({ noteId, strokes }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Point[]>([]);
  const currentStrokeIdRef = useRef<string>('');
  const rafRef = useRef<number | null>(null);
  const lastPointRef = useRef<Point | null>(null);

  const { drawingSettings, addStroke, undoLastStroke } = useNotesStore();
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Get canvas 2D context
  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext('2d');
  }, []);

  // Draw a single stroke on the canvas
  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length < 2) {
      // Single dot
      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        ctx.beginPath();
        ctx.arc(p.x, p.y, stroke.width / 2, 0, Math.PI * 2);
        ctx.fillStyle = stroke.tool === 'eraser' ? '#FFFEF7' : stroke.color;
        ctx.globalAlpha = stroke.opacity;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      return;
    }

    ctx.save();
    ctx.globalAlpha = stroke.opacity;
    ctx.strokeStyle = stroke.tool === 'eraser' ? '#FFFEF7' : stroke.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
    } else if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    // Use quadratic curves for smooth strokes
    for (let i = 1; i < stroke.points.length - 1; i++) {
      const p1 = stroke.points[i];
      const p2 = stroke.points[i + 1];
      const pressure = p1.pressure > 0 ? p1.pressure : 0.5;

      // Vary line width with pressure
      const baseWidth = stroke.width;
      const pressureWidth = baseWidth * (0.5 + pressure * 0.8);
      ctx.lineWidth = Math.max(0.5, pressureWidth);

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
    }

    // Last segment
    const last = stroke.points[stroke.points.length - 1];
    const secondLast = stroke.points[stroke.points.length - 2];
    ctx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y);

    ctx.stroke();
    ctx.restore();
  }, []);

  // Redraw all strokes
  const redrawAll = useCallback(() => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokes) {
      drawStroke(ctx, stroke);
    }
  }, [strokes, drawStroke, getCtx]);

  // Handle canvas resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });

    observer.observe(container);

    // Initial size
    const rect = container.getBoundingClientRect();
    setCanvasSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });

    return () => observer.disconnect();
  }, []);

  // Apply canvas size and redraw when size changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasSize.width === 0 || canvasSize.height === 0) return;

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    redrawAll();
  }, [canvasSize, redrawAll]);

  // Redraw when strokes change
  useEffect(() => {
    redrawAll();
  }, [strokes, redrawAll]);

  // Get point from pointer event relative to canvas
  const getPoint = useCallback((e: PointerEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    };
  }, []);

  // Draw current in-progress stroke on top
  const drawCurrentStroke = useCallback(() => {
    if (currentStrokeRef.current.length < 1) return;

    const ctx = getCtx();
    if (!ctx) return;

    // Redraw all first
    redrawAll();

    // Draw current stroke
    const { tool, color, thickness } = drawingSettings;
    const thicknessMap = tool === 'highlighter' ? HIGHLIGHTER_THICKNESS_VALUES : THICKNESS_VALUES;
    const baseWidth = thicknessMap[thickness];
    const opacity = tool === 'highlighter' ? 0.4 : 1;

    const tempStroke: Stroke = {
      id: currentStrokeIdRef.current,
      points: currentStrokeRef.current,
      color: tool === 'eraser' ? '#FFFEF7' : color,
      width: baseWidth,
      tool,
      opacity,
    };

    drawStroke(ctx, tempStroke);
  }, [drawStroke, redrawAll, getCtx, drawingSettings]);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.button !== 0 && e.button !== undefined && e.pointerType !== 'touch' && e.pointerType !== 'pen') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    currentStrokeIdRef.current = uuidv4();
    currentStrokeRef.current = [];
    lastPointRef.current = null;

    const point = getPoint(e);
    currentStrokeRef.current.push(point);
    lastPointRef.current = point;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(drawCurrentStroke);
  }, [getPoint, drawCurrentStroke]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();

    const point = getPoint(e);

    // Minimum distance threshold to avoid too many points
    if (lastPointRef.current) {
      const dx = point.x - lastPointRef.current.x;
      const dy = point.y - lastPointRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1.5) return;
    }

    currentStrokeRef.current.push(point);
    lastPointRef.current = point;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(drawCurrentStroke);
  }, [getPoint, drawCurrentStroke]);

  const handlePointerUp = useCallback((_e: PointerEvent) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const points = currentStrokeRef.current;
    if (points.length === 0) return;

    const { tool, color, thickness } = drawingSettings;
    const thicknessMap = tool === 'highlighter' ? HIGHLIGHTER_THICKNESS_VALUES : THICKNESS_VALUES;
    const baseWidth = thicknessMap[thickness];
    const opacity = tool === 'highlighter' ? 0.4 : 1;

    const stroke: Stroke = {
      id: currentStrokeIdRef.current,
      points,
      color: tool === 'eraser' ? '#FFFEF7' : color,
      width: baseWidth,
      tool,
      opacity,
    };

    addStroke(noteId, stroke);
    currentStrokeRef.current = [];
    currentStrokeIdRef.current = '';
    lastPointRef.current = null;
  }, [drawingSettings, addStroke, noteId]);

  // Attach pointer events directly to canvas element
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
    canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerUp);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp]);

  // Keyboard undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        undoLastStroke(noteId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [noteId, undoLastStroke]);

  const getCursorClass = () => {
    if (drawingSettings.tool === 'eraser') return 'eraser-cursor';
    return 'drawing-canvas';
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 ${getCursorClass()}`}
        style={{
          touchAction: 'none',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
