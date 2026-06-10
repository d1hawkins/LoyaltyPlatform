import type { Response } from 'express';

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowToCsv(row: unknown[]): string {
  return row.map(csvEscape).join(',');
}

/**
 * Stream an async iterable of records as CSV to the Express response.
 */
export async function streamCsv(
  res: Response,
  filename: string,
  headers: string[],
  rows: AsyncIterable<Record<string, unknown>> | Iterable<Record<string, unknown>>,
): Promise<void> {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.write(rowToCsv(headers) + '\n');
  for await (const row of rows as AsyncIterable<Record<string, unknown>>) {
    res.write(rowToCsv(headers.map((h) => row[h])) + '\n');
  }
  res.end();
}
