import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { cn } from '../../lib/utils';
import { MarkdownLink } from './MarkdownLink';
import { ScrollX } from './ScrollX';
import { headingId, stripLeadingTitle } from './markdown-utils';

// The one reader for AI/analyst-written markdown: research notes, the public
// report, the dashboard digest. It exists so long-form text is set once:
//   · a readable measure (about 72 characters) with tables free to use the
//     full width and to scroll sideways inside their own box on phones;
//   · a heading scale that sits *under* the page title instead of above it;
//   · none of the typography plugin's decorations that read as bugs in a
//     finance note (literal backticks around inline code, curly quotes and
//     italics on callouts, bullets in front of task-list checkboxes);
//   · surfaces told apart by tone, never by rules or outlines;
//   · links through MarkdownLink (router for in-app paths, new tab for http,
//     everything else inert) in a blue that passes AA on the dark surface.

function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (isValidElement(node)) return nodeText((node as ReactElement<{ children?: ReactNode }>).props.children);
  return '';
}

const SENTIMENT_TAG = /(\((?:BULLISH|BEARISH|MIXED|NEUTRAL)\))/gi;

/** Colour "(BULLISH)" / "(BEARISH)" / "(MIXED)" / "(NEUTRAL)" tags in text. */
function withSentiment(children: ReactNode): ReactNode {
  return Children.map(children, (child, i) => {
    if (typeof child !== 'string') return child;
    const parts = child.split(SENTIMENT_TAG);
    if (parts.length === 1) return child;
    return parts.map((part, j) => {
      const upper = part.toUpperCase();
      const key = `s-${i}-${j}`;
      if (upper === '(BULLISH)') return <span key={key} className="font-bold text-up">{part}</span>;
      if (upper === '(BEARISH)') return <span key={key} className="font-bold text-down">{part}</span>;
      if (upper === '(MIXED)' || upper === '(NEUTRAL)') {
        return <span key={key} className="font-bold text-yellow-700 dark:text-yellow-400">{part}</span>;
      }
      return part;
    });
  });
}

export interface MarkdownProps {
  children: string;
  className?: string;
  /** `base` for articles (16px, 15px on phones); `sm` for panels (14px). */
  size?: 'sm' | 'base';
  /** Keep prose to a readable line length. Tables always use the full width. */
  measure?: boolean;
  /** Treat single newlines as line breaks (research notes are written that way). */
  breaks?: boolean;
  /** Colour "(BULLISH)"-style tags, as the dashboard digest does. */
  highlightSentiment?: boolean;
  /** Remove a leading H1 that repeats this title (`true`: any leading H1). */
  stripTitle?: string | boolean;
}

const PROSE = cn(
  'prose dark:prose-invert max-w-none break-words',
  'prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground prose-headings:scroll-mt-24',
  'prose-strong:text-foreground prose-hr:my-3 prose-hr:h-0 prose-hr:border-0',
  // Callouts, not literary quotes.
  'prose-blockquote:rounded-md prose-blockquote:border-0 prose-blockquote:bg-muted prose-blockquote:px-4 prose-blockquote:py-1 prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-foreground/90',
  '[&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none',
  // Inline code is a chip; the plugin's literal backticks are removed.
  'prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.875em] prose-code:font-medium prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none',
  'prose-pre:rounded-md prose-pre:bg-muted prose-pre:text-foreground/90',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[0.8125rem] [&_pre_code]:font-normal',
  // GFM task lists: the checkbox is the marker.
  '[&_.contains-task-list]:list-none [&_.contains-task-list]:pl-0 [&_.task-list-item]:pl-0 [&_.task-list-item>input]:mr-2 [&_.task-list-item>input]:align-[-2px]',
  // Tables: numbers line up, rows are told apart by tone (no rules), head
  // cells never wrap mid-word.
  'prose-table:my-0 prose-table:w-full prose-table:text-[0.8125rem] prose-thead:border-0 prose-tr:border-0',
  'prose-th:whitespace-nowrap prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-th:text-xs prose-th:font-semibold prose-th:text-muted-foreground',
  'prose-td:px-3 prose-td:py-2 prose-td:align-top [&_td]:tabular-nums [&_tbody_tr:nth-child(even)]:bg-muted/40',
  '[&_th:first-child]:rounded-l-md [&_th:last-child]:rounded-r-md',
  'prose-img:rounded-md',
);

