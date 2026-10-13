import type { AnchorHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown };

/**
 * Link renderer for AI/analyst-written markdown (digests, research notes).
 *
 *  - In-app paths such as `/ticker/NVDA` go through the router: same tab, no
 *    reload, and correct under the app's base path.
 *  - http(s) links open in a new tab without handing the page a reference
 *    back to this app.
 *  - Anything else (`javascript:`, `data:`, protocol-relative, mailto in
 *    model output…) is rendered as plain text. react-markdown already strips
 *    unsafe protocols; this is the second line of defence for content that
 *    is model- or user-generated.
 */
export function MarkdownLink({ href, children, className, node: _node, ...rest }: Props) {
  void _node; // react-markdown passes the AST node; it must not reach the DOM
  const classes = cn('text-primary underline-offset-2 hover:underline', className);

  if (typeof href === 'string' && href.startsWith('/') && !href.startsWith('//')) {
    return (
      <Link to={href} className={classes}>
        {children}
      </Link>
    );
  }

  if (typeof href === 'string' && /^https?:\/\//i.test(href)) {
    return (
      <a {...rest} href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {children}
      </a>
    );
  }

  return <span className={className}>{children}</span>;
}
