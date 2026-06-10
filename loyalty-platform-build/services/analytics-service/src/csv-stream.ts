/**
 * Analytics Service — CSV streaming utilities
 *
 * Streams records as CSV lines for the bulk export endpoint.
 * Handles escaping, header generation, and async iteration.
 */

import { Readable, Transform } from 'stream';

/**
 * Escapes a CSV field value per RFC 4180.
 * - Wraps in quotes if the value contains comma, quote, or newline.
 * - Doubles any embedded quotes.
 */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Converts a record to a CSV row string.
 */
export function rowToCsv(row: Record<string, unknown>, columns: string[]): string {
  return columns.map((col) => csvEscape(row[col])).join(',');
}

/**
 * Creates a readable stream that converts an async iterable of records to CSV.
 * First line is the header row.
 */
export function createCsvStream(
  records: AsyncIterable<Record<string, unknown>>,
  columns: string[],
): Readable {
  const header = columns.join(',') + '\n';
  let headerSent = false;

  const transform = new Transform({
    objectMode: true,
    transform(chunk: Record<string, unknown>, _encoding, callback) {
      if (!headerSent) {
        this.push(header);
        headerSent = true;
      }
      this.push(rowToCsv(chunk, columns) + '\n');
      callback();
    },
  });

  // Pipe async iterable into the transform
  (async () => {
    try {
      for await (const record of records) {
        const canContinue = transform.write(record);
        if (!canContinue) {
          await new Promise<void>((resolve) => transform.once('drain', resolve));
        }
      }
      transform.end();
    } catch (err) {
      transform.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return transform;
}

/**
 * Default column sets for each exportable entity.
 */
export const EXPORT_COLUMNS: Record<string, string[]> = {
  members: ['id', 'firstName', 'lastName', 'status', 'tierId', 'pointsBalance', 'enrolledAt'],
  transactions: ['id', 'memberId', 'amountCents', 'channel', 'createdAt'],
  ledger: ['id', 'memberId', 'delta', 'balanceAfter', 'reason', 'createdAt'],
  redemptions: ['id', 'memberId', 'offerId', 'pointsUsed', 'redeemedAt'],
};
