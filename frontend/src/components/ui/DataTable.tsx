'use client';

import React, { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

export interface ColumnDef<T> {
  header: string;
  accessorKey: keyof T | string;
  sortable?: boolean;
  /** Numbers and amounts align right so their digits line up. */
  align?: 'left' | 'right';
  cell?: (item: T) => React.ReactNode;
}

export interface DataTableLabels {
  page: string;
  of: string;
  previous: string;
  next: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  pageSize?: number;
  emptyMessage?: React.ReactNode;
  labels?: DataTableLabels;
  className?: string;
}

const DEFAULT_LABELS: DataTableLabels = {
  page: 'Page',
  of: 'of',
  previous: 'Previous Page',
  next: 'Next Page',
};

const pagerButton =
  'inline-flex h-11 w-11 items-center justify-center rounded-control border border-border bg-card text-foreground transition-colors duration-fast ease-move hover:bg-secondary disabled:pointer-events-none disabled:opacity-40 md:h-10 md:w-10';

export function DataTable<T>({
  data,
  columns,
  pageSize = 10,
  emptyMessage = 'No data available',
  labels = DEFAULT_LABELS,
  className = '',
}: DataTableProps<T>): JSX.Element {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{
    key: string | null;
    direction: 'asc' | 'desc';
  }>({
    key: null,
    direction: 'asc',
  });

  const handleSort = (key: string) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
    setCurrentPage(1);
  };

  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;

    return [...data].sort((a, b) => {
      // Columns sort on flat fields of the row.
      const aValue = (a as Record<string, any>)[sortConfig.key!];
      const bValue = (b as Record<string, any>)[sortConfig.key!];

      if (aValue === undefined || bValue === undefined) return 0;

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [data, sortConfig]);

  const totalPages = Math.ceil(sortedData.length / pageSize);
  const currentData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedData.slice(startIndex, startIndex + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const renderCell = (col: ColumnDef<T>, row: T) =>
    col.cell ? col.cell(row) : (row as Record<string, any>)[col.accessorKey as string];

  return (
    <div
      className={`w-full overflow-hidden rounded-card border border-border bg-card shadow-sm ${className}`}
    >
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full whitespace-nowrap text-left text-small">
          <thead className="border-b border-border bg-muted">
            <tr>
              {columns.map((col, idx) => {
                const key = col.accessorKey as string;
                const isSorted = sortConfig.key === key;
                const alignRight = col.align === 'right';
                return (
                  <th
                    key={idx}
                    scope="col"
                    aria-sort={
                      isSorted
                        ? sortConfig.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                    className={`px-4 py-3 font-medium text-muted-foreground first:pl-6 last:pr-6 ${alignRight ? 'text-right' : ''}`}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(key)}
                        className={`inline-flex items-center gap-1.5 rounded-control transition-colors duration-fast ease-move hover:text-foreground ${alignRight ? 'flex-row-reverse' : ''}`}
                      >
                        {col.header}
                        <span aria-hidden="true" className="flex flex-col">
                          <ChevronUp
                            className={`-mb-1 h-3 w-3 ${isSorted && sortConfig.direction === 'asc' ? 'text-foreground' : 'text-subtle-foreground/50'}`}
                            strokeWidth={2}
                          />
                          <ChevronDown
                            className={`h-3 w-3 ${isSorted && sortConfig.direction === 'desc' ? 'text-foreground' : 'text-subtle-foreground/50'}`}
                            strokeWidth={2}
                          />
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {currentData.length > 0 ? (
              currentData.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((col, colIndex) => (
                    <td
                      key={colIndex}
                      className={`px-4 py-3.5 tabular-nums text-foreground first:pl-6 last:pr-6 ${col.align === 'right' ? 'text-right' : ''}`}
                    >
                      {renderCell(col, row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-10 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Below sm each row becomes a stack of label and value. */}
      <div className="flex flex-col divide-y divide-border sm:hidden">
        {currentData.length > 0 ? (
          currentData.map((row, rowIndex) => (
            <dl key={rowIndex} className="flex flex-col gap-2 p-4">
              {columns.map((col, colIndex) => (
                <div key={colIndex} className="flex items-center justify-between gap-4 text-small">
                  <dt className="text-muted-foreground">{col.header}</dt>
                  <dd className="break-words text-right tabular-nums text-foreground">
                    {renderCell(col, row)}
                  </dd>
                </div>
              ))}
            </dl>
          ))
        ) : (
          <div className="px-6 py-10 text-center text-muted-foreground">{emptyMessage}</div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 border-t border-border bg-muted px-4 py-3 sm:px-6">
          <div className="text-small text-muted-foreground">
            {labels.page} <span className="font-medium text-foreground">{currentPage}</span>{' '}
            {labels.of} <span className="font-medium text-foreground">{totalPages}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={pagerButton}
              aria-label={labels.previous}
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className={pagerButton}
              aria-label={labels.next}
            >
              <ChevronRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
