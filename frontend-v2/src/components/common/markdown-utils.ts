// Pure helpers for the Markdown reader (kept apart from the component so the
// component file only exports components).

export interface MarkdownHeading {
  depth: 2 | 3;
  text: string;
  id: string;
}

/** Stable anchor id for a heading's text. */
export function headingId(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    // After NFKD the accents are separate combining marks: drop every non-ASCII char.
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `md-${slug || 'section'}`;
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+#+\s*$/, '')
    .trim();
}

/** `##` and `###` headings of a document, for a table of contents. */
export function extractHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const match = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (!match) continue;
    const text = stripInlineMarkdown(match[2]);
    if (!text) continue;
    headings.push({ depth: match[1].length as 2 | 3, text, id: headingId(text) });
  }
  return headings;
}

const normalise = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Drop a leading `# Title` when it only repeats the page title. `true` drops
 * any leading H1; a string drops it when it matches that title.
 */
export function stripLeadingTitle(markdown: string, title: string | boolean | undefined): string {
  if (!title) return markdown;
  const match = markdown.match(/^\s*#\s+(.+?)\s*(?:\r?\n|$)/);
  if (!match) return markdown;
  if (title !== true && normalise(stripInlineMarkdown(match[1])) !== normalise(title)) return markdown;
  return markdown.slice(match[0].length).replace(/^\s*\n/, '');
}
