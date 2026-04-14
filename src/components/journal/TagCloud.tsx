interface TagCloudProps {
  tags: [string, number][];
  activeTag: string | null;
  onSelect: (tag: string | null) => void;
  isAndroid?: boolean;
}

export function TagCloud({ tags, activeTag, onSelect, isAndroid = false }: TagCloudProps) {
  if (tags.length === 0) return null;

  return (
    <div className={`flex gap-2 mb-6 overflow-x-auto pb-1 ${isAndroid ? 'px-4 flex-nowrap' : 'flex-wrap'}`}>
      {tags.map(([tag, count]) => {
        const isActive = activeTag === tag;
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onSelect(isActive ? null : tag)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-150 ${
              isActive
                ? 'bg-violet-500 text-white ring-2 ring-violet-300 dark:ring-violet-700'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span className={`text-xs ${isActive ? 'text-violet-200' : 'text-slate-400 dark:text-slate-500'}`}>#</span>
            {tag}
            <span className={`text-xs ${isActive ? 'text-violet-200' : 'text-slate-400 dark:text-slate-500'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
