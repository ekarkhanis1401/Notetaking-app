import { useEffect } from 'react';
import { useNotesStore } from './store/notesStore';
import Sidebar from './components/Sidebar';
import NotesList from './components/NotesList';
import NoteEditor from './components/NoteEditor';
import EmptyState from './components/EmptyState';

export default function App() {
  const {
    selectedNoteId,
    selectedSubjectId,
    sidebarOpen,
    setSidebarOpen,
  } = useNotesStore();

  // Responsive: close sidebar on small screens when a note is selected
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setSidebarOpen]);

  const showEditor = !!selectedNoteId;
  const showNotesList = !!selectedSubjectId;

  // On small screens (< 768px), show panels one at a time
  // On iPad (768-1024px), show notes list + editor, collapsible sidebar
  // On large screens (>= 1024px), show all three panels

  return (
    <div className="flex h-full w-full overflow-hidden bg-gray-100">
      {/* Sidebar overlay for mobile/iPad */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onPointerDown={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-30 w-64
          lg:relative lg:z-auto lg:translate-x-0
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <Sidebar />
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 min-w-0 h-full overflow-hidden">
        {/* Notes List Panel */}
        <div
          className={`
            ${showEditor ? 'hidden md:flex' : 'flex'}
            w-full md:w-72 lg:w-80 xl:w-96
            flex-shrink-0 border-r border-gray-200 bg-gray-50
            flex-col h-full
          `}
        >
          <NotesList />
        </div>

        {/* Editor / Empty State Panel */}
        <div className="flex-1 min-w-0 h-full flex flex-col bg-paper">
          {showEditor ? (
            <NoteEditor />
          ) : (
            <EmptyState hasSubject={showNotesList} />
          )}
        </div>
      </div>
    </div>
  );
}
