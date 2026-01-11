import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    type SortingState,
    type ColumnDef,
} from '@tanstack/react-table';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { StockSnapshot } from '../../hooks/useStockAnalyzer';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/api';

interface AnalyzerTableViewProps {
    data: StockSnapshot[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    columns: ColumnDef<StockSnapshot, any>[];
    sorting: SortingState;
    setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
    navigate: (path: string) => void;
    isLoading: boolean;
}

export function AnalyzerTableView({
    data,
    columns,
    sorting,
    setSorting,
    navigate,
    isLoading,
}: AnalyzerTableViewProps) {

    // eslint-disable-next-line react-hooks/incompatible-library
    const table = useReactTable({
        data,
        columns,
        state: {
            sorting,
        },
        manualPagination: true,
        manualSorting: true,
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <div className="overflow-x-auto px-1 pb-2">
            <table className="w-full caption-bottom text-sm border-separate border-spacing-y-2">
                <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id} className="bg-transparent">
                            {headerGroup.headers.map((header) => (
                                <th
                                    key={header.id}
                                    className="h-10 px-4 text-left align-middle font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap first:pl-6 last:pr-6"
                                    onClick={header.column.getToggleSortingHandler()}
                                >
                                    <div className="flex items-center gap-1 group">
                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            {{
                                                asc: <ArrowUpRight className="ml-1 h-3 w-3" />,
                                                desc: <ArrowDownRight className="ml-1 h-3 w-3" />,
                                            }[header.column.getIsSorted() as string] ?? null}
                                        </span>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody className="space-y-4">
                    {isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i} className="bg-card shadow-sm rounded-lg">
                                {table.getVisibleFlatColumns().map((col, idx) => (
                                    <td key={col.id} className={cn("p-4 border-y border-border/40 first:border-l first:rounded-l-lg last:border-r last:rounded-r-lg bg-card", idx === 0 && "pl-6", idx === table.getVisibleFlatColumns().length - 1 && "pr-6")}>
                                        {col.id === 'ticker_symbol' ? (
                                            <div className="flex items-center gap-3">
                                                <Skeleton className="h-8 w-8 rounded-full" />
                                                <div className="space-y-1">
                                                    <Skeleton className="h-4 w-12" />
                                                    <Skeleton className="h-3 w-20" />
                                                </div>
                                            </div>
                                        ) : (
                                            <Skeleton className="h-4 w-full max-w-[100px]" />
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))
                    ) : data.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                                No stocks found.
                            </td>
                        </tr>
                    ) : (
                        table.getRowModel().rows.map((row) => (
                            <tr
                                key={row.id}
                                className="group transition-all hover:bg-muted/30 cursor-pointer relative"
                                onClick={() => navigate(`/ticker/${row.original.ticker.symbol}`)}
                            >
                                {row.getVisibleCells().map((cell, idx) => (
                                    <td 
                                        key={cell.id} 
                                        className={cn(
                                            "p-4 align-middle whitespace-nowrap bg-card border-y border-border/40 group-hover:bg-muted/30 transition-colors first:border-l first:rounded-l-lg last:border-r last:rounded-r-lg shadow-sm",
                                            idx === 0 && "pl-6",
                                            idx === row.getVisibleCells().length - 1 && "pr-6"
                                        )}
                                    >
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
