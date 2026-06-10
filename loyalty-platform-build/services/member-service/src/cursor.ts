/** Opaque cursor = base64url(ledger_id). */
export function encodeCursor(ledgerId: string): string {
  return Buffer.from(ledgerId, 'utf8').toString('base64url');
}
export function decodeCursor(cursor: string): string {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    if (!decoded) throw new Error('empty');
    return decoded;
  } catch {
    throw new Error('invalid cursor');
  }
}
