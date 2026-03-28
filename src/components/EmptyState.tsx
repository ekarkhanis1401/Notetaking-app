import { BookOpen, PenLine } from 'lucide-react';

interface EmptyStateProps {
  hasSubject?: boolean;
}

export default function EmptyState({ hasSubject }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center h-full text-center p-8 bg-[#FFFEF7]">
      <div className="mb-6 rounded-full bg-blue-50 p-6">
        {hasSubject ? (
          <PenLine className="w-12 h-12 text-blue-400" />
        ) : (
          <BookOpen className="w-12 h-12 text-blue-400" />
        )}
      </div>
      <h2 className="text-2xl font-semibold text-gray-700 mb-2">
        {hasSubject ? 'No note selected' : 'No subject selected'}
      </h2>
      <p className="text-gray-400 text-base max-w-xs">
        {hasSubject
          ? 'Select a note from the list, or tap + to create a new one.'
          : 'Choose a subject from the sidebar, or create one to get started.'}
      </p>
    </div>
  );
}
