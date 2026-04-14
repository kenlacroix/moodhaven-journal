// File: /components/BlogPostClient.tsx
"use client";

import React, { ReactNode, useState } from "react";
import { motion } from "framer-motion";
import TableOfContents from "./TableOfContents";
import { TocItem } from "@/lib/build-toc";

interface BlogPostClientProps {
  title: string;
  publishDate?: string;
  mdx: ReactNode;
  heroImage: string;
  headings: TocItem[];
  accentColor?: string;
}

export default function BlogPostClient({
  title,
  publishDate,
  mdx,
  heroImage,
  headings,
  accentColor,
}: BlogPostClientProps) {
  const [tocOpen, setTocOpen] = useState(false);

  return (
    <>
      {/* Mobile “Contents” toggle */}
      <button
        onClick={() => setTocOpen(true)}
        className="fixed bottom-4 right-4 z-50 sm:hidden bg-white dark:bg-neutral-900 p-3 rounded-full shadow-md"
        aria-label="Show contents"
      >
        📑
      </button>

      <div className="flex flex-col sm:flex-row sm:items-start gap-8">
        <TableOfContents
          headings={headings}
          isOpen={tocOpen}
          onClose={() => setTocOpen(false)}
          accentColor={accentColor}
        />

        <div className="flex-1 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 rounded-xl shadow-sm py-8 px-4 sm:py-12 sm:px-6">
          {heroImage && (
            <motion.img
              src={heroImage}
              alt={title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1 }}
              className="rounded-xl shadow-sm my-6 mx-auto w-full max-w-2xl"
            />
          )}

          {/* jump target for “Introduction” */}
          <h1 id="top" className="scroll-mt-20 text-3xl font-bold mb-2">
            {title}
          </h1>

          <p className="text-neutral-500 text-sm mb-8">
            {publishDate && new Date(publishDate).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>

          <article
            id="content"
            className="
              prose prose-lg prose-neutral max-w-none dark:prose-invert
              prose-p:leading-relaxed
              print:mx-8 print:my-8 print:text-lg print:leading-relaxed
            "
          >
            {mdx}
          </article>

          {/* End-of-post CTA */}
          <div className="mt-12 pt-8 border-t border-neutral-100">
            <div className="bg-primary-50 rounded-xl p-6 text-center">
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2">Try MoodHaven Journal</p>
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
