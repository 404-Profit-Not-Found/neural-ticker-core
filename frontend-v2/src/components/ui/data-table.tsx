import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
  getSortedRowModel,
} from '@tanstack/react-table';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Skeleton } from './skeleton';
import { useState } from 'react';
import { cn } from '../../lib/utils';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  onRowClick?: (row: TData) => void;
  emptyMessage?: string;
  defaultSorting?: SortingState;
  className?: string;
  /**
   * Keep the last column (row actions) in view while the rest scrolls
   * sideways, so the actions are never hidden off-screen.
   */
  stickyLastColumn?: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  onRowClick,
  emptyMessage = 'No results found.',
  defaultSorting = [],
  className,
  stickyLastColumn = false,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>(defaultSorting);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className={cn("rounded-md bg-card overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="transition-colors data-[state=selected]:bg-muted"
              >
                {headerGroup.headers.map((header) => {
                  return (
                    <th
                      key={header.id}
                      className={cn("h-10 px-3 xl:px-4 text-left align-middle font-medium text-muted-foreground hover:text-foreground cursor-pointer select-none whitespace-nowrap", stickyLastColumn && "last:sticky last:right-0 last:z-[1] last:bg-card")}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        {{
                          asc: <ArrowUpRight className="ml-1 h-3 w-3" />,
                          desc: <ArrowDownRight className="ml-1 h-3 w-3" />,
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((_, j) => (
                    <td key={j} className="p-4">
                      {/* Heuristic: First column usually has avatar, others are text */}
                      {j === 0 ? (
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-12" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                        </div>
                      ) : (
                        <Skeleton className="h-4 w-full opacity-50" />
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={cn(
                    "group transition-colors data-[state=selected]:bg-muted",
                    // A solid hover tone when a cell is pinned, so the pinned cell can match it.
                    stickyLastColumn ? "hover:bg-muted" : "hover:bg-muted/50",
                    onRowClick && "cursor-pointer",
                  )}
                  onClick={() => onRowClick && onRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-3 py-3 align-middle whitespace-nowrap xl:px-4",
                        stickyLastColumn && "last:sticky last:right-0 last:z-[1] last:bg-card group-hover:last:bg-muted",
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
