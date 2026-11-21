import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A file name every browser keeps. Chrome discards a download name containing
 * characters such as the en dash in "FY 2025–26" and saves the file as
 * "download" with no extension, which then will not open.
 */
export function safeFilename(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFKD')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '');
  return (base || 'report') + ext;
}

/**
 * Makes a value safe to open in a spreadsheet as CSV.
 *
 * Excel, Sheets and LibreOffice evaluate a CSV cell that begins with =, +, -
 * or @ as a formula. A facility name or a factor source typed by someone else
 * — a supplier, an uploaded file — could therefore run a formula on the
 * machine of whoever opens the export. A leading apostrophe makes the cell
 * text. A plain number such as -12.5 is left alone, since that is a figure
 * and not a formula.
 *
 * The .xlsx exports do not need this: they store such a string as a text
 * cell, never as a formula.
 */
export function csvSafe(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^[+-]?\d+(\.\d+)?$/.test(text)) return `'${text}`;
  return text;
}
