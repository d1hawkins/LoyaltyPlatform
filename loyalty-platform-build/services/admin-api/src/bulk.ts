/**
 * Partition a bulk action into manageable chunks.
 * Used by POST /v1/admin/members/bulk.
 */
export const BULK_MAX_IDS = 1000;
export const BULK_CHUNK_SIZE = 100;

export interface BulkPartition<T> {
  total: number;
  chunks: T[][];
}

export function partitionBulk<T>(
  items: T[],
  chunkSize: number = BULK_CHUNK_SIZE,
  max: number = BULK_MAX_IDS,
): BulkPartition<T> {
  if (items.length > max) {
    throw new Error(`bulk action exceeds maximum of ${max} ids (got ${items.length})`);
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return { total: items.length, chunks };
}
