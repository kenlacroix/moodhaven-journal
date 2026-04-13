// app/blog/page.tsx
import Link from "next/link";
import { format } from "date-fns";
import { BookOpen } from "lucide-react";
import { getAllPosts } from "@/lib/posts";

/* ------------------------------------------------------------------ */
/* Typed view of the helper result                                    */
/* ------------------------------------------------------------------ */
interface PostMeta {
  slug: string;
  title: string;
  publishDate?: string; // yyyy-mm-dd or ISO
  excerpt: string;
  heroImage: string;
  draft?: boolean;
  published?: boolean;
}

export default async function BlogIndex() {
  const todayISO = new Date().toISOString().slice(0, 10);

  /* ------------------------------------------------------------------
   * Collect posts, hide drafts + future-dated
   * ---------------------------------------------------------------- */
  const posts: PostMeta[] = getAllPosts()
    .filter((post: PostMeta) => {
      if (post.draft === true) return false;
      if (post.published === false) return false;
      if (post.publishDate && post.publishDate.slice(0, 10) > todayISO)
        return false;
      return true;
    })
    .sort((a, b) => {
      const dateA = a.publishDate ? new Date(a.publishDate) : new Date(0);
      const dateB = b.publishDate ? new Date(b.publishDate) : new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

  /* ------------------------------------------------------------------
   * Render
   * ---------------------------------------------------------------- */
  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-8">Blog</h1>

      {posts.map((post) => (
        <div key={post.slug} className="mb-6">
          <h2 className="text-xl font-semibold">
            <Link href={`/blog/${post.slug}`}>{post.title}</Link>
          </h2>
          <p className="text-gray-500 text-sm">
            {post.publishDate
              ? format(new Date(post.publishDate), "MMMM d, yyyy")
              : "Undated"}
          </p>
          <p className="mt-2">{post.excerpt}</p>
        </div>
      ))}

      {posts.length === 0 && (
        <div className="bg-primary-50 rounded-2xl px-6 py-12 flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-primary-600" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 mb-1">
              No posts yet
            </h2>
            <p className="text-sm text-neutral-600 leading-relaxed max-w-sm">
              We write about privacy-first software, local-first design, and what
              we{"'"}re building. New posts land on Substack first.
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
  );
}
