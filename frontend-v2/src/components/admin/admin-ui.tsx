import type { ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Skeleton } from '../ui/skeleton';
import { UserStatusBadge } from '../ui/user-status-badge';
import { UserTierBadge } from '../ui/user-tier-badge';
import { cn } from '../../lib/utils';
import { isAdminUser, userInitials, type AdminUser, type SortDirection } from './model';

// The admin console's own vocabulary, built from the app's: one toolbar line
// per tab, counts as filter chips, records as compact rows (phones) or a
// rule-less table (desktop). Every tab uses these, so they read as one tool.

// ── Filter chips ─────────────────────────────────────────────────────────

export interface FilterChipOption<T extends string> {
    value: T;
    label: string;
    count: number;
}

interface FilterChipsProps<T extends string> {
    /** Names the group for assistive tech, e.g. "Filter users". */
    label: string;
    value: T;
    onChange: (value: T) => void;
    options: ReadonlyArray<FilterChipOption<T>>;
    /** Counts are not known yet: placeholders, never a zero. */
    loading?: boolean;
    className?: string;
}

/**
 * The tab's figures as one slim strip that is also its filter: each chip is a
 * count and the switch that narrows the list to it. One line — it scrolls
 * sideways on phones (bleeding to the screen edge) instead of wrapping.
 */
