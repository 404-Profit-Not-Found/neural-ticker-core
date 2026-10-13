import { useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { useAuth } from '../../context/AuthContext';

// "Go to" shortcuts: press G, then the letter (Gmail / GitHub convention).
const GO_TO: Array<{ key: string; label: string; to: string; admin?: boolean }> = [
  { key: 'd', label: 'Dashboard', to: '/' },
  { key: 'w', label: 'Watchlist', to: '/watchlist' },
  { key: 't', label: 'Tickers', to: '/analyzer' },
  { key: 'p', label: 'Portfolio', to: '/portfolio' },
  { key: 'a', label: 'Price alerts', to: '/alerts' },
  { key: 'n', label: 'Market news', to: '/news' },
  { key: 'r', label: 'AI research', to: '/research' },
  { key: 'u', label: 'Profile & credits', to: '/profile' },
  { key: 'x', label: 'Admin console', to: '/admin', admin: true },
];

const LEADER_TIMEOUT_MS = 1000;

// Help dialog open state, shared with the command palette's "Keyboard
// shortcuts" entry.
let helpOpen = false;
const listeners = new Set<() => void>();
function setHelpOpen(next: boolean): void {
  if (helpOpen === next) return;
  helpOpen = next;
  for (const l of listeners) l();
}
// eslint-disable-next-line react-refresh/only-export-components
export const openShortcutsHelp = (): void => setHelpOpen(true);

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  );
}

/**
 * App-wide keyboard shortcuts for the signed-in shell: `g` + letter jumps to
 * a page, `?` lists every shortcut. They never fire while the user is typing
 * or while a dialog is open, and never with a modifier held (so browser and
 * OS shortcuts keep working).
 */
export function KeyboardShortcuts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const open = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => helpOpen,
  );

  useEffect(() => {
    let leaderUntil = 0;

    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target)) return;
      // A modal owns the keyboard while it is open.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'g' && !e.shiftKey) {
        leaderUntil = Date.now() + LEADER_TIMEOUT_MS;
        return;
      }
      if (Date.now() > leaderUntil) return;
      leaderUntil = 0;
      const dest = GO_TO.find((d) => d.key === key && (!d.admin || isAdmin));
      if (dest) {
        e.preventDefault();
        navigate(dest.to);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, isAdmin]);

  return (
    <Dialog open={open} onOpenChange={setHelpOpen} className="max-w-md">
      <DialogHeader className="text-left">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>Work faster without leaving the keyboard.</DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <ShortcutGroup label="General">
          <ShortcutRow keys={['⌘', 'K']} alt={['Ctrl', 'K']} label="Search tickers and commands" />
          <ShortcutRow keys={['/']} label="Search (when not typing)" />
          <ShortcutRow keys={['?']} label="Show this list" />
          <ShortcutRow keys={['Esc']} label="Close a dialog or menu" />
        </ShortcutGroup>

        <ShortcutGroup label="Go to">
          {GO_TO.filter((d) => !d.admin || isAdmin).map((d) => (
            <ShortcutRow key={d.key} keys={['G', d.key.toUpperCase()]} sequence label={d.label} />
          ))}
        </ShortcutGroup>
      </div>
    </Dialog>
  );
}

function ShortcutGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h4>
      <dl className="space-y-0.5">{children}</dl>
    </section>
  );
}

function Keys({ keys, sequence }: { keys: string[]; sequence?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k, i) => (
        <span key={`${k}-${i}`} className="flex items-center gap-1">
          {i > 0 && sequence && <span className="text-[11px] text-muted-foreground">then</span>}
          <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-muted px-1.5 font-mono text-[11px] font-medium text-foreground">
            {k}
          </kbd>
        </span>
      ))}
    </span>
  );
}

function ShortcutRow({
  keys,
  alt,
  label,
  sequence,
}: {
  keys: string[];
  alt?: string[];
  label: string;
  sequence?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2">
      <dt className="text-sm text-foreground">{label}</dt>
      <dd className="flex shrink-0 items-center gap-2">
        <Keys keys={keys} sequence={sequence} />
        {alt && (
          <>
            <span className="text-[11px] text-muted-foreground">or</span>
            <Keys keys={alt} />
          </>
        )}
      </dd>
    </div>
  );
}
