export interface Point {
  x: number;
  y: number;
  pressure: number;
}

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
  tool: 'pen' | 'highlighter' | 'eraser';
  opacity: number;
}

export interface Subject {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Note {
  id: string;
  subjectId: string;
  title: string;
  content: string; // HTML from Tiptap
  strokes: Stroke[];
  createdAt: string;
  updatedAt: string;
}

export type DrawingTool = 'pen' | 'highlighter' | 'eraser';

export type PenThickness = 'thin' | 'medium' | 'thick';

export interface DrawingSettings {
  tool: DrawingTool;
  color: string;
  thickness: PenThickness;
}

export type EditorMode = 'text' | 'draw';

export const SUBJECT_COLORS = [
  '#FF6B6B', // red
  '#FF9F43', // orange
  '#FECA57', // yellow
  '#48DBFB', // cyan
  '#54A0FF', // blue
  '#5F27CD', // purple
  '#1DD1A1', // green
  '#FF9FF3', // pink
  '#C8D6E5', // gray-blue
  '#8395A7', // gray
];

export const PEN_COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Blue', value: '#1E3A8A' },
  { name: 'Red', value: '#DC2626' },
  { name: 'Green', value: '#16A34A' },
  { name: 'Orange', value: '#EA580C' },
  { name: 'Purple', value: '#7C3AED' },
];

export const HIGHLIGHTER_COLORS = [
  { name: 'Yellow', value: '#FEF08A' },
  { name: 'Green', value: '#BBF7D0' },
  { name: 'Blue', value: '#BAE6FD' },
  { name: 'Pink', value: '#FBCFE8' },
  { name: 'Orange', value: '#FED7AA' },
  { name: 'Purple', value: '#E9D5FF' },
];

export const THICKNESS_VALUES: Record<PenThickness, number> = {
  thin: 1.5,
  medium: 3,
  thick: 6,
};

export const HIGHLIGHTER_THICKNESS_VALUES: Record<PenThickness, number> = {
  thin: 8,
  medium: 16,
  thick: 24,
};
