'use client';

import React, { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

export interface ColumnDef<T> {
  header: string;
  accessorKey: keyof T | string;
  sortable?: boolean;
  cell?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  pageSize?: number;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T>({
  data,
  columns,
  pageSize = 10,
  emptyMessage = 'No data available',
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
    setCurrentPage(1); // Reset to first page on sort
  };

  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;

    return [...data].sort((a, b) => {
      // Cast explicitly since accessorKey can be nested or complex, but we assume flat for simplicity
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

  return (
    <div className={`w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      {/* Desktop Table View */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`px-6 py-4 font-medium text-gray-500 uppercase tracking-wider ${
                    col.sortable ? 'cursor-pointer select-none hover:bg-gray-100 transition-colors' : ''
                  }`}
                  onClick={() => col.sortable && handleSort(col.accessorKey as string)}
                >
                  <div className="flex items-center gap-2">
                    {col.header}
                    {col.sortable && (
                      <div className="flex flex-col">
                        <ChevronUp
                          className={`w-3 h-3 -mb-1 ${
                            sortConfig.key === col.accessorKey && sortConfig.direction === 'asc'
                              ? 'text-[#00D1FF]'
                              : 'text-gray-300'
                          }`}
                        />
                        <ChevronDown
                          className={`w-3 h-3 ${
                            sortConfig.key === col.accessorKey && sortConfig.direction === 'desc'
                              ? 'text-[#00D1FF]'
                              : 'text-gray-300'
                          }`}
                        />
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {currentData.length > 0 ? (
              currentData.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-gray-50/50 transition-colors duration-200">
                  {columns.map((col, colIndex) => (
                    <td key={colIndex} className="px-6 py-4 text-gray-900">
                      {col.cell ? col.cell(row) : (row as Record<string, any>)[col.accessorKey as string]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-6 py-8 text-center text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards View */}
      <div className="sm:hidden flex flex-col divide-y divide-gray-100">
        {currentData.length > 0 ? (
          currentData.map((row, rowIndex) => (
            <div key={rowIndex} className="p-4 flex flex-col gap-3 hover:bg-gray-50/50 transition-colors duration-200">
              {columns.map((col, colIndex) => (
                <div key={colIndex} className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">{col.header}</span>
                  <span className="text-gray-900 text-right break-words pl-4">
                    {col.cell ? col.cell(row) : (row as Record<string, any>)[col.accessorKey as string]}
                  </span>
                </div>
              ))}
            </div>
          ))
        ) : (
          <div className="px-6 py-8 text-center text-gray-400">
            {emptyMessage}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="text-sm text-gray-500">
            Page <span className="font-medium text-gray-900">{currentPage}</span> of{' '}
            <span className="font-medium text-gray-900">{totalPages}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg bg-white border border-gray-200 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              aria-label="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg bg-white border border-gray-200 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              aria-label="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
