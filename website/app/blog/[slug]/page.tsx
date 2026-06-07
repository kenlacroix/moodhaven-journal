// File: app/blog/[slug]/page.tsx

import type { Metadata } from 'next';
import { getAllPosts, getPostBySlug } from '@/lib/posts';
import { getHeadings } from '@/lib/mdx';
import { buildToc } from '@/lib/build-toc';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkSlug from 'remark-slug';
import remarkAutolinkHeadings from 'remark-autolink-headings';
import type { Pluggable } from 'unified';
import BlogPostClient from '@/components/BlogPostClient';
import { Heading } from '@/components/Heading';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function calcReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

function getPublishedSortedPosts() {
  const todayISO = new Date().toISOString().slice(0, 10);
  return getAllPosts()
    .filter(
      (p) =>
        p.draft !== true &&
        p.published !== false &&
        p.publishDate &&
        p.publishDate.slice(0, 10) <= todayISO
    )
    .sort(
      (a, b) =>
        new Date(b.publishDate!).getTime() - new Date(a.publishDate!).getTime()
    );
}

// ---------------------------------------------------------------------------
// Pre-render all blog slugs
// ---------------------------------------------------------------------------
export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

// ---------------------------------------------------------------------------
// Per-post metadata
// ---------------------------------------------------------------------------
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  const base = 'https://www.moodhaven.app';
  const url = `${base}/blog/${slug}`;

  return {
    title: `${post.title} — MoodHaven Journal`,
    description: post.excerpt,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url,
      type: 'article',
      publishedTime: post.publishDate,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
    },
  };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post.publishDate || new Date(post.publishDate) > new Date()) return notFound();

  // Table-of-contents
  const flatHeadings = await getHeadings(post.content);
  const toc = buildToc(flatHeadings);

  // Reading time
  const readingTime = calcReadingTime(post.content);

  // Prev / next (sorted newest-first, so prev = older = higher index)
  const sorted = getPublishedSortedPosts();
  const idx = sorted.findIndex((p) => p.slug === slug);
  const nextPost = idx > 0 ? { slug: sorted[idx - 1].slug, title: sorted[idx - 1].title } : undefined;
  const prevPost = idx < sorted.length - 1 ? { slug: sorted[idx + 1].slug, title: sorted[idx + 1].title } : undefined;

  // Render MDX
  const mdxContent = (
    <MDXRemote
      source={post.content}
      options={{
        mdxOptions: {
          remarkPlugins: [
            remarkSlug as Pluggable,
            [remarkAutolinkHeadings, { behavior: 'wrap' }] as Pluggable,
          ],
        },
      }}
      components={{
        h2: (props) => <Heading as="h2" {...props} />,
        h3: (props) => <Heading as="h3" {...props} />,
      }}
    />
  );

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.title,
    "description": post.excerpt,
    "datePublished": post.publishDate,
    "author": {
      "@type": "Person",
      "name": "Ken LaCroix",
      "url": "https://www.moodhaven.app/about"
    },
    "publisher": {
      "@type": "Organization",
      "name": "MoodHaven Journal",
      "url": "https://www.moodhaven.app"
    },
    "url": `https://www.moodhaven.app/blog/${slug}`,
    ...(post.heroImage ? { "image": `https://www.moodhaven.app${post.heroImage}` } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <BlogPostClient
        title={post.title}
        publishDate={post.publishDate}
        readingTime={readingTime}
        mdx={mdxContent}
        heroImage={post.heroImage}
        headings={toc}
        accentColor={post.accentColor}
        prevPost={prevPost}
        nextPost={nextPost}
      />
    </>
  );
}
