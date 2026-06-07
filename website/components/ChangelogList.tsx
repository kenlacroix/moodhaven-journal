'use client';
import { useState } from 'react';

interface Section { heading: string; items: string[]; }
export interface Release { version: string; date: string; sections: Section[]; forContributors?: string[]; }

const SECTION_COLORS: Record<string, string> = {
  Added: 'text-emerald-700 bg-emerald-50',
  Fixed: 'text-amber-700 bg-amber-50',
  Changed: 'text-blue-700 bg-blue-50',
  Security: 'text-violet-700 bg-violet-50',
  Removed: 'text-red-700 bg-red-50',
  Deprecated: 'text-orange-700 bg-orange-50',
};

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold text-neutral-800">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="font-mono text-xs bg-neutral-100 text-neutral-700 px-1 py-0.5 rounded">{part.slice(1, -1)}</code>;
    return part;
  });
}

const INITIAL_VISIBLE = 3;

export default function ChangelogList({ releases }: { releases: Release[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? releases : releases.slice(0, INITIAL_VISIBLE);
  const hidden = releases.length - INITIAL_VISIBLE;

  return (
    <>
      <div className="space-y-10">
        {visible.map((release) => (
          <article
            key={release.version}
            id={`v${release.version}`}
            className="bg-white/90 rounded-xl ring-1 ring-neutral-100 overflow-hidden scroll-mt-20"
          >
            <div className="flex items-baseline justify-between gap-4 px-6 py-4 border-b border-neutral-100">
              <h2 className="text-lg font-bold text-neutral-900">v{release.version}</h2>
              {release.date && (
                <time dateTime={release.date} className="text-xs text-neutral-400 shrink-0">
                  {new Date(release.date).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
                  })}
                </time>
              )}
            </div>
            <div className="px-6 py-5 space-y-6">
              {release.sections.filter((s) => s.items.length > 0).map((section) => {
                const colorClass = SECTION_COLORS[section.heading] ?? 'text-neutral-700 bg-neutral-100';
                return (
                  <div key={section.heading}>
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded mb-3 ${colorClass}`}>
                      {section.heading}
                    </span>
                    <ul className="space-y-2">
                      {section.items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-700 leading-relaxed">
                          <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-neutral-300" aria-hidden="true" />
                          <span>{renderInline(item)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      {!showAll && hidden > 0 && (
        <div className="mt-8 text-center">
          <button
            onClick={() => setShowAll(true)}
            className="text-sm font-medium text-primary-700 hover:text-primary-900 underline underline-offset-2 transition-colors duration-150"
          >
            Show full history ({hidden} older {hidden === 1 ? 'release' : 'releases'})
          </button>
        </div>
      )}
    </>
  );
}
