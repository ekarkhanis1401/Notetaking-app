import { useState } from 'react';
import {
  Plus,
  Search,
  Trash2,
  FileText,
  Menu,
  ChevronLeft,
  X,
} from 'lucide-react';
import { useNotesStore } from '../store/notesStore';
import type { Note } from '../types';

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

function getContentPreview(html: string): string {
  if (!html) return 'No additional text';
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 80) || 'No additional text';
}

interface NoteCardProps {
  note: Note;
  isSelected: boolean;
  subjectColor: string;
  onSelect: () => void;
  onDelete: () => void;
  confirmingDelete: boolean;
}

function NoteCard({ note, isSelected, subjectColor, onSelect, onDelete, confirmingDelete }: NoteCardProps) {
  return (
    <div
      className={`
        mx-2 mb-1.5 rounded-xl cursor-pointer transition-all duration-150
        border animate-fade-in
        ${isSelected
          ? 'bg-white shadow-note border-blue-200'
          : 'bg-white/60 hover:bg-white border-transparent hover:border-gray-200 hover:shadow-note'
        }
      `}
      onPointerDown={onSelect}
    >
      <div className="px-3.5 py-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className={`font-semibold text-sm leading-tight flex-1 min-w-0 truncate ${
            isSelected ? 'text-gray-900' : 'text-gray-800'
          }`}>
            {note.title || 'Untitled Note'}
          </h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs text-gray-400">{formatDate(note.updatedAt)}</span>
            <button
              className={`p-1 rounded-md transition-all ${
                confirmingDelete
                  ? 'text-red-500 bg-red-50'
                  : 'text-gray-300 hover:text-red-400 hover:bg-red-50 active:scale-95'
              }`}
              onPointerDown={e => { e.stopPropagation(); onDelete(); }}
              aria-label={confirmingDelete ? 'Confirm delete' : 'Delete note'}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Preview */}
        <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
          {getContentPreview(note.content)}
        </p>

        {/* Bottom: strokes indicator */}
        {note.strokes.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: subjectColor }}
            />
            <span className="text-xs text-gray-400">
              {note.strokes.length} drawing{note.strokes.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NotesList() {
  const {
    selectedSubjectId,
    selectedNoteId,
    searchQuery,
    subjects,
    addNote,
    deleteNote,
    selectNote,
    setSearchQuery,
    toggleSidebar,
    selectSubject,
    getFilteredNotes,
    getSelectedSubject,
  } = useNotesStore();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState('');

  const selectedSubject = getSelectedSubject();
  const notes = getFilteredNotes();

  const handleAddNote = () => {
    if (!selectedSubjectId) return;
    addNote(selectedSubjectId);
  };

  const handleDeleteNote = (id: string) => {
    if (deletingId === id) {
      deleteNote(id);
      setDeletingId(null);
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
    }
  };

  const handleSelectNote = (note: Note) => {
    selectNote(note.id);
  };

  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    setSearchQuery(value);
  };

  const getSubjectColor = (subjectId: string) => {
    return subjects.find(s => s.id === subjectId)?.color ?? '#8395A7';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-3 pt-4 pb-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2 mb-3">
          {/* Sidebar toggle */}
          <button
            className="p-2 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors"
            onPointerDown={toggleSidebar}
            aria-label="Toggle sidebar"
          >
            <Menu className="w-4 h-4 text-gray-600" />
          </button>

          {/* Back button on mobile when viewing notes list */}
          <button
            className="p-2 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors md:hidden"
            onPointerDown={() => selectSubject(null)}
            aria-label="Back to subjects"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>

          <div className="flex-1 min-w-0">
            {selectedSubject ? (
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: selectedSubject.color }}
                />
                <h2 className="font-semibold text-gray-900 text-base truncate">
                  {selectedSubject.name}
                </h2>
              </div>
            ) : (
              <h2 className="font-semibold text-gray-900 text-base">All Notes</h2>
            )}
          </div>

          {selectedSubjectId && (
            <button
              className="p-2 rounded-xl bg-blue-500 hover:bg-blue-600 active:bg-blue-700 active:scale-95 transition-all shadow-sm"
              onPointerDown={handleAddNote}
              aria-label="New note"
            >
              <Plus className="w-4 h-4 text-white" />
            </button>
          )}
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            value={localSearch}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg text-sm pl-8 pr-8 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors placeholder-gray-400"
          />
          {localSearch && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onPointerDown={() => handleSearchChange('')}
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto py-2">
        {!selectedSubjectId ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-200 flex items-center justify-center mb-3">
              <FileText className="w-7 h-7 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600 mb-1">Select a subject</p>
            <p className="text-xs text-gray-400">Choose a subject from the sidebar to view notes</p>
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-200 flex items-center justify-center mb-3">
              <FileText className="w-7 h-7 text-gray-400" />
            </div>
            {searchQuery ? (
              <>
                <p className="text-sm font-medium text-gray-600 mb-1">No results</p>
                <p className="text-xs text-gray-400">Try a different search term</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-600 mb-1">No notes yet</p>
                <p className="text-xs text-gray-400 mb-3">Tap + to create your first note</p>
                <button
                  className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium active:scale-95 transition-transform"
                  onPointerDown={handleAddNote}
                >
                  New Note
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {notes.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                isSelected={selectedNoteId === note.id}
                subjectColor={getSubjectColor(note.subjectId)}
                onSelect={() => handleSelectNote(note)}
                onDelete={() => handleDeleteNote(note.id)}
                confirmingDelete={deletingId === note.id}
              />
            ))}
            <div className="h-4" />
          </>
        )}
      </div>

      {/* Note count footer */}
      {notes.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-400 text-center">
            {notes.length} note{notes.length !== 1 ? 's' : ''}
            {searchQuery ? ` matching "${searchQuery}"` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
