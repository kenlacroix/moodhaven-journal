'use client';

import React, { ReactNode, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import TableOfContents from './TableOfContents';
import { TocItem } from '@/lib/build-toc';

interface AdjacentPost {
  slug: string;
  title: string;
}

interface BlogPostClientProps {
  title: string;
  publishDate?: string;
  readingTime: number;
  mdx: ReactNode;
  heroImage: string;
  headings: TocItem[];
  accentColor?: string;
  prevPost?: AdjacentPost;
  nextPost?: AdjacentPost;
}

export default function BlogPostClient({
  title,
  publishDate,
  readingTime,
  mdx,
  heroImage,
  headings,
  accentColor: _accentColor,
  prevPost,
  nextPost,
}: BlogPostClientProps) {
  const [tocOpen, setTocOpen] = useState(false);

  const formattedDate = publishDate
    ? new Date(publishDate).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <>
      {/* Mobile TOC trigger */}
      <button
        onClick={() => setTocOpen(true)}
        className="fixed bottom-5 right-5 z-40 sm:hidden w-11 h-11 flex items-center justify-center bg-white rounded-full shadow-lg ring-1 ring-neutral-200 text-neutral-600 hover:text-primary-700 hover:ring-primary-300 transition-colors"
        aria-label="Show table of contents"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h10M4 14h13M4 18h7" />
        </svg>
      </button>

      <div className="flex flex-col sm:flex-row sm:items-start gap-8 max-w-5xl mx-auto px-4 py-10">
        <TableOfContents
          headings={headings}
          isOpen={tocOpen}
          onClose={() => setTocOpen(false)}
        />

        <div className="flex-1 min-w-0 bg-white rounded-xl shadow-sm py-8 px-5 sm:py-12 sm:px-8">
          {/* Hero image */}
          {heroImage && (
            <motion.img
              src={heroImage}
              alt={title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="rounded-xl shadow-sm mb-8 w-full max-w-2xl mx-auto block"
            />
          )}

          {/* Title */}
          <h1 id="top" className="scroll-mt-20 text-2xl sm:text-3xl font-bold text-neutral-900 mb-3 leading-tight">
            {title}
          </h1>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400 mb-8 pb-6 border-b border-neutral-100">
            {formattedDate && <span>{formattedDate}</span>}
            <span aria-hidden="true">·</span>
            <span>{readingTime} min read</span>
            <span aria-hidden="true">·</span>
            <span>
              by{' '}
              <a
                href="https://www.kennethlacroix.me"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-700 hover:underline font-medium"
              >
                Ken LaCroix
              </a>
            </span>
          </div>

          {/* Article body */}
          <article
            id="content"
            className="prose prose-neutral max-w-none
              prose-p:leading-relaxed
              prose-a:text-primary-700 prose-a:no-underline hover:prose-a:underline
              prose-headings:font-semibold
              print:mx-8 print:my-8"
          >
            {mdx}
          </article>

          {/* Prev / next navigation */}
          {(prevPost || nextPost) && (
            <nav
              aria-label="Post navigation"
              className="mt-10 pt-8 border-t border-neutral-100 grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              {prevPost ? (
                <Link
                  href={`/blog/${prevPost.slug}`}
                  className="group flex flex-col gap-1 rounded-xl p-4 ring-1 ring-neutral-100 hover:ring-primary-200 hover:shadow-sm transition-all"
                >
                  <span className="text-xs text-neutral-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Previous post
                  </span>
                  <span className="text-sm font-medium text-neutral-800 group-hover:text-primary-700 transition-colors line-clamp-2">
                    {prevPost.title}
                  </span>
                </Link>
              ) : <div />}

              {nextPost ? (
                <Link
                  href={`/blog/${nextPost.slug}`}
                  className="group flex flex-col items-end gap-1 rounded-xl p-4 ring-1 ring-neutral-100 hover:ring-primary-200 hover:shadow-sm transition-all"
                >
                  <span className="text-xs text-neutral-400 flex items-center gap-1">
                    Next post
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                  <span className="text-sm font-medium text-neutral-800 group-hover:text-primary-700 transition-colors line-clamp-2 text-right">
                    {nextPost.title}
                  </span>
                </Link>
              ) : <div />}
            </nav>
          )}

          {/* End-of-post CTA */}
          <div className="mt-10 pt-8 border-t border-neutral-100">
            <div className="bg-primary-50 rounded-xl p-6 text-center">
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">
                Try MoodHaven Journal
              </p>
              <p className="text-sm text-neutral-600 leading-relaxed mb-5 max-w-sm mx-auto">
                Free, open-source, and private. Your journal stays on your device — always encrypted, never shared.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <a
                  href="https://journal.moodhaven.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-primary-700 text-white px-5 py-2.5 text-sm font-semibold hover:bg-primary-800 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/60"
                >
                  Open in Browser <span aria-hidden="true">→</span>
                </a>
                <a
                  href="/download"
                  className="rounded-full bg-white text-primary-700 px-5 py-2.5 text-sm font-semibold border border-primary-200 hover:bg-primary-50 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/60"
                >
                  Download for Desktop <span aria-hidden="true">↓</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
