'use client';

import { useState, useEffect, useRef } from 'react';
import { TocItem } from '@/lib/build-toc';

interface TableOfContentsProps {
  headings: TocItem[];
  isOpen: boolean;
  onClose: () => void;
}

export default function TableOfContents({ headings, isOpen, onClose }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const allItems: Array<{ id: string; text: string; depth: number }> = [
    { id: 'top', text: 'Introduction', depth: 2 },
    ...headings.flatMap((h) => [
      { id: h.id, text: h.text, depth: h.depth },
      ...h.children.map((c) => ({ id: c.id, text: c.text, depth: c.depth })),
    ]),
  ];

  useEffect(() => {
    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) {
          const topmost = visible.sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          )[0];
          setActiveId(topmost.target.id);
        }
      },
      { rootMargin: '-10% 0px -80% 0px', threshold: 0 }
    );
    allItems.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observerRef.current!.observe(el);
    });
    return () => observerRef.current?.disconnect();
  // deps: headings identity changes when post changes; allItems is derived inline
  // eslint-disable-next-line
  }, [headings]);

  const linkClass = (id: string, depth: number) =>
    [
      'block py-1 text-sm transition-colors duration-150 truncate',
      depth > 2 ? 'pl-4 text-xs' : 'pl-2',
      activeId === id
        ? 'text-primary-700 font-semibold border-l-2 border-primary-500 -ml-px'
        : 'text-neutral-500 hover:text-neutral-900 border-l-2 border-transparent -ml-px',
    ].join(' ');

  const navLinks = (
    <ul className="space-y-0.5 pl-px border-l border-neutral-200">
      {allItems.map(({ id, text, depth }) => (
        <li key={id}>
          <a href={`#${id}`} className={linkClass(id, depth)} onClick={isOpen ? onClose : undefined}>
            {text}
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {/* Desktop sticky sidebar */}
      <aside className="print:hidden hidden sm:flex flex-col sticky top-24 self-start w-52 shrink-0">
        <div className="flex items-center justify-between mb-3">
          {!collapsed && (
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">
              Contents
            </span>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand table of contents' : 'Collapse table of contents'}
            className="ml-auto p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        {!collapsed && navLinks}
      </aside>

      {/* Mobile bottom sheet */}
      {isOpen && (
        <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true" aria-label="Table of contents">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl px-5 pt-4 pb-8 max-h-[65vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-neutral-800">Contents</span>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-1 rounded text-neutral-400 hover:text-neutral-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {navLinks}
          </div>
        </div>
      )}
    </>
  );
}
