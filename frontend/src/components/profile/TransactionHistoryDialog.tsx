import {
    Dialog,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../ui/table";
import { Badge } from "../ui/badge";
import { History } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { type ReactNode, useState } from "react";

interface Transaction {
    id: string;
    created_at: string;
    amount: number;
    reason: string;
    metadata?: {
        research_id?: string;
        noteId?: string;
    };
}

interface TransactionHistoryDialogProps {
    transactions: Transaction[] | undefined;
    trigger?: ReactNode;
}

export function TransactionHistoryDialog({
    transactions,
    trigger,
}: TransactionHistoryDialogProps) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    return (
        <>
            <div onClick={() => setOpen(true)} className="inline-block cursor-pointer">
                {trigger || (
                    <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <History size={16} /> Transaction History
                    </button>
                )}
            </div>

            <Dialog
                open={open}
                onOpenChange={setOpen}
                className="sm:max-w-[600px] max-h-[80vh] flex flex-col"
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History size={20} className="text-primary" />
                        Transaction History
                    </DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto min-h-[300px] pr-2 mt-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {transactions?.map((tx) => {
                                const researchId =
                                    tx.metadata?.research_id || tx.metadata?.noteId;
                                const isResearch =
                                    (tx.reason === "research_spend" || tx.metadata?.noteId) &&
                                    !!researchId;

                                return (
                                    <TableRow
                                        key={tx.id}
                                        className={
                                            isResearch
                                                ? "cursor-pointer hover:bg-muted/50 transition-colors group"
                                                : ""
                                        }
                                        onClick={() => {
                                            if (isResearch) {
                                                setOpen(false); // Close dialog on navigation
                                                navigate(`/research/${researchId}`);
                                            }
                                        }}
                                    >
                                        <TableCell className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                                            {new Date(tx.created_at).toLocaleString(undefined, {
                                                month: "short",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {isResearch ? (
                                                <div className="flex items-center gap-2">
                                                    <Badge
                                                        variant="outline"
                                                        className="px-1 py-0 h-5 font-mono text-[10px] text-muted-foreground border-border group-hover:border-primary/50 transition-colors"
                                                    >
                                                        ID: {(researchId as string).slice(0, 5)}
                                                    </Badge>
                                                    <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
                                                        Research Analysis
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="capitalize">
                                                    {tx.reason.replace(/_/g, " ")}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell
                                            className={`text-right font-mono font-bold ${tx.amount > 0 ? "text-green-500" : "text-red-500"
                                                }`}
                                        >
                                            {tx.amount > 0 ? "+" : ""}
                                            {tx.amount}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {(!transactions || transactions.length === 0) && (
                                <TableRow>
                                    <TableCell
                                        colSpan={3}
                                        className="text-center py-6 text-muted-foreground"
                                    >
                                        No transactions yet.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Dialog>
        </>
    );
}
