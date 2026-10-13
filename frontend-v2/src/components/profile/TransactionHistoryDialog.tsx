import { ChevronRight, History } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { EmptyState } from "../ui/empty-state";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { formatDateTime } from "../../lib/datetime";
import { cn } from "../../lib/utils";

interface Transaction {
    id: string;
    amount: number;
    reason: string;
    created_at: string;
    metadata?: {
        research_id?: string;
        noteId?: string;
        /** Ticker the research was run for (research_spend). */
        ticker?: string;
        symbol?: string;
        [key: string]: unknown;
    };
}

interface TransactionHistoryDialogProps {
    transactions: Transaction[] | undefined;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const REASON_LABEL: Record<string, string> = {
    research_spend: "AI research",
    portfolio_analysis_spend: "Portfolio analysis",
    social_analysis_spend: "Social analysis",
    manual_contribution: "Research contribution",
    admin_gift: "Gift from admin",
    monthly_reset: "Monthly refill",
};

const reasonLabel = (reason: string): string =>
    REASON_LABEL[reason] ?? reason.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * Where a research transaction leads: the note on its ticker's research tab.
 * Without a ticker in the metadata there is no honest deep link, so the row
 * is not a link at all (it used to point at `/ticker/unknown/…`).
 */
function researchLink(tx: Transaction): string | null {
    const id = tx.metadata?.research_id || tx.metadata?.noteId;
    const symbol = tx.metadata?.ticker || tx.metadata?.symbol;
    if (!id || typeof symbol !== "string" || !symbol) return null;
    return `/ticker/${encodeURIComponent(symbol)}/research/${id}`;
}

function Amount({ value }: { value: number }) {
    return (
        <span className={cn("num font-semibold", value > 0 ? "text-up" : value < 0 ? "text-down" : "text-muted-foreground")}>
            {value > 0 ? "+" : value < 0 ? "−" : ""}
            {Math.abs(value)}
        </span>
    );
}

export function TransactionHistoryDialog({ transactions, open, onOpenChange }: TransactionHistoryDialogProps) {
    const navigate = useNavigate();
    // Below `sm` the dialog is a phone sheet: rows instead of a table.
    const phone = useMediaQuery("(max-width: 639.98px)");
    const rows = transactions ?? [];

    const openResearch = (to: string) => {
        onOpenChange(false);
        navigate(to);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange} className="sm:max-w-[600px]">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <History size={20} className="text-primary" />
                    Credit history
                </DialogTitle>
                <DialogDescription>Credits you earned and spent, newest first.</DialogDescription>
            </DialogHeader>

            {rows.length === 0 ? (
                <EmptyState className="py-12" title="No transactions yet" description="Spending credits on AI research shows up here." />
            ) : phone ? (
                <ul className="space-y-1.5">
                    {rows.map((tx) => {
                        const to = researchLink(tx);
                        const body = (
                            <>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-foreground">
                                        {reasonLabel(tx.reason)}
                                        {typeof tx.metadata?.ticker === "string" && <span className="num text-muted-foreground"> · {tx.metadata.ticker}</span>}
                                    </span>
                                    <span className="num mt-0.5 block text-xs text-muted-foreground">{formatDateTime(tx.created_at)}</span>
                                </span>
                                <Amount value={tx.amount} />
                                {to && <ChevronRight size={16} className="text-muted-foreground" aria-hidden />}
                            </>
                        );
                        return (
                            <li key={tx.id}>
                                {to ? (
                                    <button
                                        type="button"
                                        onClick={() => openResearch(to)}
                                        className="flex min-h-14 w-full items-center gap-3 rounded-md bg-muted/60 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {body}
                                    </button>
                                ) : (
                                    <div className="flex min-h-14 items-center gap-3 rounded-md bg-muted/60 px-3 py-2">{body}</div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <div className="max-h-[60vh] overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-popover">
                            <tr className="label-micro">
                                <th scope="col" className="px-3 py-2.5 text-left font-medium">Date</th>
                                <th scope="col" className="px-3 py-2.5 text-left font-medium">Action</th>
                                <th scope="col" className="px-3 py-2.5 text-right font-medium">Credits</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((tx) => {
                                const to = researchLink(tx);
                                return (
                                    <tr key={tx.id} className="transition-colors hover:bg-muted/60">
                                        <td className="num whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{formatDateTime(tx.created_at)}</td>
                                        <td className="px-3 py-2.5">
                                            {to ? (
                                                <button type="button" onClick={() => openResearch(to)} className="rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                                    {reasonLabel(tx.reason)}
                                                    {typeof tx.metadata?.ticker === "string" && ` · ${tx.metadata.ticker}`}
                                                </button>
                                            ) : (
                                                <span>
                                                    {reasonLabel(tx.reason)}
                                                    {typeof tx.metadata?.ticker === "string" && <span className="num text-muted-foreground"> · {tx.metadata.ticker}</span>}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 text-right"><Amount value={tx.amount} /></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Dialog>
    );
}
