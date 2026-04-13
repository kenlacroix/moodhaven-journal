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
// Pre-render all blog slugs
// ---------------------------------------------------------------------------
export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

// ---------------------------------------------------------------------------
// Per-post metadata (title, description, OG image)
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
  const { slug } = await params;        // works whether ‘params’ is a Promise or plain
  const post = getPostBySlug(slug);
  if (!post.publishDate || new Date(post.publishDate) > new Date()) return notFound();

  // Table-of-contents
  const flatHeadings = await getHeadings(post.content);
  const toc = buildToc(flatHeadings);

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

  return (
    <BlogPostClient
      title={post.title}
      publishDate={post.publishDate}
      mdx={mdxContent}
      heroImage={post.heroImage}
      headings={toc}
      accentColor={post.accentColor}
    />
  );
}
