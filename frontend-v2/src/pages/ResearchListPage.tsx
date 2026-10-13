import { failureReason } from '../lib/research-failure';
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, FileText, Search, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { formatCount } from '../lib/format';
import { formatDateTime, formatRelative, isoDateTime } from '../lib/datetime';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Panel, Led } from '../components/ui/panel';
import { PageHeader } from '../components/ui/page-header';
import { SegmentedControl } from '../components/ui/segmented';
import { EmptyState } from '../components/ui/empty-state';
import { Skeleton } from '../components/ui/skeleton';
import { useConfirm } from '../components/ui/confirm';
import { ModelBadge } from '../components/ui/model-badge';
import { TickerLogo } from '../components/dashboard/TickerLogo';
import { useAuth } from '../context/AuthContext';
import type { ResearchItem } from '../types/ticker';

type Scope = 'recent' | 'all';

const PAGE_LIMIT = 50;

function matches(note: ResearchItem, query: string): boolean {
  if (!query) return true;
  const haystack = [
    note.title,
    note.question,
    note.user?.nickname,
    note.models_used?.join(' '),
    note.provider,
    note.status,
    ...note.tickers,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function ResearchListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filter = searchParams.get('filter'); // 'recent' or null
  const isRecent = filter === 'recent';
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const [query, setQuery] = useState('');

  // Delete mutation for admin
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/research/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-list'] });
    },
  });

  const { data, isLoading, isError, refetch } = useQuery<{
    data: ResearchItem[];
    total: number;
  }>({
    queryKey: ['research-list', filter],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit: PAGE_LIMIT };
      if (isRecent) {
        params.since = 24; // 24 hours
      }
      const res = await api.get('/research', { params });
      return res.data;
    },
  });

  const notes = data?.data;
  const visible = useMemo(() => (notes ?? []).filter((note) => matches(note, query.trim())), [notes, query]);
  const total = data?.total ?? notes?.length ?? 0;
  const isCapped = !!notes && total > notes.length;

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete this research note?',
      description: 'The note and any risk analysis generated from it will be deleted. This can’t be undone.',
      confirmLabel: 'Delete note',
      destructive: true,
    });
    if (!confirmed) return;
    deleteMutation.mutate(id);
  };

  return (
    <div className="min-h-page bg-background font-sans text-foreground selection:bg-primary/30">
      <main className="container mx-auto max-w-[80rem] space-y-4 px-4 py-4 sm:space-y-5 sm:py-6 animate-in fade-in duration-300">
        <PageHeader
          title="AI Reports"
          icon={<FileText className="h-6 w-6" />}
          description={isRecent ? 'Research generated in the last 24 hours.' : 'Every AI-generated research note, newest first.'}
          actions={
            <SegmentedControl<Scope>
              label="Report period"
              className="max-sm:w-full [&>button]:min-h-11 max-sm:[&>button]:flex-1 lg:[&>button]:min-h-8"
              value={isRecent ? 'recent' : 'all'}
              onChange={(scope) => navigate(scope === 'recent' ? '/research?filter=recent' : '/research')}
              options={[
                { value: 'recent', label: 'New (24h)' },
                { value: 'all', label: 'All reports' },
              ]}
            />
          }
        />

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by ticker, title or model"
            aria-label="Filter reports"
            className="h-11 w-full rounded-md bg-card pl-9 pr-11 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear filter"
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>

        {isLoading ? (
          <Panel aria-busy="true" aria-label="Loading reports" className="gap-1 p-1.5">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
            ))}
          </Panel>
        ) : isError ? (
          <Panel>
            <EmptyState
              role="alert"
              icon={<AlertTriangle className="h-5 w-5" />}
              title="Couldn’t load the reports"
              description="Check your connection and try again."
              action={<Button variant="outline" className="h-11 lg:h-9" onClick={() => refetch()}>Try again</Button>}
            />
          </Panel>
        ) : notes && notes.length > 0 ? (
          <Panel aria-label="Research reports">
            {visible.length > 0 ? (
              <ul className="p-1.5">
                {visible.map((note) => (
                  <ReportRow key={note.id} note={note} isAdmin={isAdmin} onDelete={handleDelete} deleting={deleteMutation.isPending} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Search className="h-5 w-5" />}
                title="No reports match that filter"
                description={`Nothing in these ${notes.length} reports matches “${query.trim()}”.`}
                action={<Button variant="outline" className="h-11 lg:h-9" onClick={() => setQuery('')}>Clear filter</Button>}
              />
            )}
            {isCapped && (
              <p className="num px-3.5 pb-3 pt-1 text-xs text-muted-foreground">
                Showing the {formatCount(notes.length)} most recent of {formatCount(total)} reports.
              </p>
            )}
          </Panel>
        ) : (
          <Panel>
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title={isRecent ? 'No new reports in the last 24 hours' : 'No reports yet'}
              description={
                isRecent
                  ? 'Older research is still available under “All reports”.'
                  : 'Open a ticker and run research to create the first one.'
              }
              action={
                isRecent ? (
                  <Button variant="outline" className="h-11 lg:h-9" onClick={() => navigate('/research')}>View all reports</Button>
                ) : (
                  <Button variant="outline" className="h-11 lg:h-9" onClick={() => navigate('/analyzer')}>Browse tickers</Button>
                )
              }
            />
          </Panel>
        )}
      </main>
    </div>
  );
}

