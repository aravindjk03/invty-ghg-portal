import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  numeric?: boolean;
  width?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  selectedId?: string;
  onRowClick?: (item: T) => void;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  selectedId,
  onRowClick,
  className,
}: TableProps<T>) {
  return (
    <div className={twMerge('w-full overflow-x-auto rounded-lg border border-border bg-surface-raised', className)}>
      <table className="w-full text-left border-collapse">
        <thead className="sticky top-0 bg-surface border-b border-border z-10">
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                style={{ width: col.width }}
                className={clsx(
                  'h-11 px-4 text-[13px] font-semibold uppercase tracking-[0.04em] text-brand-muted select-none',
                  col.numeric || col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const id = keyExtractor(row);
            const isSelected = selectedId === id;

            return (
              <tr
                key={id}
                onClick={() => onRowClick && onRowClick(row)}
                className={clsx(
                  'h-11 border-b border-border transition-colors duration-150',
                  isSelected
                    ? 'bg-blue-100 border-l-[3px] border-l-blue-600'
                    : 'hover:bg-blue-50 cursor-pointer'
                )}
              >
                {columns.map((col, colIdx) => (
                  <td
                    key={colIdx}
                    className={clsx(
                      'px-4 text-[14px] text-brand-body',
                      col.numeric || col.align === 'right'
                        ? 'text-right font-mono tabular-nums'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    )}
                  >
                    {col.cell
                      ? col.cell(row)
                      : col.accessorKey
                      ? String(row[col.accessorKey] ?? '')
                      : null}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
