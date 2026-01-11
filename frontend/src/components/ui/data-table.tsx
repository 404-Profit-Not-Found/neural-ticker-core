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
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  onRowClick,
  emptyMessage = 'No results found.',
  defaultSorting = [],
  className,
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
    <div className={cn("rounded-md border border-border bg-card overflow-hidden shadow-sm", className)}>
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="[&_tr]:border-b">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
              >
                {headerGroup.headers.map((header) => {
                  return (
                    <th
                      key={header.id}
                      className="h-10 px-2 sm:px-4 text-left align-middle font-medium text-muted-foreground hover:text-foreground cursor-pointer select-none whitespace-nowrap"
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
          <tbody className="[&_tr:last-child]:border-0">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
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
                  className={`group border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted ${onRowClick ? 'cursor-pointer' : ''
                    }`}
                  onClick={() => onRowClick && onRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="p-2 sm:p-4 align-middle whitespace-nowrap">
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