const MAX_TICKERS = 3;

function ReportRow({ note, isAdmin, onDelete, deleting }: {
  note: ResearchItem;
  isAdmin: boolean;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const isPending = note.status === 'processing' || note.status === 'pending';
  const isFailed = note.status === 'failed';
  const title = note.title || note.question || 'Untitled research';
  const author = note.user?.nickname || 'AI';
  const tokens = (note.tokens_in ?? 0) + (note.tokens_out ?? 0);
  const model = note.models_used && note.models_used.length > 0 ? note.models_used[0] : note.provider;
  const primary = note.tickers[0];
  const extraTickers = note.tickers.length - MAX_TICKERS;

  return (
    <li className="group relative flex min-h-[4.25rem] items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted focus-within:bg-muted">
      <div className="relative shrink-0">
        <TickerLogo symbol={primary || '?'} className="h-10 w-10" />
        {(isPending || isFailed) && (
          <Led
            tone={isFailed ? 'down' : 'signal'}
            pulse={isPending}
            className="absolute -bottom-0.5 -right-0.5"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* The link covers the row; the delete button sits above it. */}
        <Link
          to={`/ticker/${encodeURIComponent(primary || 'unknown')}/research/${encodeURIComponent(note.id)}`}
          className="line-clamp-2 text-sm font-semibold leading-snug text-foreground after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring sm:text-[15px] md:line-clamp-1"
        >
          {title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          {isFailed && <Badge variant="sell">Failed</Badge>}
          {isFailed && failureReason(note.error) && (
            <span className="text-down">{failureReason(note.error)}</span>
          )}
          {isPending && (
            <Badge variant="outline" className="bg-signal/15 text-signal">
              {note.status === 'pending' ? 'Queued' : 'Running'}
            </Badge>
          )}
          <span className="num font-semibold text-foreground/90">
            {note.tickers.slice(0, MAX_TICKERS).join(' · ')}
            {extraTickers > 0 && <span className="font-normal text-muted-foreground"> +{extraTickers}</span>}
          </span>
          <time dateTime={isoDateTime(note.created_at)} title={formatDateTime(note.created_at)} className="num whitespace-nowrap">
            {formatRelative(note.created_at)}
          </time>
          <span className="hidden max-w-[9rem] truncate sm:inline">{author}</span>
          {/* A phone row stays two lines: who and which model join from `sm`. */}
          {note.status === 'completed' && model && <ModelBadge model={model} rarity={note.rarity} className="max-sm:hidden" />}
          {note.status === 'completed' && tokens > 0 && (
            <span className="num hidden whitespace-nowrap sm:inline">{formatCount(tokens)} tokens</span>
          )}
        </div>
      </div>

      {isAdmin && (
        <button
          type="button"
          onClick={() => onDelete(note.id)}
          disabled={deleting}
          aria-label={`Delete "${title}"`}
          className={cn(
            'relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-down focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
            'lg:h-9 lg:w-9 lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover:opacity-100',
          )}
        >
          <Trash2 size={16} aria-hidden />
        </button>
      )}
    </li>
  );
}
