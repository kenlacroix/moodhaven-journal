// File: /lib/mdx.ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkSlug from 'remark-slug';
import { visit } from 'unist-util-visit';

export type Heading = { id: string; text: string; depth: number };

interface MdastChild { type: string; value?: string; children?: MdastChild[] }
interface MdastHeading {
  type: 'heading';
  depth: number;
  children: MdastChild[];
  data?: { id?: string };
}

export async function getHeadings(mdxContent: string): Promise<Heading[]> {
  // 1. Build a processor with your plugins
  const processor = unified()
    .use(remarkParse)
    .use(remarkMdx)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .use(remarkSlug as any);

  // 2. Parse to a tree…
  const tree = processor.parse(mdxContent);
  // 3. …then actually run all plugins against it
  await processor.run(tree);

  // 4. Walk it for headings with data.id
  const headings: Heading[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(tree, 'heading', (node: any) => {
    const h = node as MdastHeading;
    const textNode = h.children.find(c => c.type === 'text');
    if (textNode && h.data?.id) {
      headings.push({
        id: h.data.id!,
        text: textNode.value ?? '',
        depth: h.depth,
      });
    }
  });

  return headings;
}
