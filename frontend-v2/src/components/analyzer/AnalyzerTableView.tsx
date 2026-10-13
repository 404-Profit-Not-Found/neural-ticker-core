import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    type SortingState,
    type ColumnDef,
} from '@tanstack/react-table';
import { SearchX } from 'lucide-react';
import { EmptyState } from '../ui/empty-state';
import { SortableTh, bodyCellClass, columnClass } from './table-chrome';
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
        // Columns join by breakpoint (see table-chrome), so this never scrolls
        // sideways in practice; the overflow is only a safety net.
        <div className="overflow-x-auto pb-2">
            <table className="w-full caption-bottom text-sm border-separate border-spacing-y-1.5">
                <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                                <SortableTh key={header.id} header={header} />
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    {isLoading ? (
                        Array.from({ length: 12 }).map((_, i) => (
                            <tr key={i}>
                                {table.getVisibleFlatColumns().map((col) => (
                                    <td key={col.id} className={cn(bodyCellClass, columnClass(col.columnDef.meta))}>
                                        {col.id === 'symbol' ? (
                                            <div className="flex items-center gap-3">
                                                <Skeleton className="h-10 w-10 rounded-full" />
                                                <div className="space-y-1.5">
                                                    <Skeleton className="h-4 w-12" />
                                                    <Skeleton className="h-3 w-24" />
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
                            <td colSpan={columns.length} className="rounded-md bg-card">
                                <EmptyState
                                    icon={<SearchX className="h-5 w-5" />}
                                    title="No tickers match"
                                    description="Try a different search or remove a filter."
                                />
                            </td>
                        </tr>
                    ) : (
                        table.getRowModel().rows.map((row) => (
                            <tr
                                key={row.id}
                                className="group cursor-pointer"
                                onClick={() => navigate(`/ticker/${row.original.ticker.symbol}`)}
                            >
                                {row.getVisibleCells().map((cell) => (
                                    <td key={cell.id} className={cn(bodyCellClass, columnClass(cell.column.columnDef.meta))}>
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
