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
        <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                {headerGroup.headers.map((header) => (
                                    <th
                                        key={header.id}
                                        className="h-10 px-4 text-left align-middle font-medium text-muted-foreground hover:text-foreground cursor-pointer select-none whitespace-nowrap"
                                        onClick={header.column.getToggleSortingHandler()}
                                    >
                                        <div className="flex items-center gap-1">
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                            {{
                                                asc: <ArrowUpRight className="ml-1 h-3 w-3" />,
                                                desc: <ArrowDownRight className="ml-1 h-3 w-3" />,
                                            }[header.column.getIsSorted() as string] ?? null}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="border-b">
                                    {table.getVisibleFlatColumns().map((col) => (
                                        <td key={col.id} className="p-4">
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
                                    className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted cursor-pointer"
                                    onClick={() => navigate(`/ticker/${row.original.ticker.symbol}`)}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <td key={cell.id} className="p-4 align-middle whitespace-nowrap">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
