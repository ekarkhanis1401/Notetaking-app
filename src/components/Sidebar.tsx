import { useState, useRef, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  ChevronRight,
  Search,
  X,
  Edit2,
  Check,
  Menu,
} from 'lucide-react';
import { useNotesStore } from '../store/notesStore';
import { SUBJECT_COLORS } from '../types';
import type { Subject } from '../types';

export default function Sidebar() {
  const {
    subjects,
    selectedSubjectId,
    searchQuery,
    addSubject,
    updateSubject,
    deleteSubject,
    selectSubject,
    setSearchQuery,
    toggleSidebar,
    getNotesForSubject,
  } = useNotesStore();

  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  const newSubjectInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAddingSubject && newSubjectInputRef.current) {
      newSubjectInputRef.current.focus();
    }
  }, [isAddingSubject]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleAddSubject = () => {
    const name = newSubjectName.trim();
    if (!name) {
      setIsAddingSubject(false);
      setNewSubjectName('');
      return;
    }
    const subject = addSubject(name);
    selectSubject(subject.id);
    setIsAddingSubject(false);
    setNewSubjectName('');
  };

  const handleStartEdit = (subject: Subject) => {
    setEditingId(subject.id);
    setEditingName(subject.name);
    setShowColorPicker(null);
  };

  const handleSaveEdit = () => {
    if (editingId && editingName.trim()) {
      updateSubject(editingId, { name: editingName.trim() });
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleDeleteSubject = (id: string) => {
    if (deletingId === id) {
      deleteSubject(id);
      setDeletingId(null);
    } else {
      setDeletingId(id);
      // Auto-cancel after 3 seconds
      setTimeout(() => setDeletingId(null), 3000);
    }
  };

  const handleSelectSubject = (id: string) => {
    selectSubject(id);
    // Close sidebar on mobile/iPad
    if (window.innerWidth < 1024) {
      toggleSidebar();
    }
  };

  return (
    <div className="flex flex-col h-full bg-sidebar-bg text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-400" />
          <span className="font-semibold text-base">Notes</span>
        </div>
        <button
          className="p-1.5 rounded-lg hover:bg-sidebar-hover active:bg-sidebar-active transition-colors lg:hidden"
          onPointerDown={toggleSidebar}
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
        <button
          className="p-1.5 rounded-lg hover:bg-sidebar-hover active:bg-sidebar-active transition-colors hidden lg:block"
          onPointerDown={toggleSidebar}
          aria-label="Toggle sidebar"
        >
          <Menu className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-3 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-sidebar-hover text-white placeholder-gray-500 text-sm rounded-lg pl-8 pr-3 py-2 outline-none focus:ring-1 focus:ring-blue-500/50 border border-transparent focus:border-blue-500/30"
          />
          {searchQuery && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onPointerDown={() => setSearchQuery('')}
            >
              <X className="w-3.5 h-3.5 text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {/* Subjects list */}
      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-3 pb-1 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Subjects
          </span>
          <button
            className="p-1 rounded-md hover:bg-sidebar-hover active:bg-sidebar-active transition-colors"
            onPointerDown={() => {
              setIsAddingSubject(true);
              setShowColorPicker(null);
              setEditingId(null);
            }}
            aria-label="Add subject"
          >
            <Plus className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>

        {/* New subject input */}
        {isAddingSubject && (
          <div className="mx-2 mb-1 animate-fade-in">
            <div className="flex items-center gap-2 bg-sidebar-hover rounded-lg px-3 py-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-400 flex-shrink-0" />
              <input
                ref={newSubjectInputRef}
                type="text"
                placeholder="Subject name..."
                value={newSubjectName}
                onChange={e => setNewSubjectName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddSubject();
                  if (e.key === 'Escape') {
                    setIsAddingSubject(false);
                    setNewSubjectName('');
                  }
                }}
                onBlur={handleAddSubject}
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-500"
                maxLength={50}
              />
            </div>
          </div>
        )}

        {/* Subject items */}
        {subjects.length === 0 && !isAddingSubject && (
          <div className="px-4 py-6 text-center">
            <p className="text-gray-500 text-sm">No subjects yet.</p>
            <p className="text-gray-600 text-xs mt-1">Tap + to create one</p>
          </div>
        )}

        {subjects.map(subject => {
          const noteCount = getNotesForSubject(subject.id).length;
          const isSelected = selectedSubjectId === subject.id;
          const isEditing = editingId === subject.id;
          const isDeleting = deletingId === subject.id;

          return (
            <div key={subject.id} className="mx-2 mb-0.5 animate-fade-in">
              <div
                className={`
                  flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer
                  transition-colors duration-100 group
                  ${isSelected
                    ? 'bg-sidebar-active'
                    : 'hover:bg-sidebar-hover active:bg-sidebar-active'
                  }
                `}
                onPointerDown={() => !isEditing && handleSelectSubject(subject.id)}
              >
                {/* Color dot - tap to change color */}
                <button
                  className="flex-shrink-0 w-3 h-3 rounded-full border-2 border-transparent hover:border-white/50 transition-all"
                  style={{ backgroundColor: subject.color }}
                  onPointerDown={e => {
                    e.stopPropagation();
                    setShowColorPicker(showColorPicker === subject.id ? null : subject.id);
                  }}
                  aria-label="Change color"
                />

                {/* Name / edit input */}
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveEdit();
                      if (e.key === 'Escape') { setEditingId(null); setEditingName(''); }
                    }}
                    onBlur={handleSaveEdit}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 bg-transparent text-white text-sm outline-none"
                    maxLength={50}
                  />
                ) : (
                  <span className="flex-1 text-sm text-gray-100 truncate leading-tight">
                    {subject.name}
                  </span>
                )}

                {/* Note count */}
                {!isEditing && (
                  <span className="text-xs text-gray-500 flex-shrink-0">{noteCount}</span>
                )}

                {/* Actions */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {isEditing ? (
                    <button
                      className="p-1 rounded hover:bg-white/10"
                      onPointerDown={e => { e.stopPropagation(); handleSaveEdit(); }}
                    >
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    </button>
                  ) : (
                    <>
                      <button
                        className="p-1 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        onPointerDown={e => { e.stopPropagation(); handleStartEdit(subject); }}
                        aria-label="Rename subject"
                      >
                        <Edit2 className="w-3 h-3 text-gray-400" />
                      </button>
                      <button
                        className={`p-1 rounded hover:bg-white/10 transition-opacity ${
                          isDeleting
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100'
                        }`}
                        onPointerDown={e => { e.stopPropagation(); handleDeleteSubject(subject.id); }}
                        aria-label={isDeleting ? 'Confirm delete' : 'Delete subject'}
                      >
                        <Trash2 className={`w-3 h-3 ${isDeleting ? 'text-red-400' : 'text-gray-400'}`} />
                      </button>
                    </>
                  )}
                </div>

                {isSelected && !isEditing && (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                )}
              </div>

              {/* Color picker */}
              {showColorPicker === subject.id && (
                <div className="mx-2 mt-1 mb-1 p-2 bg-sidebar-hover rounded-lg flex flex-wrap gap-1.5 animate-fade-in">
                  {SUBJECT_COLORS.map(color => (
                    <button
                      key={color}
                      className={`w-5 h-5 rounded-full border-2 transition-transform active:scale-90 ${
                        subject.color === color
                          ? 'border-white scale-110'
                          : 'border-transparent hover:border-white/50'
                      }`}
                      style={{ backgroundColor: color }}
                      onPointerDown={e => {
                        e.stopPropagation();
                        updateSubject(subject.id, { color });
                        setShowColorPicker(null);
                      }}
                      aria-label={`Color ${color}`}
                    />
                  ))}
                </div>
              )}

              {/* Delete confirmation */}
              {isDeleting && (
                <div className="mx-2 mt-0.5 mb-1 px-3 py-1.5 bg-red-900/40 rounded-lg animate-fade-in">
                  <p className="text-xs text-red-300">
                    Tap trash again to delete &ldquo;{subject.name}&rdquo; and all its notes.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/10">
        <p className="text-xs text-gray-600 text-center">
          {subjects.length} subject{subjects.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}
