import { useEffect, useRef } from 'react';
import { useNotesStore } from '../store/notesStore';

/**
 * Auto-saves note content after a debounce period.
 * Zustand's persist middleware handles the actual localStorage write,
 * so this hook just ensures frequent updates don't hammer state.
 */
export function useAutoSave(noteId: string | null, content: string, debounceMs = 800) {
  const updateNote = useNotesStore(state => state.updateNote);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');

  useEffect(() => {
    if (!noteId) return;
    if (content === lastSavedRef.current) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      updateNote(noteId, { content });
      lastSavedRef.current = content;
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [noteId, content, debounceMs, updateNote]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current && noteId && lastSavedRef.current !== content) {
        clearTimeout(timerRef.current);
        updateNote(noteId, { content });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);
}
