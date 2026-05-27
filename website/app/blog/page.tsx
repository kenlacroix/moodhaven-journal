// app/blog/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { BookOpen, ArrowRight } from "lucide-react";
import { getAllPosts } from "@/lib/posts";
import NewsletterSignup from "@/components/NewsletterSignup";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Writing about privacy-first software, local-first design, open source, and what we're building with MoodHaven Journal.",
  alternates: { canonical: "https://www.moodhaven.app/blog" },
  openGraph: {
    title: "Blog — MoodHaven Journal",
    description:
      "Writing about privacy-first software, local-first design, and what we're building.",
    url: "https://www.moodhaven.app/blog",
    type: "website",
  },
};

interface PostMeta {
  slug: string;
  title: string;
  publishDate?: string;
  excerpt: string;
  heroImage: string;
  draft?: boolean;
  published?: boolean;
}

export default async function BlogIndex() {
  const todayISO = new Date().toISOString().slice(0, 10);

  const posts: PostMeta[] = getAllPosts()
    .filter((post: PostMeta) => {
      if (post.draft === true) return false;
      if (post.published === false) return false;
      if (post.publishDate && post.publishDate.slice(0, 10) > todayISO) return false;
      return true;
    })
    .sort((a, b) => {
      const dateA = a.publishDate ? new Date(a.publishDate) : new Date(0);
      const dateB = b.publishDate ? new Date(b.publishDate) : new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

  return (
    <main id="main-content" className="bg-[var(--background)] px-4 pt-12 pb-20">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-12">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3">Writing</p>
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-3">Blog</h1>
          <p className="text-neutral-500 text-base max-w-lg">
            Thoughts on privacy-first software, local-first design, and what we&apos;re building.
          </p>
        </div>

        {/* Featured external post */}
        <a
          href="https://www.kennethlacroix.me/post/seven-months-of-vibe-coding-how-i-built-a-privacy-first-journal-app-with-an-ai-pair-programmer"
          target="_blank"
          rel="noopener noreferrer"
          className="group block mb-10 bg-gradient-to-br from-primary-50 to-white rounded-xl ring-1 ring-primary-100 hover:ring-primary-300 hover:shadow-md hover:shadow-primary-100/60 transition-all duration-200 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
        >
          <div className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-primary-600 bg-primary-100 rounded-full px-2.5 py-0.5">
                Founder&apos;s story
              </span>
              <span className="text-xs text-neutral-400">kennethlacroix.me</span>
            </div>
            <h2 className="text-lg font-semibold text-neutral-900 group-hover:text-primary-700 transition-colors leading-snug mb-2">
              Seven Months of Vibe Coding: How I Built a Privacy-First Journal App with an AI Pair Programmer
            </h2>
            <p className="text-sm text-neutral-500 leading-relaxed mb-4">
              The full story behind MoodHaven — the security decisions, the peer sync rabbit hole, the Wear OS companion, and what building with an AI pair programmer actually looks like in practice.
            </p>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 group-hover:gap-2 transition-all">
              Read on kennethlacroix.me <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </span>
          </div>
        </a>

        {posts.length > 0 ? (
          <div className="space-y-6">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block bg-white/90 rounded-xl ring-1 ring-neutral-100 overflow-hidden hover:ring-primary-200 hover:shadow-md hover:shadow-neutral-200/50 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
              >
                <div className="flex flex-col sm:flex-row">
                  {post.heroImage && (
                    <div className="sm:w-48 sm:flex-shrink-0 h-40 sm:h-auto relative overflow-hidden bg-primary-50">
                      <Image
                        src={post.heroImage}
                        alt={post.title}
                        fill
                        sizes="(max-width: 640px) 100vw, 192px"
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  <div className="p-5 flex flex-col justify-between gap-3 flex-1">
                    <div>
                      {post.publishDate && (
                        <p className="text-xs text-neutral-400 mb-2 font-medium">
                          {format(new Date(post.publishDate), "MMMM d, yyyy")}
                        </p>
                      )}
                      <h2 className="text-base font-semibold text-neutral-900 group-hover:text-primary-700 transition-colors leading-snug mb-2">
                        {post.title}
                      </h2>
                      {post.excerpt && (
                        <p className="text-sm text-neutral-500 leading-relaxed line-clamp-2">
                          {post.excerpt}
                        </p>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 group-hover:gap-2 transition-all">
                      Read post <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-primary-50 rounded-2xl px-6 py-12 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-primary-600" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 mb-1">No posts yet</h2>
              <p className="text-sm text-neutral-600 leading-relaxed max-w-sm">
                We write about privacy-first software, local-first design, and what we&apos;re building.
                New posts land on Substack first.
              </p>
            </div>
            <a
              href="https://moodhaven.substack.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-white text-primary-700 px-6 py-3 text-sm font-semibold shadow hover:bg-primary-100 hover:scale-105 transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/60"
            >
              Follow on Substack
            </a>
          </div>
        )}

      </div>

      <NewsletterSignup />
    </main>
  );
}