const SIZE: Record<NonNullable<MarkdownProps['size']>, string> = {
  // Headings sit under a 24–28px page title.
  base: 'prose-sm max-sm:text-[15px] sm:prose-base prose-h1:text-xl sm:prose-h1:text-[1.375rem] prose-h1:mb-4 prose-h2:mt-8 prose-h2:mb-3 prose-h2:text-lg sm:prose-h2:text-xl prose-h3:mt-6 prose-h3:mb-2 prose-h3:text-base prose-h4:text-sm',
  sm: 'prose-sm prose-h1:text-lg prose-h1:mb-3 prose-h2:mt-6 prose-h2:mb-2 prose-h2:text-base prose-h3:mt-4 prose-h3:text-sm prose-h4:text-sm',
};

// Prose blocks keep to a reading measure; wide blocks (tables, code) do not.
const MEASURE = '[&>*:not(.md-wide)]:max-w-[72ch]';

export function Markdown({
  children,
  className,
  size = 'base',
  measure = true,
  breaks = false,
  highlightSentiment = false,
  stripTitle,
}: MarkdownProps) {
  const source = stripLeadingTitle(children, stripTitle);
  const tint = (kids: ReactNode) => (highlightSentiment ? withSentiment(kids) : kids);

  const components: Components = {
    a: ({ node, className: linkClass, ...props }) => {
      void node;
      return (
        <MarkdownLink
          {...props}
          className={cn('font-medium underline decoration-1 dark:text-blue-400', linkClass)}
        />
      );
    },
    table: ({ node, ...props }) => {
      void node;
      return (
        <ScrollX label="Table" className="md-wide my-6" innerClassName="pb-1">
          <table {...props} className="min-w-[30rem]" />
        </ScrollX>
      );
    },
    pre: ({ node, className: preClass, ...props }) => {
      void node;
      return <pre {...props} className={cn('md-wide overflow-x-auto', preClass)} />;
    },
    h1: ({ node, children: kids, ...props }) => { void node; return <h1 {...props}>{tint(kids)}</h1>; },
    h2: ({ node, children: kids, ...props }) => { void node; return <h2 {...props} id={headingId(nodeText(kids))}>{tint(kids)}</h2>; },
    h3: ({ node, children: kids, ...props }) => { void node; return <h3 {...props} id={headingId(nodeText(kids))}>{tint(kids)}</h3>; },
    h4: ({ node, children: kids, ...props }) => { void node; return <h4 {...props}>{tint(kids)}</h4>; },
    h5: ({ node, children: kids, ...props }) => { void node; return <h5 {...props}>{tint(kids)}</h5>; },
    h6: ({ node, children: kids, ...props }) => { void node; return <h6 {...props}>{tint(kids)}</h6>; },
    ...(highlightSentiment
      ? {
          p: ({ node, children: kids, ...props }) => { void node; return <p {...props}>{withSentiment(kids)}</p>; },
          li: ({ node, children: kids, ...props }) => { void node; return <li {...props}>{withSentiment(kids)}</li>; },
          strong: ({ node, children: kids, ...props }) => { void node; return <strong {...props}>{withSentiment(kids)}</strong>; },
          em: ({ node, children: kids, ...props }) => { void node; return <em {...props}>{withSentiment(kids)}</em>; },
        }
      : {}),
  };

  return (
    <div className={cn(PROSE, SIZE[size], measure && MEASURE, className)}>
      <ReactMarkdown remarkPlugins={breaks ? [remarkGfm, remarkBreaks] : [remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
