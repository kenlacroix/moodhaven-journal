/**
 * markdownUtils - Minimal HTML → Markdown converter
 *
 * Handles the subset of HTML that TipTap produces for journal entries.
 */

/**
 * Convert a journal entry's HTML content to plain Markdown.
 *
 * Supported tags: h1–h3, strong, em, li/ul/ol, br, p, and strips the rest.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return '';

  let md = html;

  // Block headings
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');

  // Inline emphasis
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

  // Lists — convert each <li> to a dash bullet
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  // Remove list wrappers
  md = md.replace(/<\/?[uo]l[^>]*>/gi, '\n');

  // Blockquote
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n');

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Paragraphs
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

  // Strip remaining tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  md = md
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Collapse 3+ newlines to 2
  md = md.replace(/\n{3,}/g, '\n\n');

  return md.trim();
}

/** Strip all HTML tags and return plain text. */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}


/**
 * Extract all unique hashtags (#word) from HTML content.
 * Returns lowercase tags without the # prefix.
 */
export function extractHashtags(html: string): string[] {
  const plain = htmlToPlainText(html);
  const matches = plain.match(/#(\w+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}
