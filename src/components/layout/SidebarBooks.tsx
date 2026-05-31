import { useBooksStore } from '../../stores/booksStore';
import { NewBookModal } from '../books/NewBookModal';
import type { ViewType } from './Sidebar';

interface SidebarBooksProps {
  currentView: ViewType;
  collapsed: boolean;
  onNavigate: (view: ViewType) => void;
  onNavigateToJournalOverview?: (bookId: string) => void;
  showNewBookModal: boolean;
  onOpenNewBookModal: () => void;
  onCloseNewBookModal: () => void;
}

export function SidebarBooks({
  currentView,
  collapsed,
  onNavigate,
  onNavigateToJournalOverview,
  showNewBookModal,
  onOpenNewBookModal,
  onCloseNewBookModal,
}: SidebarBooksProps) {
  const { books, activeBookId, setActiveBook, addBook } = useBooksStore();

  return (
    <>
      <div className="flex-1 px-3 py-2 overflow-y-auto border-t border-slate-100 dark:border-slate-800">
        {!collapsed && (
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
              My Books
            </span>
            <button
              type="button"
              onClick={onOpenNewBookModal}
              title="New book"
              className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        )}

        <div className="space-y-0.5">
          {currentView === 'timeline' && books.length > 1 && (
            <button
              type="button"
              onClick={() => { setActiveBook(null); onNavigate('timeline'); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                activeBookId === null
                  ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 font-medium'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title={collapsed ? 'All books' : undefined}
            >
              <span className="w-4 text-center text-sm flex-shrink-0">📚</span>
              {!collapsed && <span className="truncate">All books</span>}
            </button>
          )}

          {books.map((book) => (
            <button
              key={book.id}
              type="button"
              onClick={() => {
                if (onNavigateToJournalOverview) {
                  onNavigateToJournalOverview(book.id);
                } else {
                  setActiveBook(book.id);
                  onNavigate('timeline');
                }
              }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                currentView === 'journalOverview' && activeBookId === book.id
                  ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 font-medium'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title={collapsed ? book.name : undefined}
            >
              <span className="w-4 text-center text-sm flex-shrink-0">{book.emoji}</span>
              {!collapsed && <span className="truncate">{book.name}</span>}
            </button>
          ))}
        </div>
      </div>

      {showNewBookModal && (
        <NewBookModal
          onClose={onCloseNewBookModal}
          onCreate={async (name, emoji, color, description, settings) => {
            await addBook(name, emoji, color, description, settings);
          }}
        />
      )}
    </>
  );
}