export function FilterChips<T extends string>({ label, value, onChange, options, loading, className }: FilterChipsProps<T>) {
    return (
        <div
            role="group"
            aria-label={label}
            className={cn(
                '-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden',
                className,
            )}
        >
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            // Chips share the line when they fit and scroll when they don't.
                            'flex h-11 flex-[1_0_auto] items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:h-8 lg:flex-none lg:text-xs',
                            selected
                                ? 'bg-signal/15 text-signal'
                                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                    >
                        {option.label}
                        {loading ? (
                            <Skeleton className="h-3 w-4" />
                        ) : (
                            <span className={cn('num font-semibold', !selected && 'text-foreground')}>{option.count}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

// ── Search ───────────────────────────────────────────────────────────────

interface SearchFieldProps {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    /** Accessible name of the field. */
    label: string;
    /**
     * For searches that ask the server: Enter (or the arrow inside the field)
     * runs it. Without it the field filters as you type.
     */
    onSubmit?: () => void;
    busy?: boolean;
    className?: string;
}

/** The one search field of a tab's toolbar. */
export function SearchField({ value, onChange, placeholder, label, onSubmit, busy, className }: SearchFieldProps) {
    const field = (
        <>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
                type="search"
                enterKeyHint="search"
                aria-label={label}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={cn('h-11 pl-9 lg:h-9', onSubmit && 'pr-11 lg:pr-9')}
            />
        </>
    );

    if (!onSubmit) return <div className={cn('relative', className)}>{field}</div>;

    return (
        <form
            role="search"
            className={cn('relative', className)}
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
            }}
        >
            {field}
            {/* Never disabled: a disabled submit button would also swallow Enter
                in the field, and a new search may replace one still running. */}
            <button
                type="submit"
                aria-label="Search"
                aria-busy={busy || undefined}
                title="Search (Enter)"
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:w-9"
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
            </button>
        </form>
    );
}

// ── Rows (phones, and short lists at any width) ──────────────────────────

/** Gap between the rows of a list: separate tonal surfaces, no rules. */
export const ADMIN_LIST = 'space-y-1.5';

const ROW_MAIN = 'flex min-h-[3.75rem] min-w-0 flex-1 items-center gap-2.5 px-3.5 py-2.5 text-left';

interface AdminRowProps {
    /** A 40px avatar or logo. */
    leading: ReactNode;
    title: ReactNode;
    /** `true` for identifiers (ticker symbols), which never truncate. */
    identifier?: boolean;
    /** Stamps beside the title. */
    stamps?: ReactNode;
    subtitle?: ReactNode;
    /** An optional third line. */
    meta?: ReactNode;
    /** Right-aligned figures that belong to the record (status, balance). */
    trailing?: ReactNode;
    /** A control beside the row — never inside its button. */
    action?: ReactNode;
    /** Makes the row itself the way into the record. */
    onClick?: () => void;
    /** Accessible name of that button when the content alone would not say what it does. */
    label?: string;
    className?: string;
}

/**
 * One record as a compact "mini card" — the admin sibling of `TickerListRow`
 * (DESIGN.md §6 "Rows, not cards"): one tonal surface, no outline, the detail
 * a tap away instead of stacked into the card.
 *
 *   [40px]  Title [STAMP]                      status
 *           subtitle                           figure
 */
export function AdminRow({ leading, title, identifier, stamps, subtitle, meta, trailing, action, onClick, label, className }: AdminRowProps) {
    const content = (
        <>
            {leading}
            <span className="min-w-0 flex-1">
                {/* Clipped, so on a very narrow phone a stamp never slides under the row's controls. */}
                <span className="flex min-w-0 items-center gap-2 overflow-hidden">
                    <span className={cn('text-[15px] font-semibold leading-tight text-foreground', identifier ? 'shrink-0' : 'truncate')}>
                        {title}
                    </span>
                    {stamps}
                </span>
                {subtitle && (
                    <span className="mt-0.5 block truncate text-[13px] leading-tight text-muted-foreground">{subtitle}</span>
                )}
                {meta && (
                    <span className="mt-1 flex h-[18px] min-w-0 items-center gap-1.5 whitespace-nowrap text-xs leading-none text-muted-foreground">
                        {meta}
                    </span>
                )}
            </span>
            {trailing && <span className="flex shrink-0 flex-col items-end gap-1.5">{trailing}</span>}
        </>
    );

    return (
        <div className={cn('flex items-stretch overflow-hidden rounded-lg bg-card', className)}>
            {onClick ? (
                <button
                    type="button"
                    onClick={onClick}
                    aria-label={label}
                    className={cn(
                        ROW_MAIN,
                        'transition-colors hover:bg-muted/60 active:bg-muted focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    )}
                >
                    {content}
                </button>
            ) : (
                <div className={ROW_MAIN}>{content}</div>
            )}
            {action}
        </div>
    );
}

/** Loading state shaped like the rows it stands in for. `className` replaces the list layout (e.g. a grid). */
export function AdminRowsSkeleton({ rows = 6, label, className = ADMIN_LIST }: { rows?: number; label: string; className?: string }) {
    return (
        <div role="status" aria-label={label} className={className}>
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className={cn(ROW_MAIN, 'rounded-lg bg-card')}>
                    <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-3 w-44 max-w-full" />
                    </div>
                    <Skeleton className="h-4 w-14" />
                </div>
            ))}
        </div>
    );
}

// ── Table chrome (desktop) ───────────────────────────────────────────────

/** Rows are separate tonal surfaces with a small gap — no rules, no outline. */
export const ADMIN_TABLE = 'w-full caption-bottom border-separate border-spacing-y-1.5 text-sm';

/** A body cell; the first and last close the row's rounded surface. */
export const ADMIN_CELL =
    'bg-card px-2.5 py-2.5 align-middle transition-colors first:rounded-l-md first:pl-5 last:rounded-r-md last:pr-5';

/** Add on rows that open something: one hover tone for the whole row. */
export const ADMIN_CELL_HOVER = 'group-hover:bg-muted group-focus-within:bg-muted';

const HEAD_CELL = 'h-9 whitespace-nowrap px-2.5 text-left align-middle first:pl-5 last:pr-5';

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
    return (
        <th scope="col" className={cn(HEAD_CELL, className)}>
            {children !== undefined && <span className="label-micro">{children}</span>}
        </th>
    );
}

interface SortThProps {
    label: string;
    /** This column's current direction, or `false` when another column sorts the table. */
    sorted: SortDirection | false;
    onSort: () => void;
    className?: string;
}

/**
 * A sortable column head — the same control as on the Tickers table: a real
 * button, a dim glyph at rest, an arrow and the "you are here" tint once sorted.
 */
export function SortTh({ label, sorted, onSort, className }: SortThProps) {
    return (
        <th
            scope="col"
            aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
            className={cn(HEAD_CELL, className)}
        >
            <button
                type="button"
                onClick={onSort}
                title={sorted === 'asc' ? 'Sorted ascending — click to reverse' : sorted === 'desc' ? 'Sorted descending — click to reverse' : 'Sort by this column'}
                className={cn(
                    'label-micro group/sort -mx-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-muted hover:!text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    sorted && 'bg-signal/10 !text-signal hover:bg-signal/15 hover:!text-signal',
                )}
            >
                {label}
                {sorted === 'asc' ? (
                    <ArrowUp className="h-3 w-3 shrink-0" aria-hidden />
                ) : sorted === 'desc' ? (
                    <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
                ) : (
                    <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 transition-opacity group-hover/sort:opacity-100" aria-hidden />
                )}
            </button>
        </th>
    );
}

/** Table rows that are still loading: the same boxes, placeholders inside. */
export function AdminTableSkeleton({ rows = 6, columns, label }: { rows?: number; columns: number; label: string }) {
    return (
        <div role="status" aria-label={label}>
        <table className={ADMIN_TABLE}>
            <tbody>
                {Array.from({ length: rows }).map((_, i) => (
                    <tr key={i}>
                        {Array.from({ length: columns }).map((__, c) => (
                            <td key={c} className={ADMIN_CELL}>
                                {c === 0 ? (
                                    <div className="flex items-center gap-3">
                                        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                                        <div className="space-y-1.5">
                                            <Skeleton className="h-3.5 w-28" />
                                            <Skeleton className="h-3 w-40" />
                                        </div>
                                    </div>
                                ) : (
                                    <Skeleton className="h-4 w-full max-w-[90px]" />
                                )}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
        </div>
    );
}

// ── Pagination ───────────────────────────────────────────────────────────

interface PagerProps {
    page: number;
    pageSize: number;
    total: number;
    onPage: (page: number) => void;
}

/** The same pager as the Tickers page: what is shown, and two quiet steps. */
export function Pager({ page, pageSize, total, onPage }: PagerProps) {
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    if (pageCount <= 1) return null;
    return (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
            <p className="num text-xs text-muted-foreground sm:text-sm">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 lg:h-8 lg:w-8"
                    aria-label="Previous page"
                    onClick={() => onPage(Math.max(1, page - 1))}
                    disabled={page <= 1}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="num text-sm font-medium">
                    {page} / {pageCount}
                </span>
                <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 lg:h-8 lg:w-8"
                    aria-label="Next page"
                    onClick={() => onPage(Math.min(pageCount, page + 1))}
                    disabled={page >= pageCount}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </nav>
    );
}

// ── People ───────────────────────────────────────────────────────────────

interface UserAvatarProps {
    email?: string;
    nickname?: string;
    avatarUrl?: string;
    className?: string;
}

/** A person's picture, or their initials on a tonal disc. */
export function UserAvatar({ email, nickname, avatarUrl, className }: UserAvatarProps) {
    return (
        <span
            aria-hidden
            className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[13px] font-semibold text-muted-foreground',
                className,
            )}
        >
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : userInitials(email, nickname)}
        </span>
    );
}

/** Tier (and, for an admin whose access is not plain "admin", the role) beside a name. */
export function UserTierStamps({ user }: { user: Pick<AdminUser, 'tier' | 'role' | 'status'> }) {
    return (
        <>
            <UserTierBadge tier={user.tier} showIcon={false} className="shrink-0" />
            {isAdminUser(user) && user.status !== 'ADMIN' && <UserTierBadge tier="admin" showIcon={false} className="shrink-0" />}
        </>
    );
}

/** Where the account stands: one stamp, the same in the list, the table and the sheet. */
export function UserStatusStamp({ user, className }: { user: Pick<AdminUser, 'status'>; className?: string }) {
    if (user.status === 'ADMIN') return <UserTierBadge tier="admin" showIcon={false} className={className} />;
    const known = ['ACTIVE', 'INVITED', 'WAITLIST', 'BANNED'].includes(user.status);
    if (known) return <UserStatusBadge status={user.status} showIcon={false} className={className} />;
    return user.status ? (
        <Badge variant="outline" className={cn('h-5 px-1.5 text-[11px]', className)}>{user.status}</Badge>
    ) : null;
}

/** A request's state, in the same stamps as an account's. */
export function RequestStatusStamp({ status }: { status: string }) {
    const normalized = status?.toUpperCase();
    return (
        <Badge
            variant={normalized === 'PENDING' ? 'statusWaitlist' : normalized === 'APPROVED' ? 'statusActive' : 'statusBanned'}
            className="h-5 shrink-0 px-1.5 text-[11px]"
        >
            {normalized}
        </Badge>
    );
}
